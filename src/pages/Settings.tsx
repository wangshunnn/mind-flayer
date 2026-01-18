import { Link } from "@tanstack/react-router"
import {
  ArrowLeftToLineIcon,
  Bot,
  Brain,
  CircleIcon,
  Eye,
  EyeOff,
  Info,
  Key,
  Layers,
  Loader2Icon,
  Search,
  Settings2,
  Sparkles
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
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
import { useProviderConfig } from "@/hooks/use-provider-config"
import { cn } from "@/lib/utils"

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
    icon: Sparkles
  },
  { id: "openai", name: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", icon: Bot },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    icon: Brain
  }
]

const WEB_SEARCH_PROVIDERS = [
  { id: "parallel", name: "Parallel", defaultBaseUrl: "", icon: Search }
]

const ALL_PROVIDERS = [...MODEL_PROVIDERS, ...WEB_SEARCH_PROVIDERS]

const DEFAULT_FORM_DATA = ALL_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = { apiKey: "", baseUrl: provider.defaultBaseUrl, enabled: false }
    return acc
  },
  {} as Record<string, ProviderFormData>
)

// Sections will use translations dynamically in component

export default function Settings() {
  const { t } = useTranslation("settings")
  const { language, changeLanguage } = useLanguage()
  const { theme, setTheme } = useTheme()
  const [activeSection, setActiveSection] = useState("providers")
  const [activeProvider, setActiveProvider] = useState("minimax")
  const [activeWebSearchProvider, setActiveWebSearchProvider] = useState("parallel")
  const [showPassword, setShowPassword] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formData, setFormData] = useState<Record<string, ProviderFormData>>(DEFAULT_FORM_DATA)
  const [storedProviders, setStoredProviders] = useState<Record<string, boolean>>({})

  const { saveConfig, getConfig, deleteConfig, isLoading, error } = useProviderConfig()

  const resetSaveFeedback = useCallback(() => {
    setSaveStatus("idle")
    setSaveError(null)
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
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
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getConfig(activeProvider)
      if (config) {
        setFormData(prev => ({
          ...prev,
          [activeProvider]: {
            ...prev[activeProvider],
            apiKey: config.apiKey,
            baseUrl: config.baseUrl || ""
          }
        }))
        setStoredProviders(prev => ({ ...prev, [activeProvider]: true }))
      } else {
        setStoredProviders(prev => ({ ...prev, [activeProvider]: false }))
      }
    }
    loadConfig()
    resetSaveFeedback()
  }, [activeProvider, getConfig, resetSaveFeedback])

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getConfig(activeWebSearchProvider)
      if (config) {
        setFormData(prev => ({
          ...prev,
          [activeWebSearchProvider]: {
            ...prev[activeWebSearchProvider],
            apiKey: config.apiKey,
            baseUrl:
              config.baseUrl ||
              ALL_PROVIDERS.find(p => p.id === activeWebSearchProvider)?.defaultBaseUrl ||
              ""
          }
        }))
        setStoredProviders(prev => ({ ...prev, [activeWebSearchProvider]: true }))
      } else {
        setStoredProviders(prev => ({ ...prev, [activeWebSearchProvider]: false }))
      }
    }
    loadConfig()
    resetSaveFeedback()
  }, [activeWebSearchProvider, getConfig, resetSaveFeedback])

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
      successTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle")
      }, 1500)
    } catch (err) {
      console.error("Failed to save config:", err)
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
      successTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle")
      }, 1500)
    } catch (err) {
      console.error("Failed to delete config:", err)
      setSaveStatus("error")
      setSaveError(
        `Failed to delete configuration: ${err instanceof Error ? err.message : "Unknown error"}`
      )
    }
  }

  const currentProvider = ALL_PROVIDERS.find(p => p.id === activeProvider)
  const currentData = formData[activeProvider]
  const currentWebSearchProvider = ALL_PROVIDERS.find(p => p.id === activeWebSearchProvider)
  const currentWebSearchData = formData[activeWebSearchProvider]
  const activeError = saveError || error
  const isSaveBusy = saveStatus === "submitting" || saveStatus === "success"
  const isSaveDisabled = isSaveBusy || isLoading || !currentData?.apiKey.trim()
  const isClearDisabled = isSaveBusy || isLoading || !currentData?.apiKey.trim()
  const isProviderEnabled = currentData?.enabled ?? true
  const isWebSearchSaveDisabled = isSaveBusy || isLoading || !currentWebSearchData?.apiKey.trim()
  const isWebSearchClearDisabled = isSaveBusy || isLoading || !currentWebSearchData?.apiKey.trim()

  return (
    <div className="h-screen overflow-hidden flex">
      {/* Top drag region for macOS traffic lights */}
      <div data-tauri-drag-region className="z-50 fixed top-0 left-0 right-0 h-14.5" />

      {/* Main container with inset styling and entry animation */}
      <div
        className="bg-sidebar flex flex-1 overflow-hidden animate-in fade-in slide-in-from-bottom-12 slide-in-from-left-12 zoom-in-95 duration-350"
        style={{
          animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
        }}
      >
        {/* Left Sidebar - Sections */}
        <aside className="w-48 bg-transparent">
          <div className="flex h-full flex-col">
            {/* Top spacing for drag region */}
            <div className="h-14.5" />
            {/* Section Navigation */}
            <nav className="flex-1 space-y-1 p-4">
              {[
                { id: "providers", icon: Layers },
                { id: "web-search", icon: Search },
                { id: "general", icon: Settings2 },
                { id: "advanced", icon: Key },
                { id: "about", icon: Info }
              ].map(section => {
                const Icon = section.icon
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      activeSection === section.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
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
            {/* Back button in sidebar footer */}
            <div className="p-4 pt-0">
              <Link to="/">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                >
                  <ArrowLeftToLineIcon className="size-4.5 shrink-0" />
                  <span>{t("sections.back")}</span>
                </button>
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          <div className="m-1.5 ml-0 rounded-sm bg-background/90 flex-1 overflow-auto flex flex-col">
            <div className="w-full px-8 pb-6 flex-1 flex flex-col min-h-0">
              {/* Top spacing to align with sidebar first item */}
              <div className="h-6" />
              {activeSection === "providers" && (
                <div className="space-y-6 pt-4 flex-1 flex flex-col min-h-0">
                  <div>
                    <div className="text-xl font-semibold">{t("providers.title")}</div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t("providers.description")}
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-[180px_1fr] gap-4 flex-1 min-h-0">
                    {/* Provider List */}
                    <div className="space-y-2 rounded-lg border border-border/70 bg-muted p-2 h-full overflow-y-auto">
                      {MODEL_PROVIDERS.map(provider => {
                        const ProviderIcon = provider.icon
                        const providerEnabled = formData[provider.id]?.enabled ?? true
                        return (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => {
                              setActiveProvider(provider.id)
                              setShowPassword(false)
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-3 text-left text-sm font-medium transition-colors",
                              activeProvider === provider.id
                                ? "bg-accent text-accent-foreground border-accent-foreground/20"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border-border/40"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <ProviderIcon className="size-4 shrink-0" />
                              <span>{provider.name}</span>
                            </div>
                            {providerEnabled && (
                              <CircleIcon className="size-2 fill-current text-brand-green" />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Provider Form */}
                    <div
                      className={cn(
                        "max-w-2xl space-y-8 transition-opacity",
                        !isProviderEnabled && "opacity-60"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-4">
                          <h2 className="text-lg font-medium">{currentProvider?.name}</h2>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {t("providers.enable")}
                            </span>
                            <Switch
                              checked={currentData?.enabled ?? false}
                              onCheckedChange={checked => {
                                resetSaveFeedback()
                                setFormData(prev => ({
                                  ...prev,
                                  [activeProvider]: {
                                    ...prev[activeProvider],
                                    enabled: checked
                                  }
                                }))
                              }}
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("providers.configureDescription", { provider: currentProvider?.name })}
                        </p>
                      </div>

                      <div className="space-y-8">
                        {/* API Key Input with Password Toggle */}
                        <div className="space-y-2 [&>div]:pl-1">
                          <div className="text-sm font-medium leading-none">
                            API Key <span className="text-red-500">*</span>
                          </div>
                          <InputGroup>
                            <InputGroupInput
                              id="apiKey"
                              type={showPassword ? "text" : "password"}
                              placeholder={t("providers.apiKeyPlaceholder", {
                                provider: currentProvider?.name
                              })}
                              value={currentData?.apiKey || ""}
                              onChange={e => {
                                resetSaveFeedback()
                                setFormData(prev => ({
                                  ...prev,
                                  [activeProvider]: {
                                    ...prev[activeProvider],
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
                        </div>

                        {/* Base URL Input */}
                        <div className="space-y-2 [&>div]:pl-1">
                          <div className="text-sm font-medium leading-none">
                            Base URL
                            <span className={cn("pl-2 text-muted-foreground/60 text-xs")}>
                              {t("providers.baseUrlOptional")}
                            </span>
                          </div>
                          <Input
                            id="baseUrl"
                            type="url"
                            placeholder={currentProvider?.defaultBaseUrl}
                            value={currentData?.baseUrl || ""}
                            onChange={e => {
                              resetSaveFeedback()
                              setFormData(prev => ({
                                ...prev,
                                [activeProvider]: {
                                  ...prev[activeProvider],
                                  baseUrl: e.target.value
                                }
                              }))
                            }}
                          />
                        </div>
                      </div>

                      {/* Error Display */}
                      {activeError && (
                        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                          {activeError}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          variant="destructive"
                          onClick={() => handleClear(activeProvider)}
                          disabled={isClearDisabled}
                        >
                          {t("providers.clear")}
                        </Button>
                        <Button
                          onClick={() => handleSave(activeProvider)}
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
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "web-search" && (
                <div className="space-y-6 pt-4 flex-1 flex flex-col min-h-0">
                  <div>
                    <div className="text-xl font-semibold">{t("webSearch.title")}</div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t("webSearch.description")}
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-[180px_1fr] gap-4 flex-1 min-h-0">
                    {/* Provider List */}
                    <div className="space-y-2 rounded-lg border border-border/70 bg-muted p-2 h-full overflow-y-auto">
                      {WEB_SEARCH_PROVIDERS.map(provider => {
                        const ProviderIcon = provider.icon
                        const providerEnabled = formData[provider.id]?.enabled ?? true
                        return (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => {
                              setActiveWebSearchProvider(provider.id)
                              setShowPassword(false)
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-3 text-left text-sm font-medium transition-colors",
                              activeWebSearchProvider === provider.id
                                ? "bg-accent text-accent-foreground border-accent-foreground/20"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border-border/40"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <ProviderIcon className="size-4 shrink-0" />
                              <span>{provider.name}</span>
                            </div>
                            {providerEnabled && (
                              <CircleIcon className="size-2 fill-current text-brand-green" />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Provider Form */}
                    <div
                      className={cn(
                        "max-w-2xl space-y-8 transition-opacity",
                        !(currentWebSearchData?.enabled ?? true) && "opacity-60"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-4">
                          <h2 className="text-lg font-medium">{currentWebSearchProvider?.name}</h2>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {t("providers.enable")}
                            </span>
                            <Switch
                              checked={currentWebSearchData?.enabled ?? false}
                              onCheckedChange={checked => {
                                resetSaveFeedback()
                                setFormData(prev => ({
                                  ...prev,
                                  [activeWebSearchProvider]: {
                                    ...prev[activeWebSearchProvider],
                                    enabled: checked
                                  }
                                }))
                              }}
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("providers.configureDescription", {
                            provider: currentWebSearchProvider?.name
                          })}
                        </p>
                      </div>

                      <div className="space-y-8">
                        {/* API Key Input with Password Toggle */}
                        <div className="space-y-2 [&>div]:pl-1">
                          <div className="text-sm font-medium leading-none">
                            API Key <span className="text-red-500">*</span>
                          </div>
                          <InputGroup>
                            <InputGroupInput
                              id="webSearchApiKey"
                              type={showPassword ? "text" : "password"}
                              placeholder={t("providers.apiKeyPlaceholder", {
                                provider: currentWebSearchProvider?.name
                              })}
                              value={currentWebSearchData?.apiKey || ""}
                              onChange={e => {
                                resetSaveFeedback()
                                setFormData(prev => ({
                                  ...prev,
                                  [activeWebSearchProvider]: {
                                    ...prev[activeWebSearchProvider],
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
                        </div>

                        {/* Base URL Input (if needed) */}
                        {currentWebSearchProvider?.defaultBaseUrl !== undefined && (
                          <div className="space-y-2 [&>div]:pl-1">
                            <div className="text-sm font-medium leading-none">
                              Base URL
                              <span className={cn("pl-2 text-muted-foreground/60 text-xs")}>
                                {t("providers.baseUrlOptional")}
                              </span>
                            </div>
                            <Input
                              id="webSearchBaseUrl"
                              type="url"
                              placeholder={currentWebSearchProvider?.defaultBaseUrl}
                              value={currentWebSearchData?.baseUrl || ""}
                              onChange={e => {
                                resetSaveFeedback()
                                setFormData(prev => ({
                                  ...prev,
                                  [activeWebSearchProvider]: {
                                    ...prev[activeWebSearchProvider],
                                    baseUrl: e.target.value
                                  }
                                }))
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Error Display */}
                      {activeError && (
                        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                          {activeError}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          variant="destructive"
                          onClick={() => handleClear(activeWebSearchProvider)}
                          disabled={isWebSearchClearDisabled}
                        >
                          {t("providers.clear")}
                        </Button>
                        <Button
                          onClick={() => handleSave(activeWebSearchProvider)}
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
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "general" && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">{t("general.title")}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{t("general.description")}</p>
                  </div>
                  <Separator />
                  <div className="max-w-2xl space-y-6">
                    {/* Language Selector */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-medium">{t("general.language")}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("general.languageDescription")}
                        </p>
                      </div>
                      <Select
                        value={language}
                        onValueChange={value => changeLanguage(value as "en" | "zh-CN" | "system")}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="zh-CN">简体中文</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="system">{t("general.languageSystem")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Theme Selector */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-medium">{t("general.theme")}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("general.themeDescription")}
                        </p>
                      </div>
                      <Select
                        value={theme}
                        onValueChange={value => setTheme(value as "light" | "dark" | "system")}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">{t("general.themeLight")}</SelectItem>
                          <SelectItem value="dark">{t("general.themeDark")}</SelectItem>
                          <SelectItem value="system">{t("general.themeSystem")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "advanced" && (
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

              {activeSection === "about" && (
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
