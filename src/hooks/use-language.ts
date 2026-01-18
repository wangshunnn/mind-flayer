import { locale } from "@tauri-apps/plugin-os"
import { useEffect, useState } from "react"
import i18n from "@/lib/i18n"

type Language = "en" | "zh-CN" | "system"
type ActualLanguage = "en" | "zh-CN"

const STORAGE_KEY = "settings-language"

/**
 * Hook to manage application language with Tauri OS API detection and localStorage persistence
 * Follows the same pattern as useTheme and useFontFamily
 */
export function useLanguage() {
  const [language, setLanguageState] = useState<Language>(() => {
    // Check localStorage first (user preference takes priority)
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null
    return stored || "system" // Default to system language
  })

  const [isDetecting, setIsDetecting] = useState(true)

  // Detect system language on mount
  useEffect(() => {
    const detectSystemLanguage = async () => {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null

      try {
        const systemLocale = await locale()
        // Map system locale to our supported languages
        // zh-CN, zh-TW, zh-HK, etc. -> zh-CN (Simplified Chinese)
        // Everything else -> en (English)
        const detectedLanguage: ActualLanguage = systemLocale?.startsWith("zh") ? "zh-CN" : "en"

        // If user chose "system" or no preference stored, use detected language
        if (!stored || stored === "system") {
          i18n.changeLanguage(detectedLanguage)
          if (!stored) {
            localStorage.setItem(STORAGE_KEY, "system")
            setLanguageState("system")
          }
        } else {
          // Apply user's explicit language choice
          i18n.changeLanguage(stored)
        }
      } catch (error) {
        console.error("Failed to detect system language:", error)
        // Fallback to English if detection fails
        if (!stored || stored === "system") {
          i18n.changeLanguage("en")
        }
      }

      setIsDetecting(false)
    }

    detectSystemLanguage()
  }, [])

  const changeLanguage = async (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang)
    setLanguageState(lang)

    if (lang === "system") {
      // Detect and apply system language
      try {
        const systemLocale = await locale()
        const detectedLanguage: ActualLanguage = systemLocale?.startsWith("zh") ? "zh-CN" : "en"
        i18n.changeLanguage(detectedLanguage)
      } catch (error) {
        console.error("Failed to detect system language:", error)
        i18n.changeLanguage("en")
      }
    } else {
      i18n.changeLanguage(lang)
    }
  }

  return { language, changeLanguage, isDetecting }
}
