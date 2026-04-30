#pragma once

#include "llvm/ADT/StringRef.h"

#include <string>
#include <unordered_map>

namespace llvm {
class MachineInstr;
}

namespace energy {

struct InstructionEnergy {
  double cost = 0.0;
  std::string bucket;
  bool usedDefaultFallback = false;
};

class EnergyModel final {
public:
  static EnergyModel loadOrCreateDefault(llvm::StringRef modelPath);

  InstructionEnergy classify(const llvm::MachineInstr &instruction) const;

private:
  double DefaultFallbackCost = 1.0;
  std::unordered_map<std::string, double> BucketCosts;
  std::unordered_map<std::string, std::string> OpcodeAliases;

  double lookupBucketCost(llvm::StringRef bucket) const;
};

} // namespace energy
