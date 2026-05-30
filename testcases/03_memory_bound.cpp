// TC-03: Memory-bound — array reads and writes.
// Expected: fill() dominated by store (MOV64mr, cost 2.2),
//           sum_array() dominated by load (MOV64rm, cost 2.0).
// sum_array should rank above fill because load-heavy > store-heavy in this model.
// Average cost/instruction: ~2.0-2.2 (significantly higher than TC-02).
void fill(int* arr, int n) {
    for (int i = 0; i < n; ++i)
        arr[i] = i * 2;
}

void sum_array(const int* arr, int n, long long* out) {
    long long s = 0;
    for (int i = 0; i < n; ++i)
        s += arr[i];
    *out = s;
}

int main() {
    int arr[256];
    long long result = 0;
    fill(arr, 256);
    sum_array(arr, 256, &result);
    return (int)(result & 1);
}
