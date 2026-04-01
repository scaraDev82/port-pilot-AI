import {defineConfig} from "tsup";

export default defineConfig({
  entry: ["src/cli.tsx"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  target: "node18",
  dts: false,
  sourcemap: false,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node"
  }
});
