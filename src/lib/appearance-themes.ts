import type { AppearanceThemeId } from "@/types/settings"

export type AppearanceThemeMode = "light" | "dark"

export const APPEARANCE_THEME_CSS_VAR_NAMES = [
  "--background",
  "--background-transparent",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-impact",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-search",
  "--sidebar-search-hover",
  "--sidebar-search-border",
  "--sidebar-search-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--chat-input-bg-color",
  "--chat-input-hover-bg-color",
  "--chat-input-placeholder-color",
  "--brand-green-color",
  "--brand-green-color-light",
  "--setting-background",
  "--setting-sidebar",
  "--setting-background-highlight"
] as const

export type AppearanceThemeCssVarName = (typeof APPEARANCE_THEME_CSS_VAR_NAMES)[number]

export type AppearanceThemeTokens = Record<AppearanceThemeCssVarName, string>

type AppearanceThemePalette = {
  background: string
  foreground: string
  card: string
  primary: string
  primaryForeground: string
  secondary: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  border: string
  input: string
  ring: string
  sidebar: string
  sidebarImpact: string
  sidebarAccent: string
  sidebarAccentForeground: string
  sidebarSearch: string
  sidebarSearchHover: string
  sidebarSearchBorder: string
  sidebarSearchForeground: string
  sidebarBorder: string
  chatInputBg: string
  chatInputHoverBg: string
  chatInputPlaceholder: string
  brand: string
  brandSoft: string
  settingBackground: string
  settingSidebar: string
  settingHighlight: string
}

type AppearanceThemeDefinition = Record<AppearanceThemeMode, AppearanceThemeTokens>

function defineThemeTokens(palette: AppearanceThemePalette): AppearanceThemeTokens {
  return {
    "--background": palette.background,
    "--background-transparent": "oklch(0 0 0 / 0%)",
    "--foreground": palette.foreground,
    "--card": palette.card,
    "--card-foreground": palette.foreground,
    "--popover": palette.card,
    "--popover-foreground": palette.foreground,
    "--primary": palette.primary,
    "--primary-foreground": palette.primaryForeground,
    "--secondary": palette.secondary,
    "--secondary-foreground": palette.foreground,
    "--muted": palette.muted,
    "--muted-foreground": palette.mutedForeground,
    "--accent": palette.accent,
    "--accent-foreground": palette.accentForeground,
    "--border": palette.border,
    "--input": palette.input,
    "--ring": palette.ring,
    "--sidebar": palette.sidebar,
    "--sidebar-impact": palette.sidebarImpact,
    "--sidebar-foreground": palette.foreground,
    "--sidebar-primary": palette.primary,
    "--sidebar-primary-foreground": palette.primaryForeground,
    "--sidebar-accent": palette.sidebarAccent,
    "--sidebar-accent-foreground": palette.sidebarAccentForeground,
    "--sidebar-search": palette.sidebarSearch,
    "--sidebar-search-hover": palette.sidebarSearchHover,
    "--sidebar-search-border": palette.sidebarSearchBorder,
    "--sidebar-search-foreground": palette.sidebarSearchForeground,
    "--sidebar-border": palette.sidebarBorder,
    "--sidebar-ring": palette.ring,
    "--chat-input-bg-color": palette.chatInputBg,
    "--chat-input-hover-bg-color": palette.chatInputHoverBg,
    "--chat-input-placeholder-color": palette.chatInputPlaceholder,
    "--brand-green-color": palette.brand,
    "--brand-green-color-light": palette.brandSoft,
    "--setting-background": palette.settingBackground,
    "--setting-sidebar": palette.settingSidebar,
    "--setting-background-highlight": palette.settingHighlight
  }
}

