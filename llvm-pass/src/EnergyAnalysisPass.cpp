#include "energy/EnergyAnalysisPass.h"
#include "energy/EnergyModel.h"

#include "llvm/ADT/StringRef.h"
#include "llvm/CodeGen/MachineBasicBlock.h"
#include "llvm/CodeGen/MachineFunction.h"
#include "llvm/CodeGen/MachineInstr.h"
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

struct BlockSummary {
  std::string blockName;
  double rawEnergy = 0.0;
  double weightedEnergy = 0.0;
  double frequencyWeight = 1.0;
  unsigned instructionCount = 0;
  unsigned mappedInstructionCount = 0;
  unsigned fallbackInstructionCount = 0;
  std::string file;
  unsigned line = 0;
  unsigned column = 0;
};

struct FunctionSummary {
  std::string functionName;
  double rawEnergy = 0.0;
  double weightedEnergy = 0.0;
  unsigned blockCount = 0;
  unsigned instructionCount = 0;
  unsigned mappedInstructionCount = 0;
  unsigned fallbackInstructionCount = 0;
};

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
INITIALIZE_PASS_END(
    EnergyAnalysisPass,
    "energy",
    "Machine-level energy estimation pass",
    false,
    true)

EnergyAnalysisPass::EnergyAnalysisPass() : MachineFunctionPass(ID) {}

void EnergyAnalysisPass::getAnalysisUsage(AnalysisUsage &analysisUsage) const {
  MachineFunctionPass::getAnalysisUsage(analysisUsage);
  analysisUsage.setPreservesAll();
}

bool EnergyAnalysisPass::runOnMachineFunction(MachineFunction &machineFunction) {
  const energy::EnergyModel model =
      energy::EnergyModel::loadOrCreateDefault(EnergyModelPath);

  FunctionSummary functionSummary;
  functionSummary.functionName = machineFunction.getName().str();
  functionSummary.blockCount = static_cast<unsigned>(machineFunction.size());
  std::vector<BlockSummary> blockSummaries;
  std::map<SourceLocationKey, SourceLocationSummary> sourceSummaries;

  for (const MachineBasicBlock &block : machineFunction) {
    BlockSummary blockSummary;
    blockSummary.blockName = block.getName().str();
    // LLVM 18 no longer exposes the legacy MBFI wrapper used by the earlier
    // scaffold in this pass shape, so we currently keep weighted energy equal
    // to raw energy until we reintroduce frequency data through a compatible
    // analysis path.
    blockSummary.frequencyWeight = 1.0;

    for (const MachineInstr &instruction : block) {
      const energy::InstructionEnergy instructionEnergy =
          model.classify(instruction);
      const double weightedInstructionEnergy =
          instructionEnergy.cost * blockSummary.frequencyWeight;

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
      if (location == nullptr || location->getLine() == 0) {
        continue;
      }

      if (blockSummary.file.empty()) {
        blockSummary.file = getSourceFilePath(location);
        blockSummary.line = location->getLine();
        blockSummary.column = location->getColumn();
      }

      SourceLocationKey key;
      key.functionName = functionSummary.functionName;
      key.file = getSourceFilePath(location);
      key.line = location->getLine();
      key.column = location->getColumn();
      if (key.file.empty()) {
        continue;
      }

      auto &sourceSummary = sourceSummaries[key];
      sourceSummary.rawEnergy += instructionEnergy.cost;
      sourceSummary.weightedEnergy += weightedInstructionEnergy;
      ++sourceSummary.instructionCount;
      sourceSummary.opcodeWeightedEnergy[getOpcodeName(instruction)] +=
          weightedInstructionEnergy;
    }

    blockSummary.rawEnergy = roundTo(blockSummary.rawEnergy);
    blockSummary.weightedEnergy = roundTo(blockSummary.weightedEnergy);
    blockSummary.frequencyWeight = roundTo(blockSummary.frequencyWeight);
    blockSummaries.push_back(std::move(blockSummary));
  }

  functionSummary.rawEnergy = roundTo(functionSummary.rawEnergy);
  functionSummary.weightedEnergy = roundTo(functionSummary.weightedEnergy);

  emitEnergyRecord(json::Object{
      {"kind", "function"},
      {"function", functionSummary.functionName},
      {"rawEnergy", functionSummary.rawEnergy},
      {"weightedEnergy", functionSummary.weightedEnergy},
      {"blockCount", functionSummary.blockCount},
      {"instructionCount", functionSummary.instructionCount},
      {"mappedInstructionCount", functionSummary.mappedInstructionCount},
      {"fallbackInstructionCount", functionSummary.fallbackInstructionCount},
  });

  for (const BlockSummary &blockSummary : blockSummaries) {
    emitEnergyRecord(json::Object{
        {"kind", "block"},
        {"function", functionSummary.functionName},
        {"block", blockSummary.blockName},
        {"rawEnergy", blockSummary.rawEnergy},
        {"weightedEnergy", blockSummary.weightedEnergy},
        {"frequencyWeight", blockSummary.frequencyWeight},
        {"instructionCount", blockSummary.instructionCount},
        {"mappedInstructionCount", blockSummary.mappedInstructionCount},
        {"fallbackInstructionCount", blockSummary.fallbackInstructionCount},
        {"file", blockSummary.file},
        {"line", blockSummary.line},
        {"column", blockSummary.column},
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
