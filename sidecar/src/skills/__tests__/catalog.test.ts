import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { discoverSkills, getSkillDetailById } from "../catalog"

async function writeSkill(
  appSupportDir: string,
  sourceDir: "builtin" | "user",
  relativeDir: string,
  content: string
) {
  const skillDir = join(appSupportDir, "skills", sourceDir, relativeDir)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, "SKILL.md"), content, "utf8")
}

describe("skills catalog", () => {
  const tempDirs: string[] = []
  const originalEnv = process.env.MINDFLAYER_SKILL_TEST

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
    if (originalEnv === undefined) {
      delete process.env.MINDFLAYER_SKILL_TEST
    } else {
      process.env.MINDFLAYER_SKILL_TEST = originalEnv
    }
  })

  it("discovers eligible skills from bundled and user skill roots", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-app-support-"))
    tempDirs.push(appSupportDir)

    await writeSkill(
      appSupportDir,
      "builtin",
      "shared",
      `---
name: shared-skill
description: bundled description
metadata:
  requires:
    bins:
      - node
---

# Shared Current
`
    )

    process.env.MINDFLAYER_SKILL_TEST = "present"
    await writeSkill(
      appSupportDir,
      "builtin",
      "env",
      `---
name: env-skill
description: env gated
metadata:
  requires:
    env: ["MINDFLAYER_SKILL_TEST"]
  os: ["${process.platform}"]
---

# Env
`
    )

    await writeSkill(
      appSupportDir,
      "user",
      "shared",
      `---
name: shared-skill
description: user description
---

# User Shared
`
    )

    await writeSkill(
      appSupportDir,
      "user",
      "filtered",
      `---
name: filtered-skill
description: should be hidden
metadata:
  requires:
    bins: ["definitely-missing-binary"]
---

# Filtered
`
    )

    const skills = await discoverSkills({
      appSupportDir
    })

    expect(skills.map(skill => skill.id)).toEqual([
      "bundled:env-skill",
      "bundled:shared-skill",
      "user:shared-skill"
    ])
    expect(skills.find(skill => skill.id === "bundled:shared-skill")).toMatchObject({
      source: "bundled",
      canUninstall: false,
      description: "bundled description",
      location: `${appSupportDir.replaceAll("\\", "/")}/skills/builtin/shared/SKILL.md`
    })
    expect(skills.find(skill => skill.id === "user:shared-skill")).toMatchObject({
      source: "user",
      canUninstall: true,
      description: "user description",
      location: `${appSupportDir.replaceAll("\\", "/")}/skills/user/shared/SKILL.md`
    })
  })

  it("returns an empty list when no skills exist", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-empty-"))
    tempDirs.push(appSupportDir)

    const skills = await discoverSkills({
      appSupportDir
    })

    expect(skills).toEqual([])
  })

  it("resolves duplicate skill ids deterministically and logs the override", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-duplicates-"))
    tempDirs.push(appSupportDir)
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await writeSkill(
      appSupportDir,
      "builtin",
      "alpha",
      `---
name: duplicate-skill
description: alpha description
---

# Alpha
`
    )

    await writeSkill(
      appSupportDir,
      "builtin",
      "omega",
      `---
name: duplicate-skill
description: omega description
---

# Omega
`
    )

    const skills = await discoverSkills({
      appSupportDir
    })

    expect(skills).toHaveLength(1)
    expect(skills[0]?.id).toBe("bundled:duplicate-skill")
    expect(skills[0]?.description).toBe("omega description")
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Duplicate skill 'bundled:duplicate-skill'")
    )

    consoleWarnSpy.mockRestore()
  })

  it("returns detail markdown without frontmatter", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skill-detail-"))
    tempDirs.push(appSupportDir)

    await writeSkill(
      appSupportDir,
      "builtin",
      "detail",
      `---
name: detail-skill
description: detail description
---

# Detail

Body content
`
    )

    const detail = await getSkillDetailById("bundled:detail-skill", {
      appSupportDir
    })

    expect(detail?.bodyMarkdown).toBe("# Detail\n\nBody content")
    expect(detail?.source).toBe("bundled")
  })
})
