import type { SampleProgram } from "./types";

export const simpleWhile: SampleProgram = {
  id: "simple-while",
  label: "Simple while loop",
  description: "One loop, no branches, no functions — a single back-edge baseline.",
  tier: "Basic",
  complexity: 0,
  code: `int main() {
  int i = 0;
  int total = 0;

  while (i < 10) {
    total = total + i;
    i = i + 1;
  }

  return total;
}
`,
};
