import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const nextVersion = process.argv[2]

if (!nextVersion) {
  throw new Error("Expected the next version as the first argument")
}

const repoRoot = process.cwd()

async function updateJsonVersion(relativePath: string) {
  const filePath = path.join(repoRoot, relativePath)
  const raw = await readFile(filePath, "utf8")
  const parsed = JSON.parse(raw) as { version?: string }

  parsed.version = nextVersion

  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`)
}

async function updateCargoVersion(relativePath: string) {
  const filePath = path.join(repoRoot, relativePath)
  const raw = await readFile(filePath, "utf8")
  const next = raw.replace(/^version = ".*"$/m, `version = "${nextVersion}"`)

  await writeFile(filePath, next)
}

await Promise.all([
  updateJsonVersion("package.json"),
  updateJsonVersion("sidecar/package.json"),
  updateJsonVersion("src-tauri/tauri.conf.json"),
  updateCargoVersion("src-tauri/Cargo.toml")
])
