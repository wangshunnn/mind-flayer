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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
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
  { id: "parallel", name: "Parallel", defaultBaseUrl: "", icon: Search },
  { id: "parallel1", name: "Parallel1", defaultBaseUrl: "", icon: Search }
]

const ALL_PROVIDERS = [...MODEL_PROVIDERS, ...WEB_SEARCH_PROVIDERS]

const DEFAULT_FORM_DATA = ALL_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = { apiKey: "", baseUrl: provider.defaultBaseUrl, enabled: true }
    return acc
  },
  {} as Record<string, ProviderFormData>
)

const SECTIONS = [
  { id: "providers", name: "提供商", icon: Layers },
  { id: "web-search", name: "网络搜索", icon: Search },
  { id: "general", name: "通用", icon: Settings2 },
  { id: "advanced", name: "高级", icon: Key },
  { id: "about", name: "关于", icon: Info }
]

export default function Settings() {
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
            baseUrl:
              config.baseUrl ||
              ALL_PROVIDERS.find(p => p.id === activeProvider)?.defaultBaseUrl ||
              ""
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
      await saveConfig(providerId, data.apiKey, data.baseUrl.trim() || undefined)
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
              {SECTIONS.map(section => {
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
                    <span>{section.name}</span>
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
                  <span>返回</span>
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
                    <div className="text-xl font-semibold">提供商配置</div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      配置不同 AI 提供商的 API 密钥。密钥将安全存储在系统密钥链中。
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-[180px_1fr] gap-4 flex-1 min-h-0">
                    {/* Provider List */}
                    <div className="space-y-1 rounded-lg border border-border/70 bg-muted p-2 h-full overflow-y-auto">
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
                              "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                              activeProvider === provider.id
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
                        "max-w-2xl space-y-6 transition-opacity",
                        !isProviderEnabled && "opacity-60"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-4">
                          <h2 className="text-lg font-medium">{currentProvider?.name}</h2>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">启用</span>
                            <Switch
                              checked={currentData?.enabled ?? true}
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
                          配置 {currentProvider?.name} 的 API 凭证和端点设置
                        </p>
                      </div>

                      <div className="space-y-4">
                        {/* API Key Input with Password Toggle */}
                        <div className="space-y-2">
                          <Label htmlFor="apiKey">
                            API Key <span className="text-red-500">*</span>
                          </Label>
                          <InputGroup>
                            <InputGroupInput
                              id="apiKey"
                              type={showPassword ? "text" : "password"}
                              placeholder={`Enter your ${currentProvider?.name} API key`}
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
                        <div className="space-y-2">
                          <Label htmlFor="baseUrl">
                            Base URL <span className="text-muted-foreground">(可选)</span>
                          </Label>
                          <Input
                            id="baseUrl"
                            type="url"
                            placeholder={
                              currentProvider?.defaultBaseUrl || "https://api.example.com"
                            }
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
                          {currentProvider?.defaultBaseUrl && (
                            <p className="text-xs text-muted-foreground">
                              默认: {currentProvider.defaultBaseUrl}
                            </p>
                          )}
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
                          清除
                        </Button>
                        <Button
                          onClick={() => handleSave(activeProvider)}
                          disabled={isSaveDisabled}
                        >
                          {saveStatus === "submitting" && (
                            <Loader2Icon className="mr-2 size-4 animate-spin" />
                          )}
                          {saveStatus === "success"
                            ? "Saved ✓"
                            : saveStatus === "submitting"
                              ? "Saving…"
                              : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "web-search" && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">网络搜索</div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      配置网络搜索工具的提供商与访问凭证。
                    </p>
                  </div>

                  <Separator />

                  <div className="max-w-2xl space-y-6">
                    <div className="rounded-lg border border-border/70 bg-muted p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-medium">提供商</h2>
                          <p className="mt-1 text-sm text-muted-foreground">选择网络搜索的提供商</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {WEB_SEARCH_PROVIDERS.map(provider => {
                          const ProviderIcon = provider.icon
                          const isActive = activeWebSearchProvider === provider.id
                          return (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => {
                                setActiveWebSearchProvider(provider.id)
                                setShowPassword(false)
                              }}
                              className={cn(
                                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                isActive
                                  ? "border-brand-green bg-brand-green/10 text-foreground"
                                  : "border-border/60 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                              )}
                            >
                              <ProviderIcon className="size-3.5 shrink-0" />
                              <span>{provider.name}</span>
                              {isActive && (
                                <CircleIcon className="size-2 fill-current text-brand-green" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="space-y-6 transition-opacity">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="webSearchApiKey">
                            API Key <span className="text-red-500">*</span>
                          </Label>
                          <InputGroup>
                            <InputGroupInput
                              id="webSearchApiKey"
                              type={showPassword ? "text" : "password"}
                              placeholder={`Enter your ${currentWebSearchProvider?.name} API key`}
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
                      </div>

                      {activeError && (
                        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                          {activeError}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          variant="destructive"
                          onClick={() => handleClear(activeWebSearchProvider)}
                          disabled={isWebSearchClearDisabled}
                        >
                          清除
                        </Button>
                        <Button
                          onClick={() => handleSave(activeWebSearchProvider)}
                          disabled={isWebSearchSaveDisabled}
                        >
                          {saveStatus === "submitting" && (
                            <Loader2Icon className="mr-2 size-4 animate-spin" />
                          )}
                          {saveStatus === "success"
                            ? "Saved ✓"
                            : saveStatus === "submitting"
                              ? "Saving…"
                              : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "general" && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">通用设置</div>
                    <p className="mt-1 text-sm text-muted-foreground">配置应用的基本设置和偏好。</p>
                  </div>
                  <Separator />
                  <div className="max-w-2xl">
                    <p className="text-sm text-muted-foreground">即将推出...</p>
                  </div>
                </div>
              )}

              {activeSection === "advanced" && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">高级设置</div>
                    <p className="mt-1 text-sm text-muted-foreground">配置高级功能和开发者选项。</p>
                  </div>
                  <Separator />
                  <div className="max-w-2xl">
                    <p className="text-sm text-muted-foreground">即将推出...</p>
                  </div>
                </div>
              )}

              {activeSection === "about" && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">关于</div>
                    <p className="mt-1 text-sm text-muted-foreground">应用信息和版本详情。</p>
                  </div>
                  <Separator />
                  <div className="max-w-2xl">
                    <p className="text-sm text-muted-foreground">即将推出...</p>
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
