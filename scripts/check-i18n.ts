#!/usr/bin/env tsx

import * as fs from "node:fs"
import * as path from "node:path"

interface TranslationObject {
  [key: string]: string | TranslationObject
}

function flattenKeys(obj: TranslationObject, prefix = ""): string[] {
  const keys: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === "object" && value !== null) {
      keys.push(...flattenKeys(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }

  return keys.sort()
}

function loadTranslation(filePath: string): TranslationObject {
  const content = fs.readFileSync(filePath, "utf-8")
  return JSON.parse(content)
}

function checkTranslations() {
  const localesDir = path.join(process.cwd(), "src", "locales")
  const namespaces = ["common", "settings", "chat", "tools", "actions"]
  const languages = ["en", "zh-CN"]

  let hasErrors = false

  console.log("🔍 Checking i18n translation completeness...\n")

  for (const namespace of namespaces) {
    console.log(`\n📦 Namespace: ${namespace}`)
    console.log("─".repeat(50))

    const translationsByLang: Record<string, string[]> = {}

    // Load all translations for this namespace
    for (const lang of languages) {
      const filePath = path.join(localesDir, lang, `${namespace}.json`)

      if (!fs.existsSync(filePath)) {
        console.error(`❌ Missing file: ${filePath}`)
        hasErrors = true
        continue
      }

      try {
        const translation = loadTranslation(filePath)
        translationsByLang[lang] = flattenKeys(translation)
      } catch (error) {
        console.error(
          `❌ Invalid JSON in ${filePath}:`,
          error instanceof Error ? error.message : error
        )
        hasErrors = true
      }
    }

    // Compare keys across languages
    const [baseLang, ...otherLangs] = languages
    const baseKeys = translationsByLang[baseLang] || []

    for (const lang of otherLangs) {
      const langKeys = translationsByLang[lang] || []

      // Find missing keys
      const missingInLang = baseKeys.filter(key => !langKeys.includes(key))
      const extraInLang = langKeys.filter(key => !baseKeys.includes(key))

      if (missingInLang.length > 0) {
        console.error(
          `\n❌ ${lang}: Missing ${missingInLang.length} keys (compared to ${baseLang}):`
        )
        for (const key of missingInLang) {
          console.error(`   - ${key}`)
        }
        hasErrors = true
      }

      if (extraInLang.length > 0) {
        console.warn(`\n⚠️  ${lang}: Has ${extraInLang.length} extra keys (not in ${baseLang}):`)
        for (const key of extraInLang) {
          console.warn(`   - ${key}`)
        }
      }

      if (missingInLang.length === 0 && extraInLang.length === 0) {
        console.log(`✅ ${lang}: All keys match (${langKeys.length} keys)`)
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`)

  if (hasErrors) {
    console.error("\n❌ Translation check failed! Please fix the errors above.\n")
    process.exit(1)
  } else {
    console.log("\n✅ All translations are complete and valid!\n")
    process.exit(0)
  }
}

checkTranslations()
