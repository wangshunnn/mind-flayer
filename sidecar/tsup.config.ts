import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  clean: true,
  bundle: true,
  external: [],
  noExternal: [/(.*)/],
  platform: "node",
  minify: false,
  sourcemap: false,
  shims: true,
  banner: {
    js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);"
  }
})
