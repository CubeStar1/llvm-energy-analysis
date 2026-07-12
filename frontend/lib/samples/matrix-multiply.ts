import type { SampleProgram } from "./types";

export const matrixMultiply: SampleProgram = {
  id: "matrix-multiply",
  label: "Matrix multiply",
  description: "Triple-nested, floating-point-heavy loop across three functions — a classic hotspot.",
  tier: "Intermediate",
  complexity: 4,
  code: `#include <vector>

using Matrix = std::vector<std::vector<double>>;

Matrix makeMatrix(int size, double seed) {
  Matrix matrix(size, std::vector<double>(size));
  for (int i = 0; i < size; ++i) {
    for (int j = 0; j < size; ++j) {
      matrix[i][j] = seed * (i + 1) - j * 0.5;
    }
  }
  return matrix;
}

Matrix multiply(const Matrix& a, const Matrix& b) {
  int size = static_cast<int>(a.size());
  Matrix result(size, std::vector<double>(size, 0.0));

  for (int i = 0; i < size; ++i) {
    for (int j = 0; j < size; ++j) {
      double sum = 0.0;
      for (int k = 0; k < size; ++k) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  }

  return result;
}

int main() {
  constexpr int kSize = 48;
  Matrix a = makeMatrix(kSize, 1.5);
  Matrix b = makeMatrix(kSize, 0.75);
  Matrix c = multiply(a, b);

  double trace = 0.0;
  for (int i = 0; i < kSize; ++i) {
    trace += c[i][i];
  }

  return static_cast<int>(trace) % 10000;
}
`,
};
