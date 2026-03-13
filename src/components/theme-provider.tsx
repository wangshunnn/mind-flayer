import { createContext, useContext, useLayoutEffect, useState } from "react"
import { useSetting } from "@/hooks/use-settings-store"
import { APPEARANCE_THEME_CSS_VAR_NAMES, getAppearanceThemeTokens } from "@/lib/appearance-themes"
import type { AppearanceThemeId, Theme } from "@/types/settings"

export type ResolvedTheme = "dark" | "light"

type ThemeProviderProps = {
  children: React.ReactNode
}

type ThemeProviderState = {
  theme: Theme
  appearanceTheme: AppearanceThemeId
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => Promise<void>
  setAppearanceTheme: (appearanceTheme: AppearanceThemeId) => Promise<void>
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeValue] = useSetting("theme")
  const [appearanceTheme, setAppearanceThemeValue] = useSetting("appearanceTheme")
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light")

  useLayoutEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const applyTheme = () => {
      const nextResolvedTheme: ResolvedTheme =
        theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme
      const tokens = getAppearanceThemeTokens(appearanceTheme, nextResolvedTheme)

      root.classList.remove("light", "dark")
      root.classList.add(nextResolvedTheme)
      root.dataset.appearanceTheme = appearanceTheme
      root.style.colorScheme = nextResolvedTheme

      for (const variableName of APPEARANCE_THEME_CSS_VAR_NAMES) {
        root.style.setProperty(variableName, tokens[variableName])
      }

      setResolvedTheme(nextResolvedTheme)
    }

    applyTheme()

    const handleChange = () => {
      if (theme === "system") {
        applyTheme()
      }
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [appearanceTheme, theme])

  const value = {
    theme,
    appearanceTheme,
    resolvedTheme,
    setTheme: setThemeValue,
    setAppearanceTheme: setAppearanceThemeValue
  }

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
