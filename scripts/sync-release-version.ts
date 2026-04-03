import { execFile } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const nextVersion = process.argv[2]
const execFileAsync = promisify(execFile)

if (!nextVersion) {
  throw new Error("Expected the next version as the first argument")
}

const repoRoot = process.cwd()
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function replaceOrThrow(
  raw: string,
  pattern: RegExp,
  replacement: string,
  filePath: string,
  description: string
) {
  const next = raw.replace(pattern, replacement)

  if (next === raw) {
    throw new Error(`Failed to update ${description} in ${filePath}`)
  }

  return next
}

async function updateFile(relativePath: string, update: (raw: string, filePath: string) => string) {
  const filePath = path.join(repoRoot, relativePath)
  const raw = await readFile(filePath, "utf8")
  const next = update(raw, filePath)

  if (next === raw) {
    return
  }

  await writeFile(filePath, next)
}

async function updateJsonVersion(relativePath: string) {
  await updateFile(relativePath, raw => {
    const parsed = JSON.parse(raw) as { version?: string }

    parsed.version = nextVersion

    return `${JSON.stringify(parsed, null, 2)}\n`
  })
}

async function updateCargoVersion(relativePath: string) {
  await updateFile(relativePath, (raw, filePath) =>
    replaceOrThrow(
      raw,
      /^version = ".*"$/m,
      `version = "${nextVersion}"`,
      filePath,
      "Cargo manifest version"
    )
  )
}

async function updateCargoLockVersion(relativePath: string, packageName: string) {
  const packageVersionPattern = new RegExp(
    `(\\[\\[package\\]\\]\\nname = "${escapeRegExp(packageName)}"\\nversion = ")([^"]+)(")`
  )

  await updateFile(relativePath, (raw, filePath) =>
    replaceOrThrow(
      raw,
      packageVersionPattern,
      `$1${nextVersion}$3`,
      filePath,
      `Cargo.lock package version for ${packageName}`
    )
  )
}

async function formatJsonFiles(relativePaths: string[]) {
  await execFileAsync(pnpmCommand, ["exec", "biome", "format", "--write", ...relativePaths], {
    cwd: repoRoot
  })
}

const jsonFiles = ["package.json", "sidecar/package.json", "src-tauri/tauri.conf.json"]

await Promise.all([
  ...jsonFiles.map(updateJsonVersion),
  updateCargoVersion("src-tauri/Cargo.toml"),
  updateCargoLockVersion("src-tauri/Cargo.lock", "mind-flayer")
])

await formatJsonFiles(jsonFiles)
