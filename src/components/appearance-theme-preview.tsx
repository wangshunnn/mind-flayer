import { useTranslation } from "react-i18next"
import { getAppearanceThemePreviewColors } from "@/lib/appearance-themes"
import { APPEARANCE_THEME_IDS, type AppearanceThemeId } from "@/types/settings"

type AppearanceThemePreviewProps = {
  themeId: AppearanceThemeId
  label: string
  resolvedTheme: "light" | "dark"
  swatchClassName?: string
}

export function AppearanceThemePreview({
  themeId,
  label,
  resolvedTheme,
  swatchClassName = "size-3"
}: AppearanceThemePreviewProps) {
  const previewColors = getAppearanceThemePreviewColors(themeId, resolvedTheme)

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="flex shrink-0 items-center gap-1">
        {previewColors.map(color => (
          <span
            key={`${themeId}-${resolvedTheme}-${color}`}
            className={`${swatchClassName} rounded-full border border-black/10 dark:border-white/10`}
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}

export function useAppearanceThemeLabels(): Record<AppearanceThemeId, string> {
  const { t } = useTranslation("settings")

  return {
    forest: t("general.appearanceThemes.forest"),
    sand: t("general.appearanceThemes.sand"),
    workbench: t("general.appearanceThemes.workbench"),
    graphite: t("general.appearanceThemes.graphite")
  }
}

export function useAppearanceThemeOptions() {
  const labels = useAppearanceThemeLabels()

  return APPEARANCE_THEME_IDS.map(themeId => ({
    themeId,
    label: labels[themeId]
  }))
}
