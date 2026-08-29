import { save } from "@tauri-apps/plugin-dialog"
import { writeFile } from "@tauri-apps/plugin-fs"

export async function saveBlobAs(blob: Blob, defaultPath: string): Promise<boolean> {
  const filePath = await save({ defaultPath })

  if (!filePath || Array.isArray(filePath)) {
    return false
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  await writeFile(filePath, bytes)
  return true
}

export async function saveUrlAs(url: string, defaultPath: string): Promise<boolean> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to load attachment (${response.status})`)
  }

  return saveBlobAs(await response.blob(), defaultPath)
}
