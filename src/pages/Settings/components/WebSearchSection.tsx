import { CircleIcon, Eye, EyeOff, Loader2Icon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { WEB_SEARCH_PROVIDERS } from "@/lib/provider-constants"
import { cn } from "@/lib/utils"
import type { ProviderFormData } from "@/types/settings"

interface WebSearchSectionProps {
  activeProvider: string
  setActiveProvider: (id: string) => void
  formData: Record<string, ProviderFormData>
  setFormData: React.Dispatch<React.SetStateAction<Record<string, ProviderFormData>>>
  onSave: (providerId: string) => Promise<void>
  onClear: (providerId: string) => Promise<void>
  saveStatus: "idle" | "submitting" | "success" | "error"
  activeError: string | null
  enabledProviders: Record<string, boolean>
  setEnabledProviders: (value: Record<string, boolean>) => Promise<void>
  storedProviders: Record<string, boolean>
  resetSaveFeedback: () => void
  isSaveDisabled: boolean
  isClearDisabled: boolean
}

export function WebSearchSection({
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
  storedProviders,
  resetSaveFeedback,
  isSaveDisabled,
  isClearDisabled
}: WebSearchSectionProps) {
  const { t } = useTranslation("settings")
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="flex flex-col bg-setting-background-highlight space-y-6 py-6 px-4 rounded-md">
      {/* Horizontal Provider Buttons */}
      <div className="flex flex-wrap gap-2">
        {WEB_SEARCH_PROVIDERS.map(provider => {
          const ProviderIcon = provider.icon
          const providerEnabled = enabledProviders[provider.id] ?? false
          const isActive = activeProvider === provider.id
          return (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              onClick={() => {
                setActiveProvider(provider.id)
                setShowPassword(false)
              }}
              className={cn(
                "rounded-full gap-2 h-8",
                isActive &&
                  cn(
                    "border-brand-green-light bg-brand-green-light hover:bg-brand-green-light",
                    "dark:border-brand-green-light/50 dark:bg-brand-green-light/50 dark:hover:bg-brand-green-light/50"
                  )
              )}
            >
              <ProviderIcon className="size-4 shrink-0" />
              <span>{provider.name}</span>
              {providerEnabled && <CircleIcon className="size-2 fill-current text-brand-green" />}
              {!providerEnabled && <CircleIcon className="size-2" />}
            </Button>
          )
        })}
      </div>

      <Separator />

      {/* Provider Form */}
      {WEB_SEARCH_PROVIDERS.map(provider => {
        if (provider.id !== activeProvider) return null
        const data = formData[provider.id]

        return (
          <div key={provider.id} className={cn("max-w-2xl space-y-6 transition-opacity")}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">{provider.name}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("providers.enable")}</span>
                <Switch
                  checked={enabledProviders[provider.id] ?? false}
                  onCheckedChange={async checked => {
                    // Check if API key is saved when enabling
                    if (checked && !storedProviders[provider.id]) {
                      toast.error(t("providers.toast.apiKeyRequired"))
                      return
                    }
                    resetSaveFeedback()
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

            {/* Error Display */}
            {activeError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {activeError}
              </div>
            )}

            {/* Action Buttons */}
            <Field orientation="horizontal">
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
