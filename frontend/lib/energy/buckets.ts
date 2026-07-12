/**
 * Plain-English copy for each energy bucket.
 *
 * The costs themselves come from the backend (`GET /model`) so the table cannot
 * drift from the model the pass ran with. Only the human explanation lives here.
 */
export type BucketCopy = {
  label: string;
  blurb: string;
  cppExample: string;
};

export const BUCKET_COPY: Record<string, BucketCopy> = {
  integer_alu: {
    label: "Integer math",
    blurb: "Adds, subtracts, multiplies, shifts, and register-to-register moves. The cheapest thing a CPU does, and the baseline every other cost is measured against.",
    cppExample: "i + 1, x * 2, i << 3",
  },
  compare: {
    label: "Comparison",
    blurb: "Comparing two values and setting the CPU's flags. Slightly dearer than plain arithmetic.",
    cppExample: "i < count, x == y",
  },
  branch: {
    label: "Branch",
    blurb: "Jumping somewhere else: the edges of an if, the back edge of a loop, a return. Costs more than arithmetic because the CPU may mispredict where you are going.",
    cppExample: "if (...), for (...), return",
  },
  load: {
    label: "Memory read",
    blurb: "Pulling a value out of memory into a register. Roughly twice an integer op — touching memory is the expensive part of most programs.",
    cppExample: "values[i], reading a variable",
  },
  store: {
    label: "Memory write",
    blurb: "Pushing a register's value back out to memory. Slightly dearer than a read.",
    cppExample: "values[i] = x, total = ...",
  },
  fp_or_vector_fallback: {
    label: "Float / vector",
    blurb: "Floating-point arithmetic and SIMD work, where the CPU operates on several values at once. Wide, power-hungry hardware.",
    cppExample: "double math, vectorized loops",
  },
  call: {
    label: "Function call",
    blurb: "The call itself — saving state, jumping, and coming back. This is only the cost of making the call; whatever the callee does is counted inside the callee.",
    cppExample: "f(x)",
  },
};

export function bucketCopy(name: string): BucketCopy {
  return (
    BUCKET_COPY[name] ?? {
      label: name.replace(/_/g, " "),
      blurb: "A group of machine instructions that cost about the same amount of energy.",
      cppExample: "—",
    }
  );
}
