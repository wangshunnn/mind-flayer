import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const sidecarRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(sidecarRoot, "..")

const targetTriple = process.env.SIDECAR_TARGET_TRIPLE ?? resolveHostTargetTriple()
const pkgTarget = resolvePkgTarget(targetTriple)
const outputPath = path.join(
  repoRoot,
  "src-tauri",
  "binaries",
  `mind-flayer-sidecar-${targetTriple}`
)

await mkdir(path.dirname(outputPath), { recursive: true })

await runCommand("pkg", ["dist/index.js", "-t", pkgTarget, "-o", outputPath])

function resolveHostTargetTriple() {
  switch (`${process.platform}:${process.arch}`) {
    case "darwin:arm64":
      return "aarch64-apple-darwin"
    case "darwin:x64":
      return "x86_64-apple-darwin"
    default:
      throw new Error(
        `Unsupported host platform ${process.platform} ${process.arch}; set SIDECAR_TARGET_TRIPLE explicitly`
      )
  }
}

function resolvePkgTarget(tauriTarget) {
  switch (tauriTarget) {
    case "aarch64-apple-darwin":
      return "node24-macos-arm64"
    case "x86_64-apple-darwin":
      return "node24-macos-x64"
    default:
      throw new Error(`Unsupported sidecar target triple: ${tauriTarget}`)
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: sidecarRoot,
      env: {
        ...process.env,
        PKG_CACHE_PATH:
          process.env.PKG_CACHE_PATH ??
          path.join(process.env.TMPDIR ?? "/tmp", "mind-flayer-pkg-cache")
      },
      stdio: "inherit"
    })

    child.on("error", reject)
    child.on("exit", code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`))
    })
  })
}
