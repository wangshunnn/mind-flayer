import { CircleIcon, Eye, EyeOff, Loader2Icon, Lock } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { MODEL_PROVIDERS } from "@/lib/provider-constants"
import { cn } from "@/lib/utils"
import type { ProviderFormData } from "@/types/settings"

interface ProviderSectionProps {
  activeProvider: string
  setActiveProvider: (id: string) => void
  formData: Record<string, ProviderFormData>
  setFormData: React.Dispatch<React.SetStateAction<Record<string, ProviderFormData>>>
  onSave: (providerId: string) => Promise<void>
  onClear: (providerId: string) => Promise<void>
  saveStatus: "idle" | "submitting" | "success" | "error"
  activeError: string | null
  isLoading: boolean
  enabledProviders: Record<string, boolean>
  setEnabledProviders: (value: Record<string, boolean>) => Promise<void>
  resetSaveFeedback: () => void
  isSaveDisabled: boolean
  isClearDisabled: boolean
}

export function ProviderSection({
  activeProvider,
  setActiveProvider,
  formData,
  setFormData,
  onSave,
  onClear,
  saveStatus,
  activeError,
  enabledProviders,
  setEnabledProviders,
  resetSaveFeedback,
  isSaveDisabled,
  isClearDisabled
}: ProviderSectionProps) {
  const { t } = useTranslation("settings")
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="space-y-6 pt-4 flex-1 flex flex-col min-h-0">
      {/* Horizontal Provider Buttons */}
      <div className="flex flex-wrap gap-2">
        {MODEL_PROVIDERS.map(provider => {
          const ProviderIcon = provider.icon
          const providerLocked = provider.id === "openai" || provider.id === "anthropic"
          const providerEnabled =
            provider.id !== "openai" &&
            provider.id !== "anthropic" &&
            (formData[provider.id]?.enabled ?? true)
          const isActive = activeProvider === provider.id
          return (
            <Button
              key={provider.id}
              type="button"
              variant={isActive ? "default" : "outline"}
              onClick={() => {
                setActiveProvider(provider.id)
                setShowPassword(false)
              }}
              className="rounded-full gap-2 h-8"
            >
              <ProviderIcon className="size-3.5 shrink-0 pl-0.5" />
              <span className="px-0">{provider.name}</span>
              {providerLocked && <Lock className="size-3" />}
              {!providerLocked && providerEnabled && (
                <CircleIcon className="size-2 fill-current text-brand-green" />
              )}
            </Button>
          )
        })}
      </div>

      <Separator />

      {/* Provider Form */}
      {MODEL_PROVIDERS.map(provider => {
        if (provider.id !== activeProvider) return null
        const data = formData[provider.id]
        const providerLocked = provider.id === "openai" || provider.id === "anthropic"
        const providerEnabled = !providerLocked && (data?.enabled ?? true)

        return (
          <div
            key={provider.id}
            className={cn(
              "max-w-2xl space-y-6 transition-opacity",
              !providerEnabled && "opacity-60"
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">{provider.name}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("providers.enable")}</span>
                <Switch
                  checked={data?.enabled ?? false}
                  disabled={providerLocked}
                  onCheckedChange={async checked => {
                    if (providerLocked) return
                    resetSaveFeedback()
                    setFormData(prev => ({
                      ...prev,
                      [provider.id]: {
                        ...prev[provider.id],
                        enabled: checked
                      }
                    }))
                    await setEnabledProviders({
                      ...enabledProviders,
                      [provider.id]: checked
                    })
                  }}
                />
              </div>
            </div>

            {/* API Key Field */}
            <Field>
              <FieldLabel htmlFor={`${provider.id}-api-key`}>API Key</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${provider.id}-api-key`}
                  type={showPassword ? "text" : "password"}
                  disabled={providerLocked}
                  placeholder={t("providers.apiKeyPlaceholder", {
                    provider: provider.name
                  })}
                  value={data?.apiKey || ""}
                  onChange={e => {
                    resetSaveFeedback()
                    setFormData(prev => ({
                      ...prev,
                      [provider.id]: {
                        ...prev[provider.id],
                        apiKey: e.target.value
                      }
                    }))
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                {provider.apiKeyUrl && (
                  <a href={provider.apiKeyUrl} target="_blank" rel="noopener noreferrer">
                    {t("providers.getApiKey")}
                  </a>
                )}
              </FieldDescription>
            </Field>

            {/* Base URL Field */}
            <Field>
              <FieldLabel htmlFor={`${provider.id}-base-url`}>Base URL </FieldLabel>
              <Input
                id={`${provider.id}-base-url`}
                type="url"
                disabled={providerLocked}
                placeholder={provider.defaultBaseUrl}
                value={data?.baseUrl === provider.defaultBaseUrl ? "" : data?.baseUrl}
                onChange={e => {
                  resetSaveFeedback()
                  setFormData(prev => ({
                    ...prev,
                    [provider.id]: {
                      ...prev[provider.id],
                      baseUrl: e.target.value
                    }
                  }))
                }}
              />
              <FieldDescription>{t("providers.baseUrlOptional")}</FieldDescription>
            </Field>

            {/* Error Display */}
            {activeError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {activeError}
              </div>
            )}

            {/* Action Buttons */}
            <Field orientation="horizontal" className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onClear(provider.id)}
                disabled={isClearDisabled}
              >
                {t("providers.clear")}
              </Button>
              <Button type="button" onClick={() => onSave(provider.id)} disabled={isSaveDisabled}>
                {saveStatus === "submitting" && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                )}
                {saveStatus === "success"
                  ? t("providers.saved")
                  : saveStatus === "submitting"
                    ? t("providers.saving")
                    : t("providers.save")}
              </Button>
            </Field>
          </div>
        )
      })}
    </div>
  )
}
