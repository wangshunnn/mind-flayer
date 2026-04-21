import { type Dirent, constants as fsConstants } from "node:fs"
import { access, readdir, readFile, realpath, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { delimiter, extname, isAbsolute, relative, resolve } from "node:path"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"
const SKILL_FILE_NAME = "SKILL.md"
const GLOBAL_SKILLS_DIR_NAME = "skills"
const BUNDLED_SKILLS_DIR_NAME = "builtin"
const USER_SKILLS_DIR_NAME = "user"
const SKILL_ICON_CANDIDATES = ["assets/icon.svg", "assets/icon.png", "assets/icon.webp"] as const
const SUPPORTED_ICON_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"])

type ParsedYamlValue = unknown

type ParsedYamlObject = Record<string, ParsedYamlValue>

export type SkillSource = "bundled" | "user"

interface SkillRoot {
  absolutePath: string
  displayPrefix: string
  source: SkillSource
}

export interface SkillMetadata {
  requires?: {
    bins?: string[]
    env?: string[]
  }
  os?: string | string[]
  icon?: string
  [key: string]: unknown
}

export interface SkillCatalogEntry {
  id: string
  name: string
  description: string
  metadata: SkillMetadata
  iconPath: string | null
  filePath: string
  location: string
  skillDir: string
  source: SkillSource
  canUninstall: boolean
}

export interface SkillCatalogDetail extends SkillCatalogEntry {
  bodyMarkdown: string
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

  const skillsRoot = resolve(appSupportDir, GLOBAL_SKILLS_DIR_NAME)
  const bundledRoot = resolve(skillsRoot, BUNDLED_SKILLS_DIR_NAME)
  const userRoot = resolve(skillsRoot, USER_SKILLS_DIR_NAME)

  return [
    {
      absolutePath: bundledRoot,
      displayPrefix: toDisplayPath(bundledRoot),
      source: "bundled"
    },
    {
      absolutePath: userRoot,
      displayPrefix: toDisplayPath(userRoot),
      source: "user"
    }
  ]
}

function getSkillRootBySource(
  source: SkillSource,
  options?: {
    appSupportDir?: string
  }
): SkillRoot | null {
  return getSkillRoots(options).find(root => root.source === source) ?? null
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath)
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath)
}

