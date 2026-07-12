import type { SampleProgram } from "./types";

export const quicksort: SampleProgram = {
  id: "quicksort",
  label: "Quicksort",
  description: "Recursive, branch-heavy partitioning — energy shifts between recursion and partition.",
  tier: "Advanced",
  complexity: 5,
  code: `#include <utility>
#include <vector>

int partition(std::vector<int>& values, int low, int high) {
  int pivot = values[high];
  int i = low - 1;

  for (int j = low; j < high; ++j) {
    if (values[j] < pivot) {
      ++i;
      std::swap(values[i], values[j]);
    }
  }

  std::swap(values[i + 1], values[high]);
  return i + 1;
}

void quicksort(std::vector<int>& values, int low, int high) {
  if (low >= high) {
    return;
  }

  int pivotIndex = partition(values, low, high);
  quicksort(values, low, pivotIndex - 1);
  quicksort(values, pivotIndex + 1, high);
}

int main() {
  std::vector<int> values(2048);
  unsigned seed = 88172645u;
  for (int& value : values) {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    value = static_cast<int>(seed % 10000);
  }

  quicksort(values, 0, static_cast<int>(values.size()) - 1);

  return values.front() + values.back();
}
`,
};
