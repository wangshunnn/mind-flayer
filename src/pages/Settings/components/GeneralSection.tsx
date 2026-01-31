import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/theme-provider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/hooks/use-language"
import { useSetting } from "@/hooks/use-settings-store"
import { SettingGroup } from "./shared"

export function GeneralSection() {
  const { t } = useTranslation("settings")
  const { language, changeLanguage } = useLanguage()
  const { theme, setTheme } = useTheme()
  const [autoLaunch, setAutoLaunch] = useSetting("autoLaunch")

  return (
    <div data-tauri-drag-region className="space-y-4 pb-8">
      <SettingGroup>
        {/* Appearance */}
        <div className="flex items-center justify-between py-2.5">
          <div className="text-base">{t("theme.title", { ns: "common" })}</div>
          <Select
            value={theme}
            onValueChange={value => setTheme(value as "light" | "dark" | "system")}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("theme.light", { ns: "common" })}</SelectItem>
              <SelectItem value="dark">{t("theme.dark", { ns: "common" })}</SelectItem>
              <SelectItem value="system">{t("theme.system", { ns: "common" })}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Language */}
        <div className="flex items-center justify-between py-2.5">
          <div className="text-base">{t("general.language")}</div>
          <Select
            value={language}
            onValueChange={value => changeLanguage(value as "en" | "zh-CN" | "system")}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN">{t("general.languageChinese")}</SelectItem>
              <SelectItem value="en">{t("general.languageEnglish")}</SelectItem>
              <SelectItem value="system">{t("general.languageSystem")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingGroup>

      <SettingGroup>
        {/* Auto Launch */}
        <div className="flex items-center justify-between py-2.5">
          <div className="text-base">{t("general.autoLaunch")}</div>
          <Switch checked={autoLaunch} onCheckedChange={setAutoLaunch} />
        </div>
      </SettingGroup>
    </div>
  )
}
