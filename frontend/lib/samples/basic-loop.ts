import type { SampleProgram } from "./types";

export const basicLoop: SampleProgram = {
  id: "basic-loop",
  label: "Sum of squares",
  description: "Single loop, single function — a minimal hotspot to sanity-check the analysis.",
  tier: "Basic",
  complexity: 1,
  code: `#include <cstdio>

long long sumOfSquares(int count) {
  long long total = 0;
  for (int i = 0; i < count; ++i) {
    total += static_cast<long long>(i) * i;
  }
  return total;
}

int main() {
  long long total = sumOfSquares(100000);
  return static_cast<int>(total % 1000);
}
`,
};
