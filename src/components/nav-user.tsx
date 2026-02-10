import {
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
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useLanguage } from "@/hooks/use-language"
import { useShortcutDisplay } from "@/hooks/use-shortcut-config"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import { ShortcutAction } from "@/types/settings"

export function NavUser() {
  const { t } = useTranslation(["common", "settings"])
  const { theme, setTheme } = useTheme()
  const { language, changeLanguage } = useLanguage()
  const openSettingsKeys = useShortcutDisplay(ShortcutAction.OPEN_SETTINGS)

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
                <DropdownMenuShortcut>
                  <KbdGroup>
                    <Kbd>{openSettingsKeys.join(" ")}</Kbd>
                  </KbdGroup>
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
