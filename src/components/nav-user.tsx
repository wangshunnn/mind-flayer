import {
  BrushCleaningIcon,
  LanguagesIcon,
  MonitorIcon,
  MoonStarIcon,
  PaletteIcon,
  Settings,
  SunIcon
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useLanguage } from "@/hooks/use-language"
import { useShortcutDisplay } from "@/hooks/use-shortcut-config"
import { getAppearanceThemePreviewColors } from "@/lib/appearance-themes"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import { APPEARANCE_THEME_IDS, type AppearanceThemeId, ShortcutAction } from "@/types/settings"

function AppearanceThemePreview({
  themeId,
  label,
  resolvedTheme
}: {
  themeId: AppearanceThemeId
  label: string
  resolvedTheme: "light" | "dark"
}) {
  const previewColors = getAppearanceThemePreviewColors(themeId, resolvedTheme)

  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span>{label}</span>
      <span aria-hidden className="flex items-center gap-1.5">
        {previewColors.map(color => (
          <span
            key={`${themeId}-${resolvedTheme}-${color}`}
            className="size-2.5 rounded-full border border-black/10 dark:border-white/10"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
    </span>
  )
}

export function NavUser() {
  const { t } = useTranslation(["common", "settings"])
  const { theme, setTheme, appearanceTheme, setAppearanceTheme, resolvedTheme } = useTheme()
  const { language, changeLanguage } = useLanguage()
  const shortcutKeys = useShortcutDisplay(ShortcutAction.OPEN_SETTINGS)
  const appearanceThemeLabels: Record<AppearanceThemeId, string> = {
    forest: t("general.appearanceThemes.forest", { ns: "settings" }),
    sand: t("general.appearanceThemes.sand", { ns: "settings" }),
    workbench: t("general.appearanceThemes.workbench", { ns: "settings" }),
    graphite: t("general.appearanceThemes.graphite", { ns: "settings" })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              asChild
              className={cn(
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                "font-light",
                "group/is-nav-user"
              )}
            >
              <div>
                <Settings className="size-4!" />
                <span>{t("nav.settings")}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-max w-(--radix-dropdown-menu-trigger-width) rounded-lg"
            side="top"
            align="center"
            sideOffset={8}
          >
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PaletteIcon />
                {t("theme.title")}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent sideOffset={4} alignOffset={-4}>
                  <DropdownMenuGroup>
                    <DropdownMenuRadioGroup
                      value={theme}
                      onValueChange={setTheme as (value: string) => void}
                    >
                      <DropdownMenuRadioItem value="light">
                        <SunIcon />
                        {t("theme.light")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <MoonStarIcon />
                        {t("theme.dark")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system">
                        <MonitorIcon />
                        {t("theme.system")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <BrushCleaningIcon />
                {t("general.appearanceTheme", { ns: "settings" })}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent sideOffset={4} alignOffset={-4} className="min-w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuRadioGroup
                      value={appearanceTheme}
                      onValueChange={value => void setAppearanceTheme(value as AppearanceThemeId)}
                    >
                      {APPEARANCE_THEME_IDS.map(themeId => (
                        <DropdownMenuRadioItem key={themeId} value={themeId}>
                          <AppearanceThemePreview
                            themeId={themeId}
                            label={appearanceThemeLabels[themeId]}
                            resolvedTheme={resolvedTheme}
                          />
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LanguagesIcon />
                {t("general.language", { ns: "settings" })}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent sideOffset={4} alignOffset={-4}>
                  <DropdownMenuGroup>
                    <DropdownMenuRadioGroup
                      value={language}
                      onValueChange={changeLanguage as (value: string) => void}
                    >
                      <DropdownMenuRadioItem value="zh-CN">
                        {t("general.languageChinese", { ns: "settings" })}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="en">
                        {t("general.languageEnglish", { ns: "settings" })}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system">
                        {t("general.languageSystem", { ns: "settings" })}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openSettingsWindow(SettingsSection.GENERAL)}>
                <Settings />
                {t("nav.settings")}
                <DropdownMenuShortcut>{shortcutKeys.join("")}</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
