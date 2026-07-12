import type { SampleProgram } from "./types";

export const straightLine: SampleProgram = {
  id: "straight-line",
  label: "Straight-line arithmetic",
  description: "No branches, no loops, no functions — a single basic block baseline.",
  tier: "Basic",
  complexity: 0,
  code: `int main() {
  int a = 2;
  int b = 3;
  int c = a + b;
  int d = c * a;
  return d;
}
`,
};
