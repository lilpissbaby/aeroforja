import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // Minutes-long validation cases run apart: vitest.slow.config.ts.
    exclude: ["**/node_modules/**", "packages/*/test/**/*.slow.test.ts"],
    // The CFD reference solver needs a few seconds per case.
    testTimeout: 60_000,
    // Physics must be deterministic: no retries, no test reordering.
    retry: 0,
    sequence: { shuffle: false },
  },
});
