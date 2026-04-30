#include "energy/EnergyModel.h"

#include "llvm/CodeGen/MachineBasicBlock.h"
#include "llvm/CodeGen/MachineFunction.h"
#include "llvm/CodeGen/MachineInstr.h"
#include "llvm/CodeGen/TargetInstrInfo.h"
#include "llvm/Support/JSON.h"
#include "llvm/Support/MemoryBuffer.h"
#include "llvm/Support/raw_ostream.h"

#include <string>
#include <utility>

using namespace llvm;

namespace energy {

namespace {

constexpr llvm::StringLiteral kIntegerAluBucket = "integer_alu";
constexpr llvm::StringLiteral kLoadBucket = "load";
constexpr llvm::StringLiteral kStoreBucket = "store";
constexpr llvm::StringLiteral kBranchBucket = "branch";
constexpr llvm::StringLiteral kCallBucket = "call";
constexpr llvm::StringLiteral kCompareBucket = "compare";
constexpr llvm::StringLiteral kFpVectorBucket = "fp_or_vector_fallback";

bool containsUppercaseToken(StringRef text, StringRef token) {
  return text.upper().find(token.upper()) != std::string::npos;
}

std::string classifyFallbackBucket(const MachineInstr &instruction,
                                   StringRef opcodeName) {
  if (instruction.isCall()) {
    return std::string(kCallBucket);
  }
  if (instruction.isBranch()) {
    return std::string(kBranchBucket);
  }
  if (instruction.mayLoad()) {
    return std::string(kLoadBucket);
  }
  if (instruction.mayStore()) {
    return std::string(kStoreBucket);
  }
  if (containsUppercaseToken(opcodeName, "CMP") ||
      containsUppercaseToken(opcodeName, "TEST")) {
    return std::string(kCompareBucket);
  }
  if (containsUppercaseToken(opcodeName, "XMM") ||
      containsUppercaseToken(opcodeName, "YMM") ||
      containsUppercaseToken(opcodeName, "ZMM") ||
      containsUppercaseToken(opcodeName, "MMX") ||
      containsUppercaseToken(opcodeName, "FP") ||
      containsUppercaseToken(opcodeName, "FADD") ||
      containsUppercaseToken(opcodeName, "FMUL") ||
      containsUppercaseToken(opcodeName, "FDIV")) {
    return std::string(kFpVectorBucket);
  }
  return std::string(kIntegerAluBucket);
}

} // namespace

EnergyModel EnergyModel::loadOrCreateDefault(StringRef modelPath) {
  EnergyModel model;
  model.DefaultFallbackCost = 1.0;
  model.BucketCosts = {
      {std::string(kIntegerAluBucket), 1.0},
      {std::string(kLoadBucket), 2.0},
      {std::string(kStoreBucket), 2.2},
      {std::string(kBranchBucket), 1.6},
      {std::string(kCallBucket), 3.0},
      {std::string(kCompareBucket), 1.2},
      {std::string(kFpVectorBucket), 2.8},
  };

  if (modelPath.empty()) {
    errs() << "[energy] energy model path not provided, using compiled defaults\n";
    return model;
  }

  auto bufferOrError = MemoryBuffer::getFile(modelPath);
  if (!bufferOrError) {
    errs() << "[energy] failed to read energy model at " << modelPath
           << ", using compiled defaults\n";
    return model;
  }

  auto parsed = json::parse(bufferOrError.get()->getBuffer());
  if (!parsed) {
    errs() << "[energy] failed to parse energy model JSON at " << modelPath
           << ", using compiled defaults\n";
    return model;
  }

  auto *root = parsed->getAsObject();
  if (root == nullptr) {
    errs() << "[energy] invalid energy model root at " << modelPath
           << ", using compiled defaults\n";
    return model;
  }

  if (auto fallbackCost = root->getNumber("defaultFallbackCost")) {
    model.DefaultFallbackCost = *fallbackCost;
  }

  if (auto *bucketObject = root->getObject("opcodeBuckets")) {
    for (const auto &entry : *bucketObject) {
      if (auto cost = entry.second.getAsNumber()) {
        model.BucketCosts[entry.first.str()] = *cost;
      }
    }
  }

  if (auto *aliasObject = root->getObject("opcodeAliases")) {
    for (const auto &entry : *aliasObject) {
      if (auto bucket = entry.second.getAsString()) {
        model.OpcodeAliases.emplace(entry.first.str(), bucket->str());
      }
    }
  }

  return model;
}

InstructionEnergy EnergyModel::classify(const MachineInstr &instruction) const {
  std::string opcodeName = "UNKNOWN";
  if (const auto *block = instruction.getParent()) {
    if (const auto *function = block->getParent()) {
      if (const auto *instrInfo = function->getSubtarget().getInstrInfo()) {
        opcodeName = instrInfo->getName(instruction.getOpcode()).str();
      }
    }
  }

  if (const auto aliasIt = OpcodeAliases.find(opcodeName);
      aliasIt != OpcodeAliases.end()) {
    InstructionEnergy energy;
    energy.cost = lookupBucketCost(aliasIt->second);
    energy.bucket = aliasIt->second;
    energy.usedDefaultFallback = false;
    return energy;
  }

  const std::string inferredBucket =
      classifyFallbackBucket(instruction, StringRef(opcodeName));
  const double inferredCost = lookupBucketCost(inferredBucket);
  const bool usedFallback = BucketCosts.find(inferredBucket) == BucketCosts.end();

  InstructionEnergy energy;
  energy.cost = usedFallback ? DefaultFallbackCost : inferredCost;
  energy.bucket = inferredBucket;
  energy.usedDefaultFallback = usedFallback;
  return energy;
}

double EnergyModel::lookupBucketCost(StringRef bucket) const {
  if (const auto bucketIt = BucketCosts.find(bucket.str());
      bucketIt != BucketCosts.end()) {
    return bucketIt->second;
  }
  return DefaultFallbackCost;
}

} // namespace energy