export const APPEARANCE_THEME_PRESETS: Record<AppearanceThemeId, AppearanceThemeDefinition> = {
  forest: {
    light: defineThemeTokens({
      background: "oklch(0.986 0.006 152)",
      foreground: "oklch(0.216 0.014 152)",
      card: "oklch(0.995 0.004 152)",
      primary: "oklch(0.683 0.195 148.32)",
      primaryForeground: "oklch(0.985 0.004 152)",
      secondary: "oklch(0.972 0.006 152)",
      muted: "oklch(0.968 0.004 152)",
      mutedForeground: "oklch(0.522 0.018 152)",
      accent: "oklch(0.952 0.023 153)",
      accentForeground: "oklch(0.246 0.016 152)",
      border: "oklch(0.862 0.008 152 / 0.7)",
      input: "oklch(0.928 0.008 152)",
      ring: "oklch(0.683 0.195 148.32 / 0.45)",
      sidebar: "oklch(0.962 0.011 153 / 75%)",
      sidebarImpact: "oklch(0.978 0.006 153)",
      sidebarAccent: "oklch(0.932 0.018 153)",
      sidebarAccentForeground: "oklch(0.216 0.014 152)",
      sidebarSearch: "oklch(0.943 0.014 153 / 0.58)",
      sidebarSearchHover: "oklch(0.916 0.018 153 / 0.76)",
      sidebarSearchBorder: "oklch(1 0 0 / 14%)",
      sidebarSearchForeground: "oklch(0.388 0.016 152 / 75%)",
      sidebarBorder: "oklch(0.875 0.008 153)",
      chatInputBg: "oklch(0.993 0.004 152)",
      chatInputHoverBg: "oklch(0.957 0.012 153)",
      chatInputPlaceholder: "oklch(0.572 0.016 152)",
      brand: "oklch(0.683 0.195 148.32)",
      brandSoft: "oklch(0.943 0.03539 159.839)",
      settingBackground: "oklch(0.976 0.004 152)",
      settingSidebar: "oklch(0.949 0.009 153)",
      settingHighlight: "oklch(0.994 0.004 152)"
    }),
    dark: defineThemeTokens({
      background: "oklch(0.236 0.012 152)",
      foreground: "oklch(0.97 0.004 152)",
      card: "oklch(0.264 0.01 152)",
      primary: "oklch(0.709 0.161 148.5)",
      primaryForeground: "oklch(0.202 0.01 152)",
      secondary: "oklch(0.292 0.01 152)",
      muted: "oklch(0.288 0.008 152)",
      mutedForeground: "oklch(0.748 0.012 152)",
      accent: "oklch(0.338 0.03 153)",
      accentForeground: "oklch(0.97 0.004 152)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 14%)",
      ring: "oklch(0.709 0.161 148.5 / 0.42)",
      sidebar: "oklch(0.2 0.014 152 / 75%)",
      sidebarImpact: "oklch(0.246 0.01 152)",
      sidebarAccent: "oklch(0.324 0.03 153 / 0.85)",
      sidebarAccentForeground: "oklch(0.97 0.004 152)",
      sidebarSearch: "oklch(0.3 0.014 152 / 0.58)",
      sidebarSearchHover: "oklch(0.342 0.02 153 / 0.72)",
      sidebarSearchBorder: "oklch(0 0 0 / 12%)",
      sidebarSearchForeground: "oklch(0.97 0.004 152 / 45%)",
      sidebarBorder: "oklch(1 0 0 / 10%)",
      chatInputBg: "oklch(0.311 0.008 152)",
      chatInputHoverBg: "oklch(0.356 0.018 153)",
      chatInputPlaceholder: "oklch(0.707 0.01 152)",
      brand: "oklch(0.709 0.161 148.5)",
      brandSoft: "oklch(0.45467 0.1285 148.952)",
      settingBackground: "oklch(0.232 0.01 152)",
      settingSidebar: "oklch(0.265 0.012 152)",
      settingHighlight: "oklch(0.312 0.01 152)"
    })
  },
  sand: {
    light: defineThemeTokens({
      background: "oklch(0.985 0.01 78)",
      foreground: "oklch(0.23 0.012 62)",
      card: "oklch(0.994 0.006 78)",
      primary: "oklch(0.684 0.151 63)",
      primaryForeground: "oklch(0.986 0.004 82)",
      secondary: "oklch(0.972 0.009 76)",
      muted: "oklch(0.968 0.007 74)",
      mutedForeground: "oklch(0.53 0.018 62)",
      accent: "oklch(0.95 0.019 70)",
      accentForeground: "oklch(0.245 0.012 62)",
      border: "oklch(0.858 0.01 68 / 0.72)",
      input: "oklch(0.93 0.01 74)",
      ring: "oklch(0.684 0.151 63 / 0.45)",
      sidebar: "oklch(0.959 0.013 72 / 75%)",
      sidebarImpact: "oklch(0.972 0.007 76)",
      sidebarAccent: "oklch(0.926 0.021 70)",
      sidebarAccentForeground: "oklch(0.23 0.012 62)",
      sidebarSearch: "oklch(0.939 0.014 72 / 0.58)",
      sidebarSearchHover: "oklch(0.914 0.019 70 / 0.76)",
      sidebarSearchBorder: "oklch(1 0 0 / 15%)",
      sidebarSearchForeground: "oklch(0.4 0.015 62 / 75%)",
      sidebarBorder: "oklch(0.868 0.009 70)",
      chatInputBg: "oklch(0.992 0.006 78)",
      chatInputHoverBg: "oklch(0.954 0.014 72)",
      chatInputPlaceholder: "oklch(0.586 0.018 62)",
      brand: "oklch(0.684 0.151 63)",
      brandSoft: "oklch(0.925 0.04 69)",
      settingBackground: "oklch(0.977 0.008 76)",
      settingSidebar: "oklch(0.949 0.012 72)",
      settingHighlight: "oklch(0.993 0.006 78)"
    }),
    dark: defineThemeTokens({
      background: "oklch(0.236 0.01 62)",
      foreground: "oklch(0.97 0.004 78)",
      card: "oklch(0.266 0.01 62)",
      primary: "oklch(0.742 0.127 67)",
      primaryForeground: "oklch(0.205 0.01 62)",
      secondary: "oklch(0.294 0.01 62)",
      muted: "oklch(0.29 0.008 62)",
      mutedForeground: "oklch(0.76 0.01 72)",
      accent: "oklch(0.342 0.024 67)",
      accentForeground: "oklch(0.97 0.004 78)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 14%)",
      ring: "oklch(0.742 0.127 67 / 0.42)",
      sidebar: "oklch(0.205 0.012 62 / 75%)",
      sidebarImpact: "oklch(0.248 0.009 62)",
      sidebarAccent: "oklch(0.326 0.024 67 / 0.85)",
      sidebarAccentForeground: "oklch(0.97 0.004 78)",
      sidebarSearch: "oklch(0.302 0.011 62 / 0.58)",
      sidebarSearchHover: "oklch(0.346 0.018 67 / 0.72)",
      sidebarSearchBorder: "oklch(0 0 0 / 12%)",
      sidebarSearchForeground: "oklch(0.97 0.004 78 / 45%)",
      sidebarBorder: "oklch(1 0 0 / 10%)",
      chatInputBg: "oklch(0.314 0.008 62)",
      chatInputHoverBg: "oklch(0.354 0.014 67)",
      chatInputPlaceholder: "oklch(0.724 0.01 72)",
      brand: "oklch(0.742 0.127 67)",
      brandSoft: "oklch(0.462 0.094 67)",
      settingBackground: "oklch(0.234 0.009 62)",
      settingSidebar: "oklch(0.268 0.01 62)",
      settingHighlight: "oklch(0.314 0.008 62)"
    })
  },
  workbench: {
    light: defineThemeTokens({
      background: "oklch(0.984 0.006 250)",
      foreground: "oklch(0.228 0.018 255)",
      card: "oklch(0.994 0.004 250)",
      primary: "oklch(0.621 0.167 253)",
      primaryForeground: "oklch(0.986 0.004 250)",
      secondary: "oklch(0.972 0.006 248)",
      muted: "oklch(0.966 0.005 248)",
      mutedForeground: "oklch(0.53 0.018 255)",
      accent: "oklch(0.946 0.017 250)",
      accentForeground: "oklch(0.242 0.018 255)",
      border: "oklch(0.852 0.008 250 / 0.72)",
      input: "oklch(0.93 0.008 250)",
      ring: "oklch(0.621 0.167 253 / 0.45)",
      sidebar: "oklch(0.956 0.01 250 / 75%)",
      sidebarImpact: "oklch(0.972 0.005 248)",
      sidebarAccent: "oklch(0.922 0.018 250)",
      sidebarAccentForeground: "oklch(0.228 0.018 255)",
      sidebarSearch: "oklch(0.936 0.012 250 / 0.58)",
      sidebarSearchHover: "oklch(0.908 0.017 250 / 0.76)",
      sidebarSearchBorder: "oklch(1 0 0 / 15%)",
      sidebarSearchForeground: "oklch(0.4 0.015 255 / 75%)",
      sidebarBorder: "oklch(0.865 0.008 250)",
      chatInputBg: "oklch(0.992 0.004 250)",
      chatInputHoverBg: "oklch(0.954 0.012 250)",
      chatInputPlaceholder: "oklch(0.58 0.016 255)",
      brand: "oklch(0.621 0.167 253)",
      brandSoft: "oklch(0.922 0.037 248)",
      settingBackground: "oklch(0.976 0.005 248)",
      settingSidebar: "oklch(0.948 0.008 250)",
      settingHighlight: "oklch(0.993 0.004 250)"
    }),
    dark: defineThemeTokens({
      background: "oklch(0.224 0.015 255)",
      foreground: "oklch(0.972 0.004 250)",
      card: "oklch(0.254 0.014 255)",
      primary: "oklch(0.696 0.154 251)",
      primaryForeground: "oklch(0.194 0.012 255)",
      secondary: "oklch(0.284 0.012 255)",
      muted: "oklch(0.282 0.011 255)",
      mutedForeground: "oklch(0.752 0.01 250)",
      accent: "oklch(0.33 0.035 252)",
      accentForeground: "oklch(0.972 0.004 250)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 14%)",
      ring: "oklch(0.696 0.154 251 / 0.42)",
      sidebar: "oklch(0.19 0.016 255 / 75%)",
      sidebarImpact: "oklch(0.238 0.014 255)",
      sidebarAccent: "oklch(0.318 0.034 252 / 0.85)",
      sidebarAccentForeground: "oklch(0.972 0.004 250)",
      sidebarSearch: "oklch(0.294 0.015 255 / 0.58)",
      sidebarSearchHover: "oklch(0.338 0.024 252 / 0.72)",
      sidebarSearchBorder: "oklch(0 0 0 / 12%)",
      sidebarSearchForeground: "oklch(0.972 0.004 250 / 45%)",
      sidebarBorder: "oklch(1 0 0 / 10%)",
      chatInputBg: "oklch(0.304 0.012 255)",
      chatInputHoverBg: "oklch(0.352 0.02 252)",
      chatInputPlaceholder: "oklch(0.724 0.01 250)",
      brand: "oklch(0.696 0.154 251)",
      brandSoft: "oklch(0.446 0.102 251)",
      settingBackground: "oklch(0.222 0.013 255)",
      settingSidebar: "oklch(0.256 0.014 255)",
      settingHighlight: "oklch(0.304 0.012 255)"
    })
  },
  graphite: {
    light: defineThemeTokens({
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.205 0 0)",
      primaryForeground: "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      muted: "oklch(0.97 0 0)",
      mutedForeground: "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      accentForeground: "oklch(0.205 0 0)",
      border: "oklch(0 0 0 / 8%)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.708 0 0)",
      sidebar: "oklch(0.963 0.0016 148.69 / 75%)",
      sidebarImpact: "oklch(0.964 0 271.152)",
      sidebarAccent: "oklch(0 0 0 / 5%)",
      sidebarAccentForeground: "oklch(0 0 0 / 90%)",
      sidebarSearch: "oklch(0 0 0 / 2.8%)",
      sidebarSearchHover: "oklch(0 0 0 / 4.6%)",
      sidebarSearchBorder: "oklch(1 0 0 / 15%)",
      sidebarSearchForeground: "rgba(0, 0, 0, 0.4)",
      sidebarBorder: "oklch(0.922 0 0)",
      chatInputBg: "oklch(1 0 0)",
      chatInputHoverBg: "oklch(0.965 0 0)",
      chatInputPlaceholder: "oklch(0.61 0 271.152)",
      brand: "oklch(0.683 0.195 148.32)",
      brandSoft: "oklch(0.943 0.03539 159.839)",
      settingBackground: "oklch(0.97315 0 271.152)",
      settingSidebar: "oklch(0.94611 0 271.152)",
      settingHighlight: "oklch(1 0 0)"
    }),
    dark: defineThemeTokens({
      background: "oklch(0.23 0 271.152)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      primary: "oklch(0.922 0 0)",
      primaryForeground: "oklch(0.205 0 0)",
      secondary: "oklch(0.269 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedForeground: "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      accentForeground: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.556 0 0)",
      sidebar: "oklch(0.2 0 268 / 75%)",
      sidebarImpact: "#252525",
      sidebarAccent: "oklch(1 0 0 / 5%)",
      sidebarAccentForeground: "oklch(1 0 0 / 90%)",
      sidebarSearch: "oklch(1 0 0 / 2.8%)",
      sidebarSearchHover: "oklch(1 0 0 / 5.2%)",
      sidebarSearchBorder: "oklch(0 0 0 / 12%)",
      sidebarSearchForeground: "oklch(1 0 0 / 40%)",
      sidebarBorder: "oklch(1 0 0 / 10%)",
      chatInputBg: "oklch(0.309 0 271.152)",
      chatInputHoverBg: "oklch(0.359 0 271.152)",
      chatInputPlaceholder: "oklch(0.683 0 271.152)",
      brand: "oklch(0.62117 0.17972 148.03)",
      brandSoft: "oklch(0.45467 0.1285 148.952)",
      settingBackground: "oklch(0.23075 0 271.152)",
      settingSidebar: "oklch(0.26448 0 271.152)",
      settingHighlight: "oklch(0.30919 0 271.152)"
    })
  }
}

export function getAppearanceThemeTokens(
  themeId: AppearanceThemeId,
  mode: AppearanceThemeMode
): AppearanceThemeTokens {
  return APPEARANCE_THEME_PRESETS[themeId][mode]
}

export function getAppearanceThemePreviewColors(
  themeId: AppearanceThemeId,
  mode: AppearanceThemeMode
) {
  const tokens = getAppearanceThemeTokens(themeId, mode)

  return [tokens["--background"], tokens["--brand-green-color"], tokens["--sidebar"]] as const
}
