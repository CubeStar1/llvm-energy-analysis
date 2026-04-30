export const DEFAULT_SOURCE_CODE = `#include <vector>
#include <numeric>

int main() {
  std::vector<int> values(4096, 3);
  int total = 0;

  for (int i = 0; i < static_cast<int>(values.size()); ++i) {
    total += values[i] * (i % 7);
  }

  if (total > 8000) {
    total -= std::accumulate(values.begin(), values.end(), 0) / 4;
  }

  return total;
}
`;
