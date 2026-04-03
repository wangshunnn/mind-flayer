/**
 * Tests for command executor
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { describe, expect, it } from "vitest"
import { executeCommand } from "../executor"

const isWindows = process.platform === "win32"
const describeIfSupported = isWindows ? describe.skip : describe

describeIfSupported("executeCommand", () => {
  it("should expand tilde in arguments to user's home directory", async () => {
    const userHome = homedir()
    const result = await executeCommand("echo", ["~/Desktop"], "/tmp", new AbortController().signal)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`${userHome}/Desktop`)
  })

  it("should expand multiple tildes in different arguments", async () => {
    const userHome = homedir()
    const result = await executeCommand(
      "echo",
      ["~/Desktop", "~/Documents"],
      "/tmp",
      new AbortController().signal
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`${userHome}/Desktop ${userHome}/Documents`)
  })

  it("should handle standalone tilde", async () => {
    const userHome = homedir()
    const result = await executeCommand("echo", ["~"], "/tmp", new AbortController().signal)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(userHome)
  })

  it("should not expand tilde that is not at the start", async () => {
    const result = await executeCommand("echo", ["test~file"], "/tmp", new AbortController().signal)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("test~file")
  })

  it("should execute ls command with expanded home path", async () => {
    const result = await executeCommand(
      "ls",
      ["-la", "~/Desktop"],
      "/tmp",
      new AbortController().signal
    )

    // Should not error with "No such file or directory"
    // Exit code 0 or 1 is acceptable (1 if Desktop doesn't exist)
    expect([0, 1, 2]).toContain(result.exitCode)
    expect(result.stderr).not.toContain("~/Desktop: No such file or directory")
  })

  it("should use the real user HOME in execution environment", async () => {
    const userHome = homedir()
    const result = await executeCommand("printenv", ["HOME"], "/tmp", new AbortController().signal)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(userHome)
  })

  it("should pass through whitelisted graphical session environment variables", async () => {
    const previousDisplay = process.env.DISPLAY
    process.env.DISPLAY = ":mind-flayer-test-display"

    try {
      const result = await executeCommand(
        "printenv",
        ["DISPLAY"],
        "/tmp",
        new AbortController().signal
      )

      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe(":mind-flayer-test-display")
    } finally {
      if (previousDisplay === undefined) {
        delete process.env.DISPLAY
      } else {
        process.env.DISPLAY = previousDisplay
      }
    }
  })

  it("should not pass through non-whitelisted environment variables", async () => {
    const key = "MINDFLAYER_SHOULD_NOT_LEAK"
    const previousValue = process.env[key]
    process.env[key] = "super-secret"

    try {
      const result = await executeCommand("printenv", [key], "/tmp", new AbortController().signal)

      expect(result.exitCode).toBe(1)
      expect(result.stdout.trim()).toBe("")
    } finally {
      if (previousValue === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previousValue
      }
    }
  })

  it("should discover commands from trusted user-managed runtime directories", async () => {
    const nvmVersionsDir = join(homedir(), ".nvm", "versions", "node")
    mkdirSync(nvmVersionsDir, { recursive: true })

    const versionRoot = mkdtempSync(join(nvmVersionsDir, "mind-flayer-path-"))
    const allowedDir = join(versionRoot, "bin")
    const commandName = `mind-flayer-path-${Date.now()}`
    const commandPath = join(allowedDir, commandName)
    const previousPath = process.env.PATH

    mkdirSync(allowedDir, { recursive: true })
    writeFileSync(commandPath, '#!/bin/sh\nprintf "%s\\n" "$PATH"\n')
    chmodSync(commandPath, 0o755)
    delete process.env.PATH

    try {
      const result = await executeCommand(commandName, [], "/tmp", new AbortController().signal)

      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim().split(delimiter)).toContain(allowedDir)
    } finally {
      if (previousPath === undefined) {
        delete process.env.PATH
      } else {
        process.env.PATH = previousPath
      }

      rmSync(versionRoot, { recursive: true, force: true })
    }
  })

  it("should ignore non-whitelisted inherited PATH entries during command resolution", async () => {
    const disallowedDir = mkdtempSync(join(tmpdir(), "mind-flayer-path-"))
    const commandName = `mind-flayer-blocked-${Date.now()}`
    const commandPath = join(disallowedDir, commandName)
    const previousPath = process.env.PATH

    writeFileSync(commandPath, '#!/bin/sh\nprintf "blocked\\n"\n')
    chmodSync(commandPath, 0o755)
    process.env.PATH = disallowedDir

    try {
      await expect(
        executeCommand(commandName, [], "/tmp", new AbortController().signal)
      ).rejects.toThrow(`Command '${commandName}' not found in PATH`)
    } finally {
      if (previousPath === undefined) {
        delete process.env.PATH
      } else {
        process.env.PATH = previousPath
      }

      rmSync(disallowedDir, { recursive: true, force: true })
    }
  })
})
