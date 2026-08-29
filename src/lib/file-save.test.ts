import { afterEach, describe, expect, it, vi } from "vitest"

const { save, writeFile } = vi.hoisted(() => ({
  save: vi.fn(),
  writeFile: vi.fn()
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({ save }))
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile }))

import { saveBlobAs, saveUrlAs } from "@/lib/file-save"

describe("file save helpers", () => {
  afterEach(() => {
    save.mockReset()
    writeFile.mockReset()
    vi.restoreAllMocks()
  })

  it("writes blob bytes to the selected path", async () => {
    save.mockResolvedValue("/tmp/report.pdf")
    writeFile.mockResolvedValue(undefined)

    await expect(saveBlobAs(new Blob(["report"]), "report.pdf")).resolves.toBe(true)

    expect(save).toHaveBeenCalledWith({ defaultPath: "report.pdf" })
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/report.pdf",
      expect.objectContaining({ byteLength: 6 })
    )
  })

  it("does not write when the save dialog is cancelled", async () => {
    save.mockResolvedValue(null)

    await expect(saveBlobAs(new Blob(["report"]), "report.pdf")).resolves.toBe(false)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("loads a URL before saving it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["pdf"], { type: "application/pdf" }), {
        status: 200
      })
    )
    save.mockResolvedValue("/tmp/report.pdf")
    writeFile.mockResolvedValue(undefined)

    await expect(saveUrlAs("data:application/pdf;base64,cGRm", "report.pdf")).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith("data:application/pdf;base64,cGRm")
    expect(writeFile).toHaveBeenCalled()
  })
})
