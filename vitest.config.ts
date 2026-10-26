import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // Physics must be deterministic: no retries, no test reordering.
    retry: 0,
    sequence: { shuffle: false },
  },
});
