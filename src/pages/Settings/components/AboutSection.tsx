import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useAppUpdater } from "@/hooks/use-app-updater"
import { formatBytes, formatUpdateDate, toErrorMessage } from "@/lib/updater"
import { SettingGroup } from "./shared"

export function AboutSection() {
  const { t, i18n } = useTranslation("settings")
  const {
    availableUpdate,
    canCheckForUpdates,
    checkForUpdates,
    currentVersion,
    downloadedBytes,
    error,
    installUpdate,
    relaunchApp,
    status,
    totalBytes
  } = useAppUpdater()
  const locale = i18n.resolvedLanguage ?? "en"

  const handleCheckForUpdates = useCallback(async () => {
    try {
      await checkForUpdates()
    } catch (nextError) {
      toast.error(t("about.updater.toast.checkFailed"), {
        description: toErrorMessage(nextError) ?? undefined
      })
    }
  }, [checkForUpdates, t])

  const handleInstallUpdate = useCallback(async () => {
    try {
      await installUpdate()
    } catch (nextError) {
      toast.error(t("about.updater.toast.installFailed"), {
        description: toErrorMessage(nextError) ?? undefined
      })
    }
  }, [installUpdate, t])

  const handleRestart = useCallback(async () => {
    try {
      await relaunchApp()
    } catch (nextError) {
      toast.error(t("about.updater.toast.restartFailed"), {
        description: toErrorMessage(nextError) ?? undefined
      })
    }
  }, [relaunchApp, t])

  const statusLabel = (() => {
    switch (status) {
      case "unavailable":
        return t("about.updater.status.unavailable")
      case "checking":
        return t("about.updater.status.checking")
      case "up-to-date":
        return t("about.updater.status.upToDate")
      case "update-available":
        return t("about.updater.status.updateAvailable", {
          version: availableUpdate?.version ?? ""
        })
      case "installing":
        return t("about.updater.status.installing")
      case "restart-required":
        return t("about.updater.status.restartRequired")
      case "error":
        return t("about.updater.status.error")
      default:
        return t("about.updater.status.idle")
    }
  })()

  const actionButton = (() => {
    if (!canCheckForUpdates) {
      return (
        <Button variant="outline" disabled>
          {t("about.updater.buttons.productionOnly")}
        </Button>
      )
    }

    if (status === "installing") {
      return <Button disabled>{t("about.updater.buttons.installing")}</Button>
    }

    if (status === "restart-required") {
      return (
        <Button onClick={() => void handleRestart()}>{t("about.updater.buttons.restart")}</Button>
      )
    }

    if (status === "update-available" || (status === "error" && availableUpdate)) {
      return (
        <Button onClick={() => void handleInstallUpdate()}>
          {t("about.updater.buttons.downloadAndInstall")}
        </Button>
      )
    }

    return (
      <Button
        variant="outline"
        disabled={status === "checking"}
        onClick={() => void handleCheckForUpdates()}
      >
        {status === "checking"
          ? t("about.updater.buttons.checking")
          : t("about.updater.buttons.check")}
      </Button>
    )
  })()

  const formattedReleaseDate = formatUpdateDate(availableUpdate?.date ?? null, locale)
  const progressLabel =
    status === "installing"
      ? totalBytes
        ? t("about.updater.downloadProgress", {
            downloaded: formatBytes(downloadedBytes, locale),
            total: formatBytes(totalBytes, locale)
          })
        : downloadedBytes > 0
          ? t("about.updater.downloadProgressUnknownTotal", {
              downloaded: formatBytes(downloadedBytes, locale)
            })
          : null
      : null

  return (
    <div data-tauri-drag-region className="space-y-4 pb-8">
      <SettingGroup>
        <div className="flex items-center justify-between py-2.5">
          <div className="space-y-1">
            <div className="text-base">{t("about.versionLabel")}</div>
            <p className="text-xs text-muted-foreground">{t("about.versionDescription")}</p>
          </div>
          <div className="text-sm font-medium">{currentVersion ?? t("about.loading")}</div>
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4 py-2.5">
          <div className="space-y-1">
            <div className="text-base">{t("about.updater.title")}</div>
            <p className="text-sm text-muted-foreground">{statusLabel}</p>
            {progressLabel && <p className="text-xs text-muted-foreground">{progressLabel}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          {actionButton}
        </div>

        {availableUpdate && (
          <>
            <Separator />

            <div className="space-y-4 py-2.5">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium">
                  {t("about.updater.availableVersionLabel")}
                </div>
                <div className="text-sm text-muted-foreground">{availableUpdate.version}</div>
              </div>

              {formattedReleaseDate && (
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium">{t("about.updater.releaseDateLabel")}</div>
                  <div className="text-sm text-muted-foreground">{formattedReleaseDate}</div>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium">{t("about.updater.releaseNotesLabel")}</div>
                <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                  {availableUpdate.body?.trim() || t("about.updater.noReleaseNotes")}
                </p>
              </div>
            </div>
          </>
        )}
      </SettingGroup>
    </div>
  )
}
