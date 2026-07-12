#include "energy/EnergyAnalysisPass.h"
#include "energy/EnergyModel.h"

#include "llvm/ADT/StringRef.h"
#include "llvm/Analysis/OptimizationRemarkEmitter.h"
#include "llvm/CodeGen/MachineBasicBlock.h"
#include "llvm/CodeGen/MachineBlockFrequencyInfo.h"
#include "llvm/CodeGen/MachineFunction.h"
#include "llvm/CodeGen/MachineInstr.h"
#include "llvm/CodeGen/MachineLoopInfo.h"
#include "llvm/CodeGen/MachineOptimizationRemarkEmitter.h"
#include "llvm/CodeGen/TargetInstrInfo.h"
#include "llvm/IR/DebugLoc.h"
#include "llvm/IR/DebugInfoMetadata.h"
#include "llvm/InitializePasses.h"
#include "llvm/Pass.h"
#include "llvm/Support/CommandLine.h"
#include "llvm/Support/JSON.h"
#include "llvm/Support/Path.h"
#include "llvm/Support/raw_ostream.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <map>
#include <string>
#include <utility>
#include <vector>

using namespace llvm;

char EnergyAnalysisPass::ID = 0;

static cl::opt<std::string> EnergyModelPath(
    "energy-model",
    cl::desc("Path to the energy model JSON file for the energy pass"),
    cl::init(""));

namespace {

struct SourceLocationKey {
  std::string functionName;
  std::string file;
  unsigned line = 0;
  unsigned column = 0;

  bool operator<(const SourceLocationKey &other) const {
    return std::tie(functionName, file, line, column) <
           std::tie(other.functionName, other.file, other.line, other.column);
  }
};

struct SourceLocationSummary {
  double rawEnergy = 0.0;
  double weightedEnergy = 0.0;
  unsigned instructionCount = 0;
  std::map<std::string, double> opcodeWeightedEnergy;
};

// A single machine instruction as shown inside a CFG node in the UI.
struct InstructionDetail {
  std::string opcode;
  std::string bucket;
  double cost = 0.0;
  unsigned line = 0;
};

// Cap on the instructions carried per block so a large function cannot blow up
// the JSON payload; the UI shows a "+N more" hint when truncated.
constexpr std::size_t MaxReportedInstructions = 40;

struct BlockSummary {
  std::string blockName;
  int number = 0;
  double rawEnergy = 0.0;
  double weightedEnergy = 0.0;
  double frequencyWeight = 1.0;
  unsigned loopDepth = 0;
  bool isLoopHeader = false;
  unsigned instructionCount = 0;
  unsigned mappedInstructionCount = 0;
  unsigned fallbackInstructionCount = 0;
  std::string file;
  unsigned line = 0;
  unsigned column = 0;
  unsigned endLine = 0;
  std::vector<int> successors;
  std::vector<InstructionDetail> instructions;
  std::map<std::string, double> opcodeWeightedEnergy;
};

struct FunctionSummary {
  std::string functionName;
  double rawEnergy = 0.0;
  double weightedEnergy = 0.0;
  unsigned blockCount = 0;
  unsigned instructionCount = 0;
  unsigned mappedInstructionCount = 0;
  unsigned fallbackInstructionCount = 0;
  std::string frequencyModel;
};

// Machine basic blocks usually lose their IR names at -O2, so fall back to the
// MIR-style %bb.N label the block number gives us.
std::string displayBlockName(const BlockSummary &blockSummary) {
  if (!blockSummary.blockName.empty()) {
    return blockSummary.blockName;
  }
  return "%bb." + std::to_string(blockSummary.number);
}

std::string getOpcodeName(const MachineInstr &instruction) {
  if (const auto *block = instruction.getParent()) {
    if (const auto *function = block->getParent()) {
      if (const auto *instrInfo = function->getSubtarget().getInstrInfo()) {
        return instrInfo->getName(instruction.getOpcode()).str();
      }
    }
  }
  return "UNKNOWN";
}

double roundTo(double value, unsigned places = 6) {
  const double scale = std::pow(10.0, static_cast<double>(places));
  return std::round(value * scale) / scale;
}

// Expected executions of a block per call of its function. LLVM stores block
// frequencies as integers scaled against the entry block, so dividing by the
// entry frequency recovers the ratio: 1.0 for straight-line code, >1 inside a
// loop, <1 behind a conditional branch.
double relativeBlockFrequency(BlockFrequency blockFrequency,
                              double entryFrequency) {
  if (entryFrequency <= 0.0) {
    return 1.0;
  }
  return roundTo(static_cast<double>(blockFrequency.getFrequency()) /
                     entryFrequency,
                 3);
}

std::string getSourceFilePath(const DILocation *location) {
  if (location == nullptr) {
    return {};
  }

  std::string filename = location->getFilename().str();
  const std::string directory = location->getDirectory().str();
  if (filename.empty()) {
    return {};
  }

  if (!directory.empty() && !sys::path::is_absolute(filename)) {
    SmallString<256> path(directory);
    sys::path::append(path, filename);
    return std::string(path.str());
  }
  return filename;
}

std::vector<std::string>
collectTopOpcodes(const std::map<std::string, double> &opcodeWeightedEnergy,
                  std::size_t limit = 3) {
  std::vector<std::pair<std::string, double>> ranked(opcodeWeightedEnergy.begin(),
                                                     opcodeWeightedEnergy.end());
  std::sort(ranked.begin(), ranked.end(),
            [](const auto &left, const auto &right) {
              if (left.second != right.second) {
                return left.second > right.second;
              }
              return left.first < right.first;
            });

  std::vector<std::string> topOpcodes;
  topOpcodes.reserve(std::min(limit, ranked.size()));
  for (std::size_t index = 0; index < ranked.size() && index < limit; ++index) {
    topOpcodes.push_back(ranked[index].first);
  }
  return topOpcodes;
}

void emitEnergyRecord(json::Object object) {
  errs() << "[energy] " << json::Value(std::move(object)) << "\n";
}

} // namespace

