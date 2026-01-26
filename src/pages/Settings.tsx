import { useSearch } from "@tanstack/react-router"
import { emit, listen } from "@tauri-apps/api/event"
import {
  BadgeInfo,
  Bolt,
  Bot,
  Brain,
  CircleIcon,
  Eye,
  EyeOff,
  Keyboard,
  Layers,
  Loader2Icon,
  Lock,
  Search,
  Sparkles
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
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
import { useLatest } from "@/hooks/use-latest"
import { useProviderConfig } from "@/hooks/use-provider-config"
import { useSetting } from "@/hooks/use-settings-store"
import { cn } from "@/lib/utils"
import { SettingsSection } from "@/lib/window-manager"

interface ProviderFormData {
  apiKey: string
  baseUrl: string
  enabled: boolean
}

const MODEL_PROVIDERS = [
  {
    id: "minimax",
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1",
    apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    icon: Sparkles,
    models: [
      { label: "MiniMax M2.1", api_id: "MiniMax-M2.1" },
      { label: "MiniMax M2.1 lightning", api_id: "MiniMax-M2.1-lightning" },
      { label: "MiniMax M2", api_id: "MiniMax-M2" }
    ]
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    icon: Bot,
    models: [
      { label: "GPT-4", api_id: "gpt-4" },
      { label: "GPT-4 Turbo", api_id: "gpt-4-turbo" },
      { label: "GPT-3.5 Turbo", api_id: "gpt-3.5-turbo" }
    ]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    icon: Brain,
    models: [
      { label: "Claude Sonnet 4.5", api_id: "claude-sonnet-4-5-20251022" },
      { label: "Claude Opus 4.5", api_id: "claude-opus-4-5-20251101" }
    ]
  }
]

const WEB_SEARCH_PROVIDERS = [
  {
    id: "parallel",
    name: "Parallel",
    defaultBaseUrl: "",
    apiKeyUrl: "https://platform.parallel.ai/settings?tab=api-keys",
    icon: Search
  }
]

const ALL_PROVIDERS = [...MODEL_PROVIDERS, ...WEB_SEARCH_PROVIDERS]

const DEFAULT_FORM_DATA = ALL_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = { apiKey: "", baseUrl: "", enabled: false }
    return acc
  },
  {} as Record<string, ProviderFormData>
)

// Sections will use translations dynamically in component

export { MODEL_PROVIDERS }
export type { ProviderFormData }

