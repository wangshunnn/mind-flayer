import { locale } from "@tauri-apps/plugin-os"
import { useEffect, useState } from "react"
import { useSetting } from "@/hooks/use-settings-store"
import i18n from "@/lib/i18n"
import type { Language } from "@/types/settings"

type ActualLanguage = "en" | "zh-CN"

/**
 * Hook to manage application language with Tauri OS API detection and store persistence
 */
export function useLanguage() {
  const [language, setLanguageValue] = useSetting("language")
  const [isDetecting, setIsDetecting] = useState(true)

  // Detect system language on mount
  useEffect(() => {
    const detectSystemLanguage = async () => {
      try {
        const systemLocale = await locale()
        // Map system locale to our supported languages
        // zh-CN, zh-TW, zh-HK, etc. -> zh-CN (Simplified Chinese)
        // Everything else -> en (English)
        const detectedLanguage: ActualLanguage = systemLocale?.startsWith("zh") ? "zh-CN" : "en"

        // If user chose "system", use detected language
        if (language === "system") {
          i18n.changeLanguage(detectedLanguage)
        } else {
          // Apply user's explicit language choice
          i18n.changeLanguage(language)
        }
      } catch (error) {
        console.error("Failed to detect system language:", error)
        // Fallback to English if detection fails
        if (language === "system") {
          i18n.changeLanguage("en")
        }
      }

      setIsDetecting(false)
    }

    detectSystemLanguage()
  }, [language])

  const changeLanguage = async (lang: Language) => {
    await setLanguageValue(lang)

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
