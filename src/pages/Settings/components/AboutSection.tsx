import { useTranslation } from "react-i18next"
import { Separator } from "@/components/ui/separator"

export function AboutSection() {
  const { t } = useTranslation("settings")

  return (
    <div className="space-y-6 pt-4">
      <div className="max-w-2xl">
        <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
      </div>
      <Separator />
    </div>
  )
}