INITIALIZE_PASS_BEGIN(
    EnergyAnalysisPass,
    "energy",
    "Machine-level energy estimation pass",
    false,
    true)
INITIALIZE_PASS_DEPENDENCY(MachineBlockFrequencyInfo)
INITIALIZE_PASS_DEPENDENCY(MachineLoopInfo)
INITIALIZE_PASS_DEPENDENCY(MachineOptimizationRemarkEmitterPass)
INITIALIZE_PASS_END(
    EnergyAnalysisPass,
    "energy",
    "Machine-level energy estimation pass",
    false,
    true)

EnergyAnalysisPass::EnergyAnalysisPass() : MachineFunctionPass(ID) {}

void EnergyAnalysisPass::getAnalysisUsage(AnalysisUsage &analysisUsage) const {
  MachineFunctionPass::getAnalysisUsage(analysisUsage);
  analysisUsage.addRequired<MachineBlockFrequencyInfo>();
  analysisUsage.addRequired<MachineLoopInfo>();
  analysisUsage.addRequired<MachineOptimizationRemarkEmitterPass>();
  analysisUsage.setPreservesAll();
}

bool EnergyAnalysisPass::runOnMachineFunction(MachineFunction &machineFunction) {
  const energy::EnergyModel model =
      energy::EnergyModel::loadOrCreateDefault(EnergyModelPath);

  // Static execution-frequency model. LLVM's MachineBlockFrequencyInfo
  // propagates branch probabilities through the CFG, so a block's weight is its
  // expected execution count relative to one call of the function: loop bodies
  // scale up (a back edge is taken ~97% of the time, implying ~32 iterations),
  // and blocks behind a conditional branch are discounted rather than costed as
  // if they always run.
  //
  // It has one precondition: real branch probabilities. At -O0 clang marks every
  // function optnone and SelectionDAG never runs branch-probability analysis, so
  // every branch is left at a flat 50/50 — which says a loop iterates twice, and
  // would rank loop bodies barely above straight-line code. There we fall back
  // to the loop-depth heuristic (depth d -> 10^d, the Ball & Larus static
  // profiler estimate): still an assumption, but a deliberate one.
  const bool hasBranchProbabilities =
      !machineFunction.getFunction().hasOptNone();
  const MachineBlockFrequencyInfo &blockFrequencyInfo =
      getAnalysis<MachineBlockFrequencyInfo>();
  const MachineLoopInfo &loopInfo = getAnalysis<MachineLoopInfo>();
  MachineOptimizationRemarkEmitter &ORE =
      getAnalysis<MachineOptimizationRemarkEmitterPass>().getORE();

  const double entryFrequency =
      static_cast<double>(blockFrequencyInfo.getEntryFreq().getFrequency());

  FunctionSummary functionSummary;
  functionSummary.functionName = machineFunction.getName().str();
  functionSummary.blockCount = static_cast<unsigned>(machineFunction.size());
  functionSummary.frequencyModel =
      hasBranchProbabilities ? "block-frequency" : "loop-depth";
  std::vector<BlockSummary> blockSummaries;
  std::map<SourceLocationKey, SourceLocationSummary> sourceSummaries;

  for (const MachineBasicBlock &block : machineFunction) {
    BlockSummary blockSummary;
    blockSummary.blockName = block.getName().str();
    blockSummary.number = block.getNumber();
    blockSummary.loopDepth = loopInfo.getLoopDepth(&block);
    blockSummary.isLoopHeader = loopInfo.isLoopHeader(&block);
    blockSummary.frequencyWeight =
        hasBranchProbabilities
            ? relativeBlockFrequency(blockFrequencyInfo.getBlockFreq(&block),
                                     entryFrequency)
            : std::pow(10.0, static_cast<double>(blockSummary.loopDepth));

    for (const MachineBasicBlock *successor : block.successors()) {
      blockSummary.successors.push_back(successor->getNumber());
    }

    for (const MachineInstr &instruction : block) {
      // Meta-instructions (DBG_VALUE, KILL, IMPLICIT_DEF, CFI_INSTRUCTION, ...)
      // carry no machine code into the binary, so they cost no energy.
      if (instruction.isMetaInstruction()) {
        continue;
      }

      const energy::InstructionEnergy instructionEnergy =
          model.classify(instruction);
      const double weightedInstructionEnergy =
          instructionEnergy.cost * blockSummary.frequencyWeight;
      const std::string opcodeName = getOpcodeName(instruction);
      blockSummary.opcodeWeightedEnergy[opcodeName] += weightedInstructionEnergy;

      ++blockSummary.instructionCount;
      ++functionSummary.instructionCount;
      blockSummary.rawEnergy += instructionEnergy.cost;
      blockSummary.weightedEnergy += weightedInstructionEnergy;
      functionSummary.rawEnergy += instructionEnergy.cost;
      functionSummary.weightedEnergy += weightedInstructionEnergy;

      if (instructionEnergy.usedDefaultFallback) {
        ++blockSummary.fallbackInstructionCount;
        ++functionSummary.fallbackInstructionCount;
      } else {
        ++blockSummary.mappedInstructionCount;
        ++functionSummary.mappedInstructionCount;
      }

      const DebugLoc &debugLocation = instruction.getDebugLoc();
      const DILocation *location = debugLocation.get();
      const unsigned instructionLine =
          (location != nullptr) ? location->getLine() : 0;

      if (blockSummary.instructions.size() < MaxReportedInstructions) {
        blockSummary.instructions.push_back(InstructionDetail{
            opcodeName,
            instructionEnergy.bucket,
            roundTo(instructionEnergy.cost),
            instructionLine,
        });
      }

      if (location == nullptr || instructionLine == 0) {
        continue;
      }

      if (blockSummary.line == 0) {
        blockSummary.file = getSourceFilePath(location);
        blockSummary.line = instructionLine;
        blockSummary.column = location->getColumn();
      }
      blockSummary.line = std::min(blockSummary.line, instructionLine);
      blockSummary.endLine = std::max(blockSummary.endLine, instructionLine);

      SourceLocationKey key;
      key.functionName = functionSummary.functionName;
      key.file = getSourceFilePath(location);
      key.line = instructionLine;
      key.column = location->getColumn();
      if (key.file.empty()) {
        continue;
      }

      auto &sourceSummary = sourceSummaries[key];
      sourceSummary.rawEnergy += instructionEnergy.cost;
      sourceSummary.weightedEnergy += weightedInstructionEnergy;
      ++sourceSummary.instructionCount;
      sourceSummary.opcodeWeightedEnergy[opcodeName] += weightedInstructionEnergy;
    }

    blockSummary.rawEnergy = roundTo(blockSummary.rawEnergy);
    blockSummary.weightedEnergy = roundTo(blockSummary.weightedEnergy);
    blockSummary.frequencyWeight = roundTo(blockSummary.frequencyWeight);
    blockSummaries.push_back(std::move(blockSummary));
  }

  functionSummary.rawEnergy = roundTo(functionSummary.rawEnergy);
  functionSummary.weightedEnergy = roundTo(functionSummary.weightedEnergy);

  // Emit LLVM optimization remark so -pass-remarks-analysis=energy works.
  {
    DebugLoc DL;
    if (auto *SP = machineFunction.getFunction().getSubprogram()) {
      DL = DILocation::get(SP->getContext(), SP->getLine(), 0, SP);
    }
    MachineOptimizationRemarkAnalysis FnRemark("energy", "FunctionEnergy",
                                               DL, &machineFunction.front());
    FnRemark << "function " << ore::NV("Function", functionSummary.functionName)
             << " weighted-energy="
             << ore::NV("WeightedEnergy",
                        static_cast<float>(functionSummary.weightedEnergy))
             << " raw-energy="
             << ore::NV("RawEnergy",
                        static_cast<float>(functionSummary.rawEnergy))
             << " instructions="
             << ore::NV("InstructionCount",
                        functionSummary.instructionCount);
    ORE.emit(FnRemark);
  }

  // Emit per-block remarks for loop-weighted hot blocks.
  for (const BlockSummary &blockSummary : blockSummaries) {
    if (blockSummary.frequencyWeight <= 1.0 || blockSummary.weightedEnergy == 0.0)
      continue;
    DebugLoc BlockDL;
    const MachineBasicBlock *MBB = nullptr;
    for (const MachineBasicBlock &B : machineFunction) {
      if (B.getNumber() == blockSummary.number) {
        MBB = &B;
        break;
      }
    }
    MachineOptimizationRemarkAnalysis BlockRemark("energy", "HotBlock",
                                                  BlockDL,
                                                  MBB ? MBB : &machineFunction.front());
    BlockRemark << "block " << ore::NV("Block", displayBlockName(blockSummary))
                << " freq-weight="
                << ore::NV("FrequencyWeight",
                           static_cast<float>(blockSummary.frequencyWeight))
                << " weighted-energy="
                << ore::NV("WeightedEnergy",
                           static_cast<float>(blockSummary.weightedEnergy));
    ORE.emit(BlockRemark);
  }

  emitEnergyRecord(json::Object{
      {"kind", "function"},
      {"function", functionSummary.functionName},
      {"rawEnergy", functionSummary.rawEnergy},
      {"weightedEnergy", functionSummary.weightedEnergy},
      {"blockCount", functionSummary.blockCount},
      {"instructionCount", functionSummary.instructionCount},
      {"mappedInstructionCount", functionSummary.mappedInstructionCount},
      {"fallbackInstructionCount", functionSummary.fallbackInstructionCount},
      {"frequencyModel", functionSummary.frequencyModel},
  });

  for (const BlockSummary &blockSummary : blockSummaries) {
    json::Array successors;
    for (const int successor : blockSummary.successors) {
      successors.push_back(successor);
    }

    json::Array topOpcodes;
    for (const std::string &opcode :
         collectTopOpcodes(blockSummary.opcodeWeightedEnergy)) {
      topOpcodes.push_back(opcode);
    }

    json::Array instructions;
    for (const InstructionDetail &detail : blockSummary.instructions) {
      instructions.push_back(json::Object{
          {"opcode", detail.opcode},
          {"bucket", detail.bucket},
          {"cost", detail.cost},
          {"line", detail.line},
      });
    }

    emitEnergyRecord(json::Object{
        {"kind", "block"},
        {"function", functionSummary.functionName},
        {"block", blockSummary.blockName},
        {"number", blockSummary.number},
        {"successors", std::move(successors)},
        {"rawEnergy", blockSummary.rawEnergy},
        {"weightedEnergy", blockSummary.weightedEnergy},
        {"frequencyWeight", blockSummary.frequencyWeight},
        {"loopDepth", blockSummary.loopDepth},
        {"isLoopHeader", blockSummary.isLoopHeader},
        {"instructionCount", blockSummary.instructionCount},
        {"mappedInstructionCount", blockSummary.mappedInstructionCount},
        {"fallbackInstructionCount", blockSummary.fallbackInstructionCount},
        {"file", blockSummary.file},
        {"line", blockSummary.line},
        {"column", blockSummary.column},
        {"endLine", blockSummary.endLine},
        {"topOpcodes", std::move(topOpcodes)},
        {"instructions", std::move(instructions)},
        {"instructionsTruncated",
         blockSummary.instructionCount >
             static_cast<unsigned>(blockSummary.instructions.size())},
    });
  }

  for (const auto &[location, sourceSummary] : sourceSummaries) {
    json::Array topOpcodes;
    for (const std::string &opcode :
         collectTopOpcodes(sourceSummary.opcodeWeightedEnergy)) {
      topOpcodes.push_back(opcode);
    }

    emitEnergyRecord(json::Object{
        {"kind", "line"},
        {"function", location.functionName},
        {"file", location.file},
        {"line", location.line},
        {"column", location.column},
        {"rawEnergy", roundTo(sourceSummary.rawEnergy)},
        {"weightedEnergy", roundTo(sourceSummary.weightedEnergy)},
        {"instructionCount", sourceSummary.instructionCount},
        {"topOpcodes", std::move(topOpcodes)},
    });
  }

  return false;
}

FunctionPass *llvm::createEnergyAnalysisPass() {
  return new EnergyAnalysisPass();
}

namespace {
struct RegisterEnergyAnalysisPass {
  RegisterEnergyAnalysisPass() {
    initializeEnergyAnalysisPassPass(*PassRegistry::getPassRegistry());
  }
} registerEnergyAnalysisPass;
} // namespace
