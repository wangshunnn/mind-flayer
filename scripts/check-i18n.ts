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

// i18next plural suffixes
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"]

function stripPluralSuffix(key: string): string {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length)
    }
  }
  return key
}

function normalizeKeys(keys: string[]): Set<string> {
  return new Set(keys.map(stripPluralSuffix))
}

function isPluralKey(key: string): boolean {
  return PLURAL_SUFFIXES.some(suffix => key.endsWith(suffix))
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

      // Normalize keys for comparison (handle plural forms)
      const normalizedBaseKeys = normalizeKeys(baseKeys)
      const normalizedLangKeys = normalizeKeys(langKeys)

      // Find missing keys (base keys not in lang, considering plural variations)
      const missingInLang = baseKeys.filter(key => {
        const baseKey = stripPluralSuffix(key)
        // If it's a plural key in base, check if the normalized form exists in lang
        if (isPluralKey(key)) {
          return !normalizedLangKeys.has(baseKey)
        }
        // If it's not a plural key, check exact match
        return !langKeys.includes(key) && !normalizedLangKeys.has(key)
      })

      // Find extra keys (lang keys not in base, considering plural variations)
      const extraInLang = langKeys.filter(key => {
        const langKey = stripPluralSuffix(key)
        // If it's a plural key in lang, check if the normalized form exists in base
        if (isPluralKey(key)) {
          return !normalizedBaseKeys.has(langKey)
        }
        // If it's not a plural key, check exact match
        return !baseKeys.includes(key) && !normalizedBaseKeys.has(key)
      })

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
        hasErrors = true
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
