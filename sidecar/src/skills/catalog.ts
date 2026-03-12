import { type Dirent, constants as fsConstants } from "node:fs"
import { access, readdir, readFile, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import { delimiter, isAbsolute, relative, resolve } from "node:path"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"
const SKILL_FILE_NAME = "SKILL.md"
const GLOBAL_SKILLS_DIR_NAME = "skills"

type ParsedYamlValue = unknown

type ParsedYamlObject = Record<string, ParsedYamlValue>

interface SkillRoot {
  absolutePath: string
  displayPrefix: string
}

export interface SkillMetadata {
  requires?: {
    bins?: string[]
    env?: string[]
  }
  os?: string | string[]
  [key: string]: unknown
}

export interface SkillCatalogEntry {
  name: string
  description: string
  metadata: SkillMetadata
  filePath: string
  location: string
  skillDir: string
}

export type SkillFileKind = "skill-md" | "reference" | "script" | "other"

export interface SkillFileDisplayContext {
  kind: "skill"
  skillName: string
  fileKind: SkillFileKind
}

function toDisplayPath(path: string): string {
  const normalizedPath = path.replaceAll("\\", "/")
  const userHome = homedir().replaceAll("\\", "/")

  if (normalizedPath === userHome) {
    return "~"
  }

  if (normalizedPath.startsWith(`${userHome}/`)) {
    return `~/${normalizedPath.slice(userHome.length + 1)}`
  }

  return normalizedPath
}

function getSkillRoots(options?: { appSupportDir?: string }): SkillRoot[] {
  const appSupportDir = options?.appSupportDir ?? process.env[APP_SUPPORT_DIR_ENV_KEY]
  if (!appSupportDir) {
    return []
  }

  const absolutePath = resolve(appSupportDir, GLOBAL_SKILLS_DIR_NAME)
  return [
    {
      absolutePath,
      displayPrefix: toDisplayPath(absolutePath)
    }
  ]
}

function getGlobalSkillsRootPath(options?: { appSupportDir?: string }): string | null {
  return getSkillRoots(options)[0]?.absolutePath ?? null
}

export async function getSkillFileDisplayContext(
  filePath: string,
  options?: { appSupportDir?: string }
): Promise<SkillFileDisplayContext | null> {
  const skillsRoot = getGlobalSkillsRootPath(options)
  if (!skillsRoot) {
    return null
  }

  let resolvedSkillsRoot = skillsRoot
  try {
    resolvedSkillsRoot = await realpath(skillsRoot)
  } catch (error) {
    console.debug(
      `[Skills] Failed to resolve skills root '${skillsRoot}', falling back to the configured path: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  const relativePath = relative(resolvedSkillsRoot, filePath)
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null
  }

  const pathSegments = relativePath.split(/[/\\]+/).filter(Boolean)
  const skillName = pathSegments[0]
  if (!skillName) {
    return null
  }

  const nestedSegments = pathSegments.slice(1)
  const nestedPath = nestedSegments.join("/")
  let fileKind: SkillFileKind = "other"

  if (nestedPath === SKILL_FILE_NAME) {
    fileKind = "skill-md"
  } else if (nestedSegments[0] === "references") {
    fileKind = "reference"
  } else if (nestedSegments[0] === "scripts") {
    fileKind = "script"
  }

  return {
    kind: "skill",
    skillName,
    fileKind
  }
}

function countIndent(line: string): number {
  let index = 0
  while (index < line.length && line[index] === " ") {
    index += 1
  }
  return index
}

function parseQuotedString(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value)
    } catch {
      return value.slice(1, -1)
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'")
  }

  return value
}

function parseInlineArray(value: string): ParsedYamlValue[] {
  const items: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (quote) {
      current += char
      if (char === quote && value[index - 1] !== "\\") {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === ",") {
      items.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  if (current.trim().length > 0) {
    items.push(current.trim())
  }

  return items.filter(Boolean).map(parseScalar)
}

function parseScalar(value: string): ParsedYamlValue {
  const trimmed = value.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return parseQuotedString(trimmed)
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseInlineArray(trimmed.slice(1, -1))
  }

  if (trimmed === "true") {
    return true
  }

  if (trimmed === "false") {
    return false
  }

  if (trimmed === "null") {
    return null
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  return trimmed
}

function getNextSignificantLineIndex(lines: string[], startIndex: number): number {
  let index = startIndex

  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      break
    }
    index += 1
  }

  return index
}

function parseArray(lines: string[], startIndex: number, indent: number) {
  const result: ParsedYamlValue[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      index += 1
      continue
    }

    const lineIndent = countIndent(line)
    if (lineIndent < indent) {
      break
    }
    if (lineIndent !== indent || !trimmed.startsWith("- ")) {
      break
    }

    const remainder = trimmed.slice(2).trim()
    if (remainder.length > 0) {
      result.push(parseScalar(remainder))
      index += 1
      continue
    }

    const nextIndex = getNextSignificantLineIndex(lines, index + 1)
    if (nextIndex >= lines.length || countIndent(lines[nextIndex]) <= indent) {
      result.push(null)
      index = nextIndex
      continue
    }

    const nextIndent = countIndent(lines[nextIndex])
    const nested = lines[nextIndex].trim().startsWith("- ")
      ? parseArray(lines, nextIndex, nextIndent)
      : parseObject(lines, nextIndex, nextIndent)

    result.push(nested.value)
    index = nested.nextIndex
  }

  return {
    value: result,
    nextIndex: index
  }
}

function parseObject(lines: string[], startIndex: number, indent: number) {
  const result: ParsedYamlObject = {}
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      index += 1
      continue
    }

    const lineIndent = countIndent(line)
    if (lineIndent < indent) {
      break
    }
    if (lineIndent !== indent || trimmed.startsWith("- ")) {
      break
    }

    const separatorIndex = trimmed.indexOf(":")
    if (separatorIndex < 0) {
      throw new Error(`Invalid frontmatter line '${trimmed}'`)
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const remainder = trimmed.slice(separatorIndex + 1).trim()

    if (remainder.length > 0) {
      result[key] = parseScalar(remainder)
      index += 1
      continue
    }

    const nextIndex = getNextSignificantLineIndex(lines, index + 1)
    if (nextIndex >= lines.length || countIndent(lines[nextIndex]) <= indent) {
      result[key] = null
      index = nextIndex
      continue
    }

    const nextIndent = countIndent(lines[nextIndex])
    const nested = lines[nextIndex].trim().startsWith("- ")
      ? parseArray(lines, nextIndex, nextIndent)
      : parseObject(lines, nextIndex, nextIndent)

    result[key] = nested.value
    index = nested.nextIndex
  }

  return {
    value: result,
    nextIndex: index
  }
}

function extractFrontmatter(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") {
    return null
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (endIndex < 0) {
    return null
  }

  return lines.slice(1, endIndex).join("\n")
}

function parseFrontmatter(markdown: string): ParsedYamlObject | null {
  const frontmatter = extractFrontmatter(markdown)
  if (!frontmatter) {
    return null
  }

  const lines = frontmatter.split(/\r?\n/)
  return parseObject(lines, 0, 0).value
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()]
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeOsName(value: string): string {
  const normalized = value.trim().toLowerCase()

  if (
    normalized === "darwin" ||
    normalized === "mac" ||
    normalized === "macos" ||
    normalized === "osx"
  ) {
    return "macos"
  }

  if (normalized === "win" || normalized === "windows" || normalized === "win32") {
    return "windows"
  }

  if (normalized === "linux") {
    return "linux"
  }

  return normalized
}

function getCurrentOsName(): string {
  if (process.platform === "darwin") {
    return "macos"
  }

  if (process.platform === "win32") {
    return "windows"
  }

  if (process.platform === "linux") {
    return "linux"
  }

  return process.platform
}

async function commandExists(command: string): Promise<boolean> {
  const trimmed = command.trim()
  if (!trimmed) {
    return false
  }

  const candidates =
    process.platform === "win32"
      ? [
          trimmed,
          ...(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
            .split(";")
            .map(ext => `${trimmed}${ext}`)
        ]
      : [trimmed]

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    for (const candidate of candidates) {
      try {
        await access(candidate, fsConstants.X_OK)
        return true
      } catch {}
    }
    return false
  }

  const searchPath = process.env.PATH?.split(delimiter).filter(Boolean) ?? []
  for (const directory of searchPath) {
    for (const candidate of candidates) {
      try {
        await access(resolve(directory, candidate), fsConstants.X_OK)
        return true
      } catch {}
    }
  }

  return false
}

async function isSkillEligible(metadata: SkillMetadata): Promise<boolean> {
  const bins = normalizeStringArray(metadata.requires?.bins)
  for (const bin of bins) {
    if (!(await commandExists(bin))) {
      return false
    }
  }

  const envVars = normalizeStringArray(metadata.requires?.env)
  for (const envVar of envVars) {
    if (!process.env[envVar]) {
      return false
    }
  }

  const osRequirements = normalizeStringArray(metadata.os).map(normalizeOsName)
  if (osRequirements.length > 0 && !osRequirements.includes(getCurrentOsName())) {
    return false
  }

  return true
}

async function collectSkillFilePaths(rootPath: string): Promise<string[]> {
  const pendingDirectories = [rootPath]
  const skillFilePaths: string[] = []

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop()
    if (!currentDirectory) {
      continue
    }

    let entries: Dirent[]
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true })
    } catch {
      if (currentDirectory === rootPath) {
        return []
      }
      continue
    }

    const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of sortedEntries) {
      const entryPath = resolve(currentDirectory, entry.name)

      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath)
        continue
      }

      if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
        skillFilePaths.push(entryPath)
      }
    }
  }

  return skillFilePaths.sort((left, right) => left.localeCompare(right))
}

async function loadSkillFromFile(
  skillFilePath: string,
  root: SkillRoot
): Promise<SkillCatalogEntry | null> {
  try {
    const contents = await readFile(skillFilePath, "utf8")
    const parsed = parseFrontmatter(contents)

    if (!parsed) {
      return null
    }

    const name = typeof parsed.name === "string" ? parsed.name.trim() : ""
    const description = typeof parsed.description === "string" ? parsed.description.trim() : ""
    const metadata =
      parsed.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata)
        ? (parsed.metadata as SkillMetadata)
        : {}

    if (!name || !description) {
      return null
    }

    if (!(await isSkillEligible(metadata))) {
      return null
    }

    const relativePath = skillFilePath.slice(root.absolutePath.length + 1).replaceAll("\\", "/")

    return {
      name,
      description,
      metadata,
      filePath: skillFilePath,
      location: `${root.displayPrefix}/${relativePath}`,
      skillDir: skillFilePath.slice(0, -SKILL_FILE_NAME.length - 1)
    }
  } catch (error) {
    console.warn(
      `[Skills] Failed to load '${skillFilePath}': ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

export async function discoverSkills(options?: {
  appSupportDir?: string
}): Promise<SkillCatalogEntry[]> {
  const roots = getSkillRoots(options)
  const catalog = new Map<string, SkillCatalogEntry>()

  for (const root of roots) {
    const skillFilePaths = await collectSkillFilePaths(root.absolutePath)
    for (const skillFilePath of skillFilePaths) {
      const skill = await loadSkillFromFile(skillFilePath, root)
      if (!skill) {
        continue
      }

      const existing = catalog.get(skill.name)
      if (existing) {
        console.warn(
          `[Skills] Duplicate skill '${skill.name}' found at '${skill.filePath}'. Overriding previously loaded skill from '${existing.filePath}'.`
        )
      }

      catalog.set(skill.name, skill)
    }
  }

  return [...catalog.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export async function discoverSkillsSafely(
  context: string,
  options?: {
    appSupportDir?: string
  }
): Promise<SkillCatalogEntry[]> {
  try {
    return await discoverSkills(options)
  } catch (error) {
    console.warn(
      `[Skills] Failed to discover skills for ${context}: ${error instanceof Error ? error.message : String(error)}`
    )
    return []
  }
}
