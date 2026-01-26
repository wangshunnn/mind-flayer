import { useTranslation } from "react-i18next"
import { Separator } from "@/components/ui/separator"

export function AboutSection() {
  const { t } = useTranslation("settings")

  return (
    <div className="space-y-6 pt-4">
      <div>
        <div className="text-xl font-semibold">{t("about.title")}</div>
        <p className="mt-1 text-sm text-muted-foreground">{t("about.description")}</p>
      </div>
      <Separator />
      <div className="max-w-2xl">
        <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
      </div>
    </div>
  )
}