export default function Settings() {
  const { t } = useTranslation("settings")
  const { language, changeLanguage } = useLanguage()
  const { theme, setTheme } = useTheme()
  // Use TanStack Router's search params from /settings route
  const searchParams = useSearch({ from: "/settings" })
  const [activeSection, setActiveSection] = useState<SettingsSection>(SettingsSection.GENERAL)
  const [activeProvider, setActiveProvider] = useState(MODEL_PROVIDERS[0].id)
  const [activeWebSearchProvider, setActiveWebSearchProvider] = useState(WEB_SEARCH_PROVIDERS[0].id)
  const [showPassword, setShowPassword] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formData, setFormData] = useState<Record<string, ProviderFormData>>(DEFAULT_FORM_DATA)
  const [storedProviders, setStoredProviders] = useState<Record<string, boolean>>({})

  const { saveConfig, getConfig, deleteConfig, isLoading, error } = useProviderConfig()
  const getConfigRef = useLatest(getConfig)
  const [enabledProviders, setEnabledProviders] = useSetting("enabledProviders")

  const resetSaveFeedback = useCallback(() => {
    setSaveStatus("idle")
    setSaveError(null)
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
  }, [])

  // Initialize activeSection from router search params (validated by Zod)
  useEffect(() => {
    // searchParams.tab has default value from route validation
    setActiveSection(searchParams.tab)
  }, [searchParams.tab])

  // Listen for cross-window tab change events
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      unlisten = await listen<SettingsSection>("settings-change-tab", event => {
        if (event.payload) {
          // Event payload is already a SettingsSection enum value
          setActiveSection(event.payload)
        }
      })
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  // Load saved config when provider changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: getConfigRef is stable via useLatest
  useEffect(() => {
    const loadConfig = async () => {
      // getConfigRef.current is stable via useLatest
      const config = await getConfigRef.current(activeProvider)
      if (config) {
        setFormData(prev => ({
          ...prev,
          [activeProvider]: {
            ...prev[activeProvider],
            apiKey: config.apiKey,
            baseUrl: config.baseUrl || "",
            enabled: enabledProviders[activeProvider] ?? true
          }
        }))
        setStoredProviders(prev => ({ ...prev, [activeProvider]: true }))
      } else {
        setFormData(prev => ({
          ...prev,
          [activeProvider]: {
            ...prev[activeProvider],
            enabled: enabledProviders[activeProvider] ?? true
          }
        }))
        setStoredProviders(prev => ({ ...prev, [activeProvider]: false }))
      }
    }
    loadConfig()
    resetSaveFeedback()
  }, [activeProvider, resetSaveFeedback, enabledProviders])

  // biome-ignore lint/correctness/useExhaustiveDependencies: getConfigRef is stable via useLatest
  useEffect(() => {
    const loadConfig = async () => {
      // getConfigRef.current is stable via useLatest
      const config = await getConfigRef.current(activeWebSearchProvider)
      if (config) {
        setFormData(prev => ({
          ...prev,
          [activeWebSearchProvider]: {
            ...prev[activeWebSearchProvider],
            apiKey: config.apiKey,
            baseUrl:
              config.baseUrl ||
              ALL_PROVIDERS.find(p => p.id === activeWebSearchProvider)?.defaultBaseUrl ||
              "",
            enabled: enabledProviders[activeWebSearchProvider] ?? true
          }
        }))
        setStoredProviders(prev => ({ ...prev, [activeWebSearchProvider]: true }))
      } else {
        setFormData(prev => ({
          ...prev,
          [activeWebSearchProvider]: {
            ...prev[activeWebSearchProvider],
            enabled: enabledProviders[activeWebSearchProvider] ?? true
          }
        }))
        setStoredProviders(prev => ({ ...prev, [activeWebSearchProvider]: false }))
      }
    }
    loadConfig()
    resetSaveFeedback()
  }, [activeWebSearchProvider, resetSaveFeedback, enabledProviders])

  const handleSave = async (providerId: string) => {
    resetSaveFeedback()
    const data = formData[providerId]
    if (!data.apiKey.trim()) {
      setSaveStatus("error")
      setSaveError("API Key is required")
      return
    }

    try {
      setSaveStatus("submitting")
      setSaveError(null)
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
      await saveConfig(providerId, data.apiKey.trim(), data.baseUrl.trim() || undefined)
      setStoredProviders(prev => ({ ...prev, [providerId]: true }))
      setSaveStatus("success")
      toast.success(t("providers.toast.saved"))

      // Emit event to notify other windows/components
      await emit("provider-config-changed", {
        provider: providerId,
        action: "saved"
      })

      successTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle")
      }, 1500)
    } catch (err) {
      toast.error(t("providers.toast.saveError"))
      setSaveStatus("error")
      setSaveError(
        `Failed to save configuration: ${err instanceof Error ? err.message : "Unknown error"}`
      )
    }
  }

  const handleClear = async (providerId: string) => {
    resetSaveFeedback()
    const data = formData[providerId]
    if (!data?.apiKey.trim()) {
      return
    }

    try {
      setSaveStatus("submitting")
      setSaveError(null)
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
      if (storedProviders[providerId]) {
        await deleteConfig(providerId)
      }
      setFormData(prev => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          apiKey: "",
          baseUrl: "",
          enabled: false
        }
      }))
      setStoredProviders(prev => ({ ...prev, [providerId]: false }))
      setSaveStatus("success")
      toast.success(t("providers.toast.deleted"))

      // Emit event to notify other windows/components
      await emit("provider-config-changed", {
        provider: providerId,
        action: "deleted"
      })

      successTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle")
      }, 1500)
    } catch (err) {
      toast.error(t("providers.toast.deleteError"))
      setSaveStatus("error")
      setSaveError(
        `Failed to delete configuration: ${err instanceof Error ? err.message : "Unknown error"}`
      )
    }
  }

  const activeError = saveError || error
  const isSaveBusy = saveStatus === "submitting" || saveStatus === "success"
  const currentData = formData[activeProvider]
  const isSaveDisabled = isSaveBusy || isLoading || !currentData?.apiKey.trim()
  const isClearDisabled = isSaveBusy || isLoading || !currentData?.apiKey.trim()
  const currentWebSearchData = formData[activeWebSearchProvider]
  const isWebSearchSaveDisabled = isSaveBusy || isLoading || !currentWebSearchData?.apiKey.trim()
  const isWebSearchClearDisabled = isSaveBusy || isLoading || !currentWebSearchData?.apiKey.trim()

  return (
    <div className="h-screen overflow-hidden flex">
      {/* Top drag region for macOS traffic lights */}
      <div data-tauri-drag-region className="z-50 fixed top-0 left-0 right-0 h-14.5" />

      {/* Main container */}
      <div className="bg-setting-background flex flex-1 overflow-hidden">
        {/* Left Sidebar - Sections */}
        <aside className="w-50 bg-setting-sidebar">
          <div className="flex h-full flex-col">
            {/* Top spacing for drag region */}
            <div className="h-12" />

            {/* Section Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-1">
              {[
                { id: SettingsSection.PROVIDERS, icon: Layers },
                { id: SettingsSection.WEB_SEARCH, icon: Search },
                { id: SettingsSection.GENERAL, icon: Bolt },
                { id: SettingsSection.ADVANCED, icon: Keyboard },
                { id: SettingsSection.ABOUT, icon: BadgeInfo }
              ].map(section => {
                const Icon = section.icon
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex w-full h-10.5 items-center gap-3 rounded-md px-3 py-2",
                      "text-sm transition-colors",
                      activeSection === section.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" />
                    <span>
                      {t(
                        `sections.${section.id}` as
                          | "sections.providers"
                          | "sections.web-search"
                          | "sections.general"
                          | "sections.advanced"
                          | "sections.about"
                      )}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          <div className="bg-transparent flex-1 overflow-auto flex flex-col">
            <div className="w-full p-5 flex-1 flex flex-col min-h-0">
              {/* Top spacing to align with sidebar first item */}
              {activeSection === SettingsSection.PROVIDERS && (
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
                            <span className="text-xs text-muted-foreground">
                              {t("providers.enable")}
                            </span>
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
                                {showPassword ? (
                                  <EyeOff className="size-4" />
                                ) : (
                                  <Eye className="size-4" />
                                )}
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>
                          <FieldDescription>
                            {provider.apiKeyUrl && (
                              <a
                                href={provider.apiKeyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
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
                            onClick={() => handleClear(provider.id)}
                            disabled={isClearDisabled}
                          >
                            {t("providers.clear")}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleSave(provider.id)}
                            disabled={isSaveDisabled}
                          >
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
              )}

              {activeSection === SettingsSection.WEB_SEARCH && (
                <div className="space-y-6 pt-4 flex-1 flex flex-col min-h-0">
                  {/* Horizontal Provider Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {WEB_SEARCH_PROVIDERS.map(provider => {
                      const ProviderIcon = provider.icon
                      const providerEnabled = formData[provider.id]?.enabled ?? true
                      const isActive = activeWebSearchProvider === provider.id
                      return (
                        <Button
                          key={provider.id}
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          onClick={() => {
                            setActiveWebSearchProvider(provider.id)
                            setShowPassword(false)
                          }}
                          className="rounded-full gap-2 h-8"
                        >
                          <ProviderIcon className="size-4 shrink-0" />
                          <span>{provider.name}</span>
                          {providerEnabled && (
                            <CircleIcon className="size-2 fill-current text-brand-green" />
                          )}
                        </Button>
                      )
                    })}
                  </div>

                  <Separator />

                  {/* Provider Form */}
                  {WEB_SEARCH_PROVIDERS.map(provider => {
                    if (provider.id !== activeWebSearchProvider) return null
                    const data = formData[provider.id]
                    const providerEnabled = data?.enabled ?? true

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
                            <span className="text-xs text-muted-foreground">
                              {t("providers.enable")}
                            </span>
                            <Switch
                              checked={data?.enabled ?? false}
                              onCheckedChange={async checked => {
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
                                {showPassword ? (
                                  <EyeOff className="size-4" />
                                ) : (
                                  <Eye className="size-4" />
                                )}
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>
                          <FieldDescription>
                            {provider.apiKeyUrl && (
                              <a
                                href={provider.apiKeyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
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
                        <Field orientation="horizontal" className="pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleClear(provider.id)}
                            disabled={isWebSearchClearDisabled}
                          >
                            {t("providers.clear")}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleSave(provider.id)}
                            disabled={isWebSearchSaveDisabled}
                          >
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
              )}

              {activeSection === SettingsSection.GENERAL && (
                <div className="space-y-1">
                  <div className="w-full space-y-0 bg-white px-4 rounded-md">
                    {/* Appearance */}
                    <div className="flex items-center justify-between py-3">
                      <div className="text-base">{t("theme.title", { ns: "common" })}</div>
                      <Select
                        value={theme}
                        onValueChange={value => setTheme(value as "light" | "dark" | "system")}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">
                            {t("theme.light", { ns: "common" })}
                          </SelectItem>
                          <SelectItem value="dark">{t("theme.dark", { ns: "common" })}</SelectItem>
                          <SelectItem value="system">
                            {t("theme.system", { ns: "common" })}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Language */}
                    <div className="flex items-center justify-between py-3">
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
                  </div>
                </div>
              )}

              {activeSection === SettingsSection.ADVANCED && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">{t("advanced.title")}</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("advanced.description")}
                    </p>
                  </div>
                  <Separator />
                  <div className="max-w-2xl">
                    <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
                  </div>
                </div>
              )}

              {activeSection === SettingsSection.ABOUT && (
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
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
