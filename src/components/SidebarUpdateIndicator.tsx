import { ArrowDownToLineIcon, LoaderCircleIcon, RotateCwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import type { AppUpdaterStatus } from "@/lib/updater"

interface SidebarUpdateIndicatorProps {
  status: AppUpdaterStatus
  onInstall: () => void | Promise<void>
  onRestart: () => void | Promise<void>
}

export function SidebarUpdateIndicator({
  status,
  onInstall,
  onRestart
}: SidebarUpdateIndicatorProps) {
  const { t } = useTranslation("settings")

  if (status === "installing") {
    return (
      <Button
        variant="default"
        size="sm"
        disabled
        className="h-6 shrink-0 rounded-full text-xs font-normal shadow-none pb-px"
      >
        <LoaderCircleIcon className="size-3.5 animate-spin" />
        {t("about.updater.sidebar.installing")}
      </Button>
    )
  }

  if (status === "restart-required") {
    return (
      <Button
        size="sm"
        className="h-6 shrink-0 rounded-full text-xs font-normal shadow-none pb-px"
        onClick={() => void onRestart()}
      >
        <RotateCwIcon className="size-3.5" />
        {t("about.updater.sidebar.restart")}
      </Button>
    )
  }

  if (status === "update-available" || status === "error") {
    return (
      <Button
        variant="default"
        size="sm"
        className="h-6 shrink-0 rounded-full text-xs font-normal shadow-none pb-px"
        onClick={() => void onInstall()}
      >
        <ArrowDownToLineIcon className="size-3.5" />
        {status === "error"
          ? t("about.updater.sidebar.retryInstall")
          : t("about.updater.sidebar.updateReady")}
      </Button>
    )
  }

  return null
}
