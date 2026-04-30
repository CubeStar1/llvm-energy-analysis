#pragma once

#include "llvm/CodeGen/MachineFunctionPass.h"

namespace llvm {

class MachineFunction;
class PassRegistry;

class EnergyAnalysisPass final : public MachineFunctionPass {
public:
  static char ID;

  EnergyAnalysisPass();

  bool runOnMachineFunction(MachineFunction &machineFunction) override;
  void getAnalysisUsage(AnalysisUsage &analysisUsage) const override;
};

FunctionPass *createEnergyAnalysisPass();
void initializeEnergyAnalysisPassPass(PassRegistry &registry);

} // namespace llvm