function normalizeSkillIdentifier(relativeSkillDir: string): string {
  const normalized = relativeSkillDir
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .trim()
  return normalized || "__root__"
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

function hasSupportedIconExtension(path: string): boolean {
  return SUPPORTED_ICON_EXTENSIONS.has(extname(path).toLowerCase())
}

async function resolveSkillAssetPath(skillDir: string, assetPath: unknown): Promise<string | null> {
  if (typeof assetPath !== "string" || !assetPath.trim()) {
    return null
  }

  const resolvedAssetPath = resolve(skillDir, assetPath.trim())
  if (!isPathWithinRoot(skillDir, resolvedAssetPath)) {
    return null
  }

  if (!hasSupportedIconExtension(resolvedAssetPath)) {
    return null
  }

  if (!(await pathExists(resolvedAssetPath))) {
    return null
  }

  return resolvedAssetPath
}

async function findFirstSkillAssetPath(
  skillDir: string,
  candidates: readonly string[]
): Promise<string | null> {
  for (const candidate of candidates) {
    const resolvedAssetPath = await resolveSkillAssetPath(skillDir, candidate)
    if (resolvedAssetPath) {
      return resolvedAssetPath
    }
  }

  return null
}

async function resolveSkillIconPaths(
  skillDir: string,
  metadata: SkillMetadata
): Promise<string | null> {
  return (
    (await resolveSkillAssetPath(skillDir, metadata.icon)) ??
    (await findFirstSkillAssetPath(skillDir, SKILL_ICON_CANDIDATES))
  )
}

export function getSkillId(source: SkillSource, identifier: string): string {
  return `${source}:${normalizeSkillIdentifier(identifier)}`
}

export function parseSkillId(skillId: string): { source: SkillSource; identifier: string } | null {
  const separatorIndex = skillId.indexOf(":")
  if (separatorIndex <= 0 || separatorIndex >= skillId.length - 1) {
    return null
  }

  const source = skillId.slice(0, separatorIndex)
  const identifier = skillId.slice(separatorIndex + 1).trim()
  if ((source !== "bundled" && source !== "user") || !identifier) {
    return null
  }

  return {
    source,
    identifier
  }
}

export async function getSkillFileDisplayContext(
  filePath: string,
  options?: { appSupportDir?: string }
): Promise<SkillFileDisplayContext | null> {
  for (const root of getSkillRoots(options)) {
    let resolvedSkillsRoot = root.absolutePath
    try {
      resolvedSkillsRoot = await realpath(root.absolutePath)
    } catch (error) {
      console.debug(
        `[Skills] Failed to resolve skills root '${root.absolutePath}', falling back to the configured path: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }

    const relativePath = relative(resolvedSkillsRoot, filePath)
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      continue
    }

    const pathSegments = relativePath.split(/[/\\]+/).filter(Boolean)
    let skillDirSegmentCount =
      pathSegments[pathSegments.length - 1] === SKILL_FILE_NAME ? pathSegments.length - 1 : 0

    if (skillDirSegmentCount === 0) {
      for (let count = pathSegments.length - 1; count >= 1; count -= 1) {
        const candidateSkillFile = resolve(
          resolvedSkillsRoot,
          ...pathSegments.slice(0, count),
          SKILL_FILE_NAME
        )
        if (await pathExists(candidateSkillFile)) {
          skillDirSegmentCount = count
          break
        }
      }
    }

    if (skillDirSegmentCount === 0) {
      skillDirSegmentCount = 1
    }

    const skillName = pathSegments[skillDirSegmentCount - 1]
    if (!skillName) {
      continue
    }

    const nestedSegments = pathSegments.slice(skillDirSegmentCount)
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

  return null
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

export function stripSkillFrontmatter(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") {
    return markdown.trim()
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (endIndex < 0) {
    return markdown.trim()
  }

  return lines
    .slice(endIndex + 1)
    .join("\n")
    .trim()
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
    const relativeSkillDir = relativePath.split("/").slice(0, -1).join("/")
    const skillDir = skillFilePath.slice(0, -SKILL_FILE_NAME.length - 1)
    const iconPath = await resolveSkillIconPaths(skillDir, metadata)

    return {
      id: getSkillId(root.source, relativeSkillDir),
      name,
      description,
      metadata,
      iconPath,
      filePath: skillFilePath,
      location: `${root.displayPrefix}/${relativePath}`,
      skillDir,
      source: root.source,
      canUninstall: root.source === "user"
    }
  } catch (error) {
    console.warn(
      `[Skills] Failed to load '${skillFilePath}': ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

function compareSkillEntries(left: SkillCatalogEntry, right: SkillCatalogEntry): number {
  if (left.source !== right.source) {
    return left.source === "bundled" ? -1 : 1
  }

  const byName = left.name.localeCompare(right.name)
  if (byName !== 0) {
    return byName
  }

  return left.id.localeCompare(right.id)
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

      const existing = catalog.get(skill.id)
      if (existing) {
        console.warn(
          `[Skills] Duplicate skill id '${skill.id}' found at '${skill.filePath}'. Skipping it because '${existing.filePath}' was already loaded.`
        )
        continue
      }

      catalog.set(skill.id, skill)
    }
  }

  return [...catalog.values()].sort(compareSkillEntries)
}

export async function getSkillById(
  skillId: string,
  options?: {
    appSupportDir?: string
  }
): Promise<SkillCatalogEntry | null> {
  const skills = await discoverSkills(options)
  return skills.find(skill => skill.id === skillId) ?? null
}

export async function getSkillDetailById(
  skillId: string,
  options?: {
    appSupportDir?: string
  }
): Promise<SkillCatalogDetail | null> {
  const skill = await getSkillById(skillId, options)
  if (!skill) {
    return null
  }

  try {
    const contents = await readFile(skill.filePath, "utf8")

    return {
      ...skill,
      bodyMarkdown: stripSkillFrontmatter(contents)
    }
  } catch (error) {
    console.error(
      `[Skills] Failed to load detail for '${skill.id}' at '${skill.filePath}': ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return null
  }
}

export async function uninstallUserSkill(
  skill: SkillCatalogEntry,
  options?: {
    appSupportDir?: string
  }
): Promise<void> {
  if (skill.source !== "user") {
    throw new Error(`Only user-installed skills can be uninstalled (received ${skill.source})`)
  }

  const userRoot = getSkillRootBySource("user", options)
  if (!userRoot) {
    throw new Error("User skill root is not configured")
  }

  let resolvedUserRoot = userRoot.absolutePath
  let resolvedSkillDir = skill.skillDir

  try {
    resolvedUserRoot = await realpath(userRoot.absolutePath)
  } catch {}

  try {
    resolvedSkillDir = await realpath(skill.skillDir)
  } catch (error) {
    throw new Error(
      `Failed to resolve skill directory '${skill.skillDir}': ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  if (resolvedSkillDir === resolvedUserRoot) {
    throw new Error("Refusing to uninstall the user skills root itself")
  }

  if (!isPathWithinRoot(resolvedUserRoot, resolvedSkillDir)) {
    throw new Error(`Refusing to uninstall skill outside user root: '${resolvedSkillDir}'`)
  }

  await rm(resolvedSkillDir, { recursive: true, force: false })
}

export function filterDisabledSkills(
  skills: SkillCatalogEntry[],
  disabledSkillIds: string[]
): SkillCatalogEntry[] {
  if (disabledSkillIds.length === 0) {
    return skills
  }

  const disabledIds = new Set(disabledSkillIds)
  return skills.filter(skill => !disabledIds.has(skill.id))
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
