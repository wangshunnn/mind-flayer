import {
  GhostIcon,
  LanguagesIcon,
  MonitorIcon,
  MoonStarIcon,
  PaletteIcon,
  Settings,
  SunIcon
} from "lucide-react"
import { useTranslation } from "react-i18next"
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
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { useLanguage } from "@/hooks/use-language"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import { useTheme } from "./theme-provider"
import { Button } from "./ui/button"
import { Kbd, KbdGroup } from "./ui/kbd"

export function NavUser() {
  const { t } = useTranslation(["common", "settings"])
  const { theme, setTheme } = useTheme()
  const { language, changeLanguage } = useLanguage()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="size-8 transition-transform hover:rotate-12">
              <GhostIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-max w-44 rounded-lg"
            side="top"
            align="start"
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
                    <Kbd>⌘</Kbd>
                    <Kbd>,</Kbd>
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
