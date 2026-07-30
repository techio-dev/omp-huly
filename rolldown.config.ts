import { defineConfig } from "rolldown";

// R3 mitigation: externalize ws + native addons (R2), node:* built-ins,
// omp peers (@oh-my-pi/*), @hcengineering/* (npm public dep — consumer
// install runtime, KHÔNG bundled) and typebox (until Task 4 removes it).
// KHÔNG inline → bundle stays small, no dep leak.
const external = [
  "ws",
  "bufferutil",
  "utf-8-validate",
  /^node:/,
  /^@oh-my-pi\//,
  /^@hcengineering\//,
  "typebox",
];

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    entryFileNames: "index.mjs",
    format: "esm",
    sourcemap: true,
  },
  external,
  treeshake: {
    moduleSideEffects: "no-external",
  },
});
