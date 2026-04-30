#include "energy/EnergyAnalysisPass.h"

#include "llvm/ADT/StringRef.h"
#include "llvm/Analysis/OptimizationRemarkEmitter.h"
#include "llvm/CodeGen/MachineBasicBlock.h"
#include "llvm/CodeGen/MachineFunction.h"
#include "llvm/CodeGen/MachineInstr.h"
#include "llvm/IR/DebugLoc.h"
#include "llvm/InitializePasses.h"
#include "llvm/Pass.h"
#include "llvm/Support/FormatVariadic.h"

using namespace llvm;

char EnergyAnalysisPass::ID = 0;

namespace {

double estimateInstructionEnergy(const MachineInstr &instruction) {
  if (instruction.mayLoad()) {
    return 2.0;
  }
  if (instruction.mayStore()) {
    return 2.2;
  }
  if (instruction.isBranch()) {
    return 1.6;
  }
  if (instruction.isCall()) {
    return 3.0;
  }
  return 1.0;
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
  double totalWeightedEnergy = 0.0;
  for (const MachineBasicBlock &block : machineFunction) {
    double blockEnergy = 0.0;
    for (const MachineInstr &instruction : block) {
      blockEnergy += estimateInstructionEnergy(instruction);
    }

    // Keep the scaffold buildable across LLVM 18 package variants first.
    // MBFI-based weighting can be added back once the Linux toolchain setup is
    // stable and verified end-to-end.
    totalWeightedEnergy += blockEnergy;
  }

  // This is intentionally minimal for the scaffold. The next step in WSL is to
  // replace the coarse estimator with JSON-backed opcode costs and emit proper
  // optimization remarks with source locations.
  errs() << formatv(
      "[energy] function={0} weighted-energy={1:F2}\n",
      machineFunction.getName(),
      totalWeightedEnergy);

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
