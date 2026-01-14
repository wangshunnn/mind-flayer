import { Link } from "@tanstack/react-router"
import {
  ArrowLeftToLineIcon,
  Bot,
  Brain,
  Eye,
  EyeOff,
  Info,
  Key,
  Layers,
  Palette,
  Search,
  Settings2,
  Sparkles
} from "lucide-react"
import { useState } from "react"
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
import { useProviderConfig } from "@/hooks/use-provider-config"
import { cn } from "@/lib/utils"

interface ProviderFormData {
  apiKey: string
  baseUrl: string
}

const PROVIDERS = [
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
  },
  { id: "parallel", name: "Parallel (Web Search)", defaultBaseUrl: "", icon: Search }
]

const SECTIONS = [
  { id: "providers", name: "提供商", icon: Layers },
  { id: "general", name: "通用", icon: Settings2 },
  { id: "appearance", name: "外观", icon: Palette },
  { id: "advanced", name: "高级", icon: Key },
  { id: "about", name: "关于", icon: Info }
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState("providers")
  const [activeProvider, setActiveProvider] = useState("minimax")
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState<Record<string, ProviderFormData>>({
    minimax: { apiKey: "", baseUrl: PROVIDERS[0].defaultBaseUrl },
    openai: { apiKey: "", baseUrl: PROVIDERS[1].defaultBaseUrl },
    anthropic: { apiKey: "", baseUrl: PROVIDERS[2].defaultBaseUrl },
    parallel: { apiKey: "", baseUrl: PROVIDERS[3].defaultBaseUrl }
  })

  const { saveConfig, deleteConfig, isLoading, error } = useProviderConfig()

  const handleSave = async () => {
    const data = formData[activeProvider]
    if (!data.apiKey.trim()) {
      alert("API Key is required")
      return
    }

    try {
      await saveConfig(activeProvider, data.apiKey, data.baseUrl.trim() || undefined)
      alert(
        `${PROVIDERS.find(p => p.id === activeProvider)?.name} configuration saved successfully`
      )
    } catch (err) {
      console.error("Failed to save config:", err)
      alert(`Failed to save configuration: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete ${PROVIDERS.find(p => p.id === activeProvider)?.name} configuration?`)) {
      return
    }

    try {
      await deleteConfig(activeProvider)
      setFormData(prev => ({
        ...prev,
        [activeProvider]: {
          apiKey: "",
          baseUrl: PROVIDERS.find(p => p.id === activeProvider)?.defaultBaseUrl || ""
        }
      }))
      alert("Configuration deleted successfully")
    } catch (err) {
      console.error("Failed to delete config:", err)
      alert(
        `Failed to delete configuration: ${err instanceof Error ? err.message : "Unknown error"}`
      )
    }
  }

  const currentProvider = PROVIDERS.find(p => p.id === activeProvider)
  const currentData = formData[activeProvider]

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
        <main className="flex-1 flex">
          <div className="m-1.5 ml-0 rounded-sm bg-background/90 flex-1 overflow-auto">
            <div className="mx-auto max-w-5xl px-8">
              {/* Top spacing to align with sidebar first item */}
              <div className="h-6" />
              {activeSection === "providers" && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">提供商配置</div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      配置不同 AI 提供商的 API 密钥。密钥将安全存储在系统密钥链中。
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-[200px_1fr] gap-8">
                    {/* Provider List */}
                    <div className="space-y-1">
                      {PROVIDERS.map(provider => {
                        const ProviderIcon = provider.icon
                        return (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => {
                              setActiveProvider(provider.id)
                              setShowPassword(false)
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                              activeProvider === provider.id
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            )}
                          >
                            <ProviderIcon className="size-4 shrink-0" />
                            <span>{provider.name}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Provider Form */}
                    <div className="max-w-2xl space-y-6">
                      <div>
                        <h2 className="text-lg font-medium">{currentProvider?.name}</h2>
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
                              onChange={e =>
                                setFormData(prev => ({
                                  ...prev,
                                  [activeProvider]: {
                                    ...prev[activeProvider],
                                    apiKey: e.target.value
                                  }
                                }))
                              }
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
                            onChange={e =>
                              setFormData(prev => ({
                                ...prev,
                                [activeProvider]: {
                                  ...prev[activeProvider],
                                  baseUrl: e.target.value
                                }
                              }))
                            }
                          />
                          {currentProvider?.defaultBaseUrl && (
                            <p className="text-xs text-muted-foreground">
                              默认: {currentProvider.defaultBaseUrl}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Error Display */}
                      {error && (
                        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                          {error}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex justify-between gap-2 pt-4">
                        <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
                          删除
                        </Button>
                        <Button onClick={handleSave} disabled={isLoading}>
                          {isLoading ? "保存中..." : "保存"}
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

              {activeSection === "appearance" && (
                <div className="space-y-6 pt-4">
                  <div>
                    <div className="text-xl font-semibold">外观设置</div>
                    <p className="mt-1 text-sm text-muted-foreground">自定义应用的外观和主题。</p>
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
