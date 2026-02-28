import { CheckIcon, Eye, EyeOff, Loader2Icon, Zap } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
import { ProviderLogo } from "@/components/ui/provider-logo"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { ProviderFormData } from "@/types/settings"

interface ChannelSectionProps {
  formData: Record<string, ProviderFormData>
  setFormData: React.Dispatch<React.SetStateAction<Record<string, ProviderFormData>>>
  onSave: (providerId: string) => Promise<void>
  onClear: (providerId: string) => Promise<void>
  onTest: () => Promise<void>
  saveStatus: "idle" | "submitting" | "success" | "error"
  testStatus: "idle" | "testing" | "success" | "error"
  activeError: string | null
  enabledChannels: Record<string, boolean>
  setEnabledChannels: (value: Record<string, boolean>) => Promise<void>
  storedProviders: Record<string, boolean>
  resetSaveFeedback: () => void
  isSaveDisabled: boolean
  isClearDisabled: boolean
}

const TELEGRAM_PROVIDER_ID = "telegram"

export function ChannelSection({
  formData,
  setFormData,
  onSave,
  onClear,
  onTest,
  saveStatus,
  testStatus,
  activeError,
  enabledChannels,
  setEnabledChannels,
  storedProviders,
  resetSaveFeedback,
  isSaveDisabled,
  isClearDisabled
}: ChannelSectionProps) {
  const { t } = useTranslation("settings")
  const [showToken, setShowToken] = useState(false)
  const data = formData[TELEGRAM_PROVIDER_ID]

  return (
    <div className="flex flex-col bg-setting-background-highlight space-y-6 py-6 px-4 rounded-md">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <ProviderLogo providerId={TELEGRAM_PROVIDER_ID} className="size-5" />
          Telegram
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("channels.enable")}</span>
          <Switch
            checked={enabledChannels.telegram ?? false}
            onCheckedChange={async checked => {
              if (checked && !storedProviders[TELEGRAM_PROVIDER_ID]) {
                toast.error(t("providers.toast.apiKeyRequired"))
                return
              }
              resetSaveFeedback()
              await setEnabledChannels({
                ...enabledChannels,
                telegram: checked
              })
            }}
          />
        </div>
      </div>

      <Separator />

      <div className="max-w-2xl space-y-6 transition-opacity">
        <Field>
          <FieldLabel htmlFor="telegram-bot-token">{t("channels.botToken")}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="telegram-bot-token"
              type={showToken ? "text" : "password"}
              placeholder={t("channels.botTokenPlaceholder")}
              value={data?.apiKey || ""}
              onChange={event => {
                resetSaveFeedback()
                setFormData(prev => ({
                  ...prev,
                  [TELEGRAM_PROVIDER_ID]: {
                    ...prev[TELEGRAM_PROVIDER_ID],
                    apiKey: event.target.value
                  }
                }))
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={() => setShowToken(!showToken)}
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
              {t("channels.openBotFather")}
            </a>
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="telegram-api-base-url">{t("channels.apiBaseUrl")}</FieldLabel>
          <Input
            id="telegram-api-base-url"
            type="url"
            placeholder="https://api.telegram.org"
            value={data?.baseUrl || ""}
            onChange={event => {
              resetSaveFeedback()
              setFormData(prev => ({
                ...prev,
                [TELEGRAM_PROVIDER_ID]: {
                  ...prev[TELEGRAM_PROVIDER_ID],
                  baseUrl: event.target.value
                }
              }))
            }}
          />
          <FieldDescription>{t("channels.apiBaseUrlOptional")}</FieldDescription>
        </Field>

        <div
          className={cn(
            "rounded-md border border-border/60 bg-muted/30 p-3 text-xs",
            "space-y-1 text-muted-foreground"
          )}
        >
          <p className="font-medium text-foreground">{t("channels.guideTitle")}</p>
          <p>{t("channels.guideDescription")}</p>
          <p>1. {t("channels.guideStep1")}</p>
          <p>2. {t("channels.guideStep2")}</p>
          <p>3. {t("channels.guideStep3")}</p>
        </div>

        {activeError && (
          <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
            {activeError}
          </div>
        )}

        <Field orientation="horizontal">
          <Button
            type="button"
            variant="outline"
            onClick={() => onClear(TELEGRAM_PROVIDER_ID)}
            disabled={isClearDisabled}
            className="w-18"
          >
            {t("providers.clear")}
          </Button>
          <Button
            type="button"
            onClick={() => onSave(TELEGRAM_PROVIDER_ID)}
            disabled={isSaveDisabled}
            className="w-18"
          >
            {saveStatus === "success" ? (
              <CheckIcon className="size-4 text-brand-green" />
            ) : saveStatus === "submitting" ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              t("providers.save")
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onTest}
            disabled={testStatus === "testing" || saveStatus === "submitting"}
            className="ml-auto min-w-32"
          >
            {testStatus === "testing" ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {t("channels.testingConnection")}
              </>
            ) : (
              <>
                <Zap className="size-4" />
                {t("channels.testConnection")}
              </>
            )}
          </Button>
        </Field>
      </div>
    </div>
  )
}
