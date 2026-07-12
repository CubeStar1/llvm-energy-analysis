import type { SampleProgram } from "./types";

export const basicLoop: SampleProgram = {
  id: "basic-loop",
  label: "Sum of squares",
  description: "Single loop, no functions — a minimal hotspot to sanity-check the analysis.",
  tier: "Basic",
  complexity: 1,
  code: `int main() {
  int total = 0;

  for (int i = 0; i < 100; i = i + 1) {
    total = total + i * i;
  }

  return total;
}
`,
};
