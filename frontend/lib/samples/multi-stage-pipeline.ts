import type { SampleProgram } from "./types";

export const multiStagePipeline: SampleProgram = {
  id: "multi-stage-pipeline",
  label: "Multi-stage pipeline",
  description: "Hashing, trig-heavy transforms, and a sort across five functions — hotspots shift by stage.",
  tier: "Advanced",
  complexity: 6,
  code: `#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

struct Record {
  std::string label;
  double value;
  unsigned long long hash;
};

unsigned long long hashLabel(const std::string& label) {
  unsigned long long hash = 1469598103934665603ull;
  for (char ch : label) {
    hash ^= static_cast<unsigned char>(ch);
    hash *= 1099511628211ull;
  }
  return hash;
}

double transform(double value, int iterations) {
  double result = value;
  for (int i = 0; i < iterations; ++i) {
    result = std::sin(result) * std::cos(result * 0.5) + std::sqrt(std::abs(result) + 1.0);
  }
  return result;
}

std::vector<Record> buildDataset(int count) {
  std::vector<Record> records;
  records.reserve(count);

  for (int i = 0; i < count; ++i) {
    std::string label = "item-" + std::to_string(i);
    double value = transform(static_cast<double>(i % 37), 12);
    records.push_back({label, value, hashLabel(label)});
  }

  return records;
}

void rankByValue(std::vector<Record>& records) {
  std::sort(records.begin(), records.end(), [](const Record& a, const Record& b) {
    return a.value > b.value;
  });
}

unsigned long long summarize(const std::vector<Record>& records) {
  unsigned long long checksum = 0;
  for (const auto& record : records) {
    checksum += record.hash ^ static_cast<unsigned long long>(record.value * 1000.0);
  }
  return checksum;
}

int main() {
  std::vector<Record> dataset = buildDataset(600);
  rankByValue(dataset);
  unsigned long long checksum = summarize(dataset);

  return static_cast<int>(checksum % 1000000);
}
`,
};
