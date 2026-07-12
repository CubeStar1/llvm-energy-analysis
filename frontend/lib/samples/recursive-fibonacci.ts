import type { SampleProgram } from "./types";

export const recursiveFibonacci: SampleProgram = {
  id: "recursive-fibonacci",
  label: "Recursive Fibonacci",
  description: "Naive recursion — highlights call overhead energy versus the loop-based samples.",
  tier: "Intermediate",
  complexity: 3,
  code: `long long fibonacci(int n) {
  if (n < 2) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
  long long result = 0;
  for (int i = 0; i < 28; ++i) {
    result += fibonacci(i % 24);
  }
  return static_cast<int>(result % 100000);
}
`,
};
