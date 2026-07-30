import { defineConfig } from "vitest/config";

// The 4 tests below import @oh-my-pi/pi-tui, which triggers @oh-my-pi/pi-natives'
// native loader. omp's npm package ships NO prebuilt .node binary (it's bundled only
// in omp's real installer), so these crash under vitest/node in dev. They PASS under
// bun and in a real omp install. Verified separately: factory loads + 102 tools
// register + render hooks execute (Text) under bun (Task 8/9 smoke).
const NATIVE_GATED = [
  "src/__tests__/index.test.ts",
  "src/__tests__/smoke.test.ts",
  "src/render/__tests__/issue.test.ts",
  "src/render/__tests__/document.test.ts",
];

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", ...NATIVE_GATED],
  },
});
