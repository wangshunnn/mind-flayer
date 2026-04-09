import { CheckIcon, Loader2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useSettingWithLoaded } from "@/hooks/use-settings-store"
import { SettingGroup, SettingLabel } from "./shared"

export function AdvancedSection() {
  const { t } = useTranslation("settings")
  const [storedProxyUrl, setStoredProxyUrl, isLoaded] = useSettingWithLoaded("proxyUrl")
  const [draftProxyUrl, setDraftProxyUrl] = useState("")
  const [saveStatus, setSaveStatus] = useState<"idle" | "submitting" | "success">("idle")
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isLoaded) {
      return
    }

    setDraftProxyUrl(storedProxyUrl)
  }, [isLoaded, storedProxyUrl])

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const normalizedStoredProxyUrl = storedProxyUrl.trim()
  const normalizedDraftProxyUrl = draftProxyUrl.trim()
  const hasChanges = normalizedDraftProxyUrl !== normalizedStoredProxyUrl
  const canClear = normalizedDraftProxyUrl.length > 0 || normalizedStoredProxyUrl.length > 0

  const resetSaveStatus = () => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
    setSaveStatus("idle")
  }

  const handleSave = async () => {
    if (!hasChanges) {
      return
    }

    resetSaveStatus()
    setSaveStatus("submitting")
    await setStoredProxyUrl(normalizedDraftProxyUrl)
    setDraftProxyUrl(normalizedDraftProxyUrl)
    setSaveStatus("success")
    successTimeoutRef.current = setTimeout(() => {
      setSaveStatus("idle")
    }, 1500)
  }

  const handleClear = async () => {
    if (!canClear) {
      return
    }

    resetSaveStatus()
    setSaveStatus("submitting")
    await setStoredProxyUrl("")
    setDraftProxyUrl("")
    setSaveStatus("success")
    successTimeoutRef.current = setTimeout(() => {
      setSaveStatus("idle")
    }, 1500)
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <SettingLabel>{t("advanced.groups.network")}</SettingLabel>
        <SettingGroup>
          <div className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="proxy-url">{t("advanced.proxyUrl")}</FieldLabel>
              <Input
                id="proxy-url"
                value={draftProxyUrl}
                onChange={event => {
                  resetSaveStatus()
                  setDraftProxyUrl(event.target.value)
                }}
                placeholder={t("advanced.proxyUrlPlaceholder")}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <FieldDescription>{t("advanced.proxyUrlDescription")}</FieldDescription>
              <FieldDescription>{t("advanced.proxyUrlRestartHint")}</FieldDescription>
            </Field>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-muted-foreground">
                {hasChanges ? t("advanced.unsavedChanges") : "\u00a0"}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClear}
                  disabled={!canClear || saveStatus === "submitting"}
                >
                  {t("providers.clear")}
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || saveStatus === "submitting"}
                >
                  {saveStatus === "submitting" && (
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                  )}
                  {saveStatus === "success" ? <CheckIcon className="size-4" /> : null}
                  {saveStatus === "success"
                    ? t("providers.saved")
                    : saveStatus === "submitting"
                      ? t("providers.saving")
                      : t("providers.save")}
                </Button>
              </div>
            </div>
          </div>
        </SettingGroup>
      </div>
    </div>
  )
}
