import { defineConfig } from "tsup"

const isDev = process.env.NODE_ENV === "development"

export default defineConfig({
  entry: ["src/index.ts"],
  format: isDev ? ["esm"] : ["cjs"],
  target: "node24",
  outDir: "dist",
  outExtension: () => ({ js: ".js" }),
  clean: true,
  bundle: true,
  external: [],
  noExternal: [/(.*)/],
  platform: "node",
  minify: false,
  sourcemap: isDev,
  shims: true,
  ...(isDev && {
    banner: {
      js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);"
    }
  })
})
