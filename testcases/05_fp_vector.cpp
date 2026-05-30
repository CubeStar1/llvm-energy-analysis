// TC-05: Floating-point / vector path.
// Expected: dot() emits SSE/AVX opcodes (MULSD, ADDSD, MULPD, VFMADD...)
//           which match the fp_or_vector_fallback heuristic (cost 2.8).
// Average cost/instruction in dot(): ~2.4-2.8 — highest of any single-operation test.
// Demonstrates: FP code ranks above equivalent integer ALU.
double dot(const double* a, const double* b, int n) {
    double s = 0.0;
    for (int i = 0; i < n; ++i)
        s += a[i] * b[i];
    return s;
}

int main() {
    double a[64], b[64];
    for (int i = 0; i < 64; ++i) {
        a[i] = static_cast<double>(i);
        b[i] = static_cast<double>(64 - i);
    }
    return static_cast<int>(dot(a, b, 64)) & 1;
}
