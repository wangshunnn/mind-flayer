/**
 * Tests for command executor
 */

import { homedir } from "node:os"
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
})
