import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { discoverSkills } from "../catalog"

async function writeSkill(root: string, relativeDir: string, content: string) {
  const skillDir = join(root, relativeDir)
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

  it("discovers eligible skills from the app support skills directory", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-app-support-"))
    tempDirs.push(appSupportDir)

    await writeSkill(
      join(appSupportDir, "skills"),
      "shared",
      `---
name: shared-skill
description: global description
metadata:
  requires:
    bins: ["node"]
---

# Shared
`
    )

    // Write the same skill twice to verify that the later file contents win.
    await writeSkill(
      join(appSupportDir, "skills"),
      "shared",
      `---
name: shared-skill
description: current description
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
      join(appSupportDir, "skills"),
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

    await writeSkill(
      join(appSupportDir, "skills"),
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

    const skills = await discoverSkills({
      appSupportDir
    })

    expect(skills.map(skill => skill.name)).toEqual(["env-skill", "shared-skill"])
    expect(skills.find(skill => skill.name === "shared-skill")?.description).toBe(
      "current description"
    )
    expect(skills.find(skill => skill.name === "shared-skill")?.location).toBe(
      `${appSupportDir.replaceAll("\\", "/")}/skills/shared/SKILL.md`
    )
  })

  it("returns an empty list when no skills exist", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-empty-"))
    tempDirs.push(appSupportDir)

    const skills = await discoverSkills({
      appSupportDir
    })

    expect(skills).toEqual([])
  })

  it("resolves duplicate skill names deterministically and logs the override", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-skills-duplicates-"))
    tempDirs.push(appSupportDir)
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await writeSkill(
      join(appSupportDir, "skills"),
      "alpha",
      `---
name: duplicate-skill
description: alpha description
---

# Alpha
`
    )

    await writeSkill(
      join(appSupportDir, "skills"),
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
    expect(skills[0]?.description).toBe("omega description")
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Duplicate skill 'duplicate-skill'")
    )

    consoleWarnSpy.mockRestore()
  })
})
