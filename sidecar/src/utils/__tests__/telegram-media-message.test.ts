import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { transformTelegramMediaMessage } from "../telegram-media-message"

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x08, 0x06, 0x00, 0x00, 0x00
])

const MP4_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32
])

const MP3_BYTES = Uint8Array.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x15])

describe("transformTelegramMediaMessage", () => {
  let tempDir = ""
  let imagePath = ""
  let videoPath = ""
  let audioPath = ""
  let docPath = ""
  let svgPath = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-media-test-"))
    imagePath = join(tempDir, "shot.png")
    videoPath = join(tempDir, "clip.mp4")
    audioPath = join(tempDir, "voice.mp3")
    docPath = join(tempDir, "note.txt")
    svgPath = join(tempDir, "diagram.svg")

    await writeFile(imagePath, PNG_BYTES)
    await writeFile(videoPath, MP4_BYTES)
    await writeFile(audioPath, MP3_BYTES)
    await writeFile(docPath, "hello")
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("parses only attachments section and preserves it in sanitized text", async () => {
    const fileUrl = `file://${imagePath}`
    const content = [
      `Outside section should stay literal: ![ignored](${fileUrl})`,
      "",
      "Attachments:",
      `![preview](${fileUrl})`
    ].join("\n")

    const result = await transformTelegramMediaMessage(content)

    expect(result.sanitizedText).toBe(content)
    expect(result.attachmentsSection).toBe(`Attachments:\n![preview](${fileUrl})`)
    expect(result.uploads).toHaveLength(1)
    expect(result.uploads[0]?.kind).toBe("photo")
    expect(result.uploads[0]?.intent).toBe("photo")
    expect(result.uploads[0]?.filename).toBe("shot.png")
    expect(result.uploads[0]?.imageWidth).toBe(2)
    expect(result.uploads[0]?.imageHeight).toBe(3)
    expect(result.warnings).toEqual([])
  })

  it("does not parse local attachments when attachments section is missing", async () => {
    const result = await transformTelegramMediaMessage(`Done.\n![screenshot](file://${imagePath})`)

    expect(result.sanitizedText).toBe(`Done.\n![screenshot](file://${imagePath})`)
    expect(result.attachmentsSection).toBeNull()
    expect(result.uploads).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it("uses markdown syntax to distinguish photo preview from original file intent", async () => {
    const content = [
      "Attachments:",
      `![preview](file://${imagePath})`,
      `[original](file://${imagePath})`
    ].join("\n")

    const result = await transformTelegramMediaMessage(content)

    expect(result.uploads).toHaveLength(2)
    expect(result.uploads[0]?.kind).toBe("photo")
    expect(result.uploads[0]?.intent).toBe("photo")
    expect(result.uploads[1]?.kind).toBe("photo")
    expect(result.uploads[1]?.intent).toBe("document")
  })

  it("routes video, audio and document attachments by extension", async () => {
    const content = [
      "Attachments:",
      `[clip](file://${videoPath})`,
      `[voice](file://${audioPath})`,
      `[note](file://${docPath})`
    ].join("\n")

    const result = await transformTelegramMediaMessage(content)

    expect(result.uploads.map(upload => upload.kind)).toEqual(["video", "audio", "document"])
    expect(result.uploads.map(upload => upload.intent)).toEqual([
      "document",
      "document",
      "document"
    ])
  })

  it("downgrades unsupported Telegram photo syntax to document with a warning", async () => {
    const content = ["Attachments:", `![diagram](file://${svgPath})`].join("\n")

    const result = await transformTelegramMediaMessage(content)

    expect(result.uploads).toHaveLength(1)
    expect(result.uploads[0]?.kind).toBe("document")
    expect(result.uploads[0]?.intent).toBe("document")
    expect(result.warnings[0]).toContain("Sending it as a document instead")
  })
})
