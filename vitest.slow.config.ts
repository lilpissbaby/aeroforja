import { defineConfig } from "vitest/config";

// Validation cases that take minutes (CFD on the reference solver): `pnpm test:slow`, and in CI.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.slow.test.ts"],
    retry: 0,
    sequence: { shuffle: false },
    testTimeout: 1_800_000,
  },
});
