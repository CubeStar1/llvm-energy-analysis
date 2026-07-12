import type { SampleProgram } from "./types";

export const simpleIf: SampleProgram = {
  id: "simple-if",
  label: "Simple if/else",
  description: "One branch, no loops, no functions — a two-way split baseline.",
  tier: "Basic",
  complexity: 0,
  code: `int main() {
  int x = 7;
  int y;

  if (x > 5) {
    y = 1;
  } else {
    y = 0;
  }

  return y;
}
`,
};
