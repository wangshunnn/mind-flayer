import type { Context } from "hono"
import {
  discoverSkills,
  getSkillById,
  getSkillDetailById,
  parseSkillId,
  uninstallUserSkill
} from "../skills/catalog"
import {
  BadRequestError,
  ForbiddenError,
  mapErrorToResponse,
  NotFoundError
} from "../utils/http-errors"

export async function handleListSkills(c: Context) {
  try {
    const skills = await discoverSkills()

    return c.json({
      success: true,
      skills
    })
  } catch (error) {
    console.error("[sidecar] List skills error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export async function handleGetSkillDetail(c: Context) {
  try {
    const skillId = c.req.param("skillId")?.trim()
    if (!skillId) {
      throw new BadRequestError("Skill id is required")
    }

    const skill = await getSkillDetailById(skillId)
    if (!skill) {
      throw new NotFoundError(`Skill '${skillId}' was not found`)
    }

    return c.json({
      success: true,
      skill
    })
  } catch (error) {
    console.error("[sidecar] Get skill detail error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export async function handleDeleteSkill(c: Context) {
  try {
    const skillId = c.req.param("skillId")?.trim()
    if (!skillId) {
      throw new BadRequestError("Skill id is required")
    }

    const parsedSkillId = parseSkillId(skillId)
    if (!parsedSkillId) {
      throw new BadRequestError(`Invalid skill id '${skillId}'`)
    }

    if (parsedSkillId.source !== "user") {
      throw new ForbiddenError("Built-in skills cannot be uninstalled")
    }

    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new NotFoundError(`Skill '${skillId}' was not found`)
    }

    await uninstallUserSkill(skill)

    return c.json({
      success: true
    })
  } catch (error) {
    console.error("[sidecar] Delete skill error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
