import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useSettingWithLoaded } from "@/hooks/use-settings-store"
import {
  SettingActionButtonContent,
  type SettingActionFeedback,
  SettingGroup,
  SettingLabel
} from "./shared"

export function AdvancedSection() {
  const { t } = useTranslation("settings")
  const [storedProxyUrl, setStoredProxyUrl, isLoaded] = useSettingWithLoaded("proxyUrl")
  const [draftProxyUrl, setDraftProxyUrl] = useState("")
  const [actionFeedback, setActionFeedback] = useState<SettingActionFeedback>({
    action: null,
    status: "idle"
  })
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
  const showSaveCheckIcon =
    actionFeedback.action === "save" &&
    actionFeedback.status !== "idle" &&
    actionFeedback.status !== "error"
  const showClearCheckIcon =
    actionFeedback.action === "clear" &&
    actionFeedback.status !== "idle" &&
    actionFeedback.status !== "error"

  const resetSaveStatus = () => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
    setActionFeedback({
      action: null,
      status: "idle"
    })
  }

  const handleSave = async () => {
    if (!hasChanges) {
      return
    }

    resetSaveStatus()
    setActionFeedback({
      action: "save",
      status: "submitting"
    })
    await setStoredProxyUrl(normalizedDraftProxyUrl)
    setDraftProxyUrl(normalizedDraftProxyUrl)
    setActionFeedback({
      action: "save",
      status: "success"
    })
    successTimeoutRef.current = setTimeout(() => {
      setActionFeedback({
        action: null,
        status: "idle"
      })
    }, 1500)
  }

  const handleClear = async () => {
    if (!canClear) {
      return
    }

    resetSaveStatus()
    setActionFeedback({
      action: "clear",
      status: "submitting"
    })
    await setStoredProxyUrl("")
    setDraftProxyUrl("")
    setActionFeedback({
      action: "clear",
      status: "success"
    })
    successTimeoutRef.current = setTimeout(() => {
      setActionFeedback({
        action: null,
        status: "idle"
      })
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
                  disabled={!canClear || actionFeedback.status === "submitting"}
                >
                  <SettingActionButtonContent
                    label={t("providers.clear")}
                    showCheckIcon={showClearCheckIcon}
                  />
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || actionFeedback.status === "submitting"}
                >
                  <SettingActionButtonContent
                    label={t("providers.save")}
                    showCheckIcon={showSaveCheckIcon}
                  />
                </Button>
              </div>
            </div>
          </div>
        </SettingGroup>
      </div>
    </div>
  )
}
