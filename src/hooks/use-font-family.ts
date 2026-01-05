import { useEffect, useState } from "react"

export type FontFamily = "system" | "inter" | "custom"

interface FontConfig {
  name: string
  value: string
}

/**
 * Font preset configurations
 */
export const FONT_PRESETS: Record<FontFamily, FontConfig> = {
  system: {
    name: "System Default",
    value:
      'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Noto Sans CJK SC"'
  },
  inter: {
    name: "Inter (Recommended)",
    value:
      '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI"'
  },
  custom: {
    name: "Custom",
    value: ""
  }
}

const STORAGE_KEY = "mind-flayer-font-family"

/**
 * Font Family Management Hook
 * Provides font switching and persistence functionality
 */
export function useFontFamily() {
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored as FontFamily) || "system"
  })

  const [customFont, setCustomFont] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}-custom`) || ""
  })

  useEffect(() => {
    const root = document.documentElement
    const fontValue =
      fontFamily === "custom" && customFont ? customFont : FONT_PRESETS[fontFamily].value

    // 更新 CSS 变量
    root.style.setProperty("--default-font-family", fontValue)

    // 持久化存储
    localStorage.setItem(STORAGE_KEY, fontFamily)
    if (fontFamily === "custom") {
      localStorage.setItem(`${STORAGE_KEY}-custom`, customFont)
    }
  }, [fontFamily, customFont])

  const updateFontFamily = (font: FontFamily) => {
    setFontFamily(font)
  }

  const updateCustomFont = (font: string) => {
    setCustomFont(font)
    setFontFamily("custom")
  }

  return {
    fontFamily,
    customFont,
    updateFontFamily,
    updateCustomFont,
    presets: FONT_PRESETS
  }
}
