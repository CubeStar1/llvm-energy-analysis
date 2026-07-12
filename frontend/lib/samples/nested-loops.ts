import type { SampleProgram } from "./types";

export const nestedLoops: SampleProgram = {
  id: "nested-loops",
  label: "Bubble sort",
  description: "O(n^2) nested loops split across two functions — a clearer hotspot to locate.",
  tier: "Basic",
  complexity: 2,
  code: `#include <utility>
#include <vector>

void bubbleSort(std::vector<int>& values) {
  for (std::size_t i = 0; i < values.size(); ++i) {
    for (std::size_t j = 0; j + 1 < values.size() - i; ++j) {
      if (values[j] > values[j + 1]) {
        std::swap(values[j], values[j + 1]);
      }
    }
  }
}

int main() {
  std::vector<int> values(512);
  for (std::size_t i = 0; i < values.size(); ++i) {
    values[i] = static_cast<int>((i * 2654435761u) % 4096);
  }

  bubbleSort(values);

  return values.front() + values.back();
}
`,
};
