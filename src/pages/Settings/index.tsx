import { useSearch } from "@tanstack/react-router"
import { emit, listen } from "@tauri-apps/api/event"
import { BadgeInfo, Bolt, Keyboard, Layers, Search } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useLatest } from "@/hooks/use-latest"
import { useProviderConfig } from "@/hooks/use-provider-config"
import { useSetting } from "@/hooks/use-settings-store"
import {
  ALL_PROVIDERS,
  DEFAULT_FORM_DATA,
  MODEL_PROVIDERS,
  WEB_SEARCH_PROVIDERS
} from "@/lib/provider-constants"
import { cn } from "@/lib/utils"
import { SettingsSection } from "@/lib/window-manager"
import type { ProviderFormData } from "@/types/settings"
import { AboutSection } from "./components/AboutSection"
import { AdvancedSection } from "./components/AdvancedSection"
import { GeneralSection } from "./components/GeneralSection"
import { ProviderSection } from "./components/ProviderSection"
import { WebSearchSection } from "./components/WebSearchSection"

export default function Settings() {
  const { t } = useTranslation("settings")
  const searchParams = useSearch({ from: "/settings" })
  const [activeSection, setActiveSection] = useState<SettingsSection>(SettingsSection.GENERAL)
  const [activeProvider, setActiveProvider] = useState(MODEL_PROVIDERS[0].id)
  const [activeWebSearchProvider, setActiveWebSearchProvider] = useState(WEB_SEARCH_PROVIDERS[0].id)
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

  // Initialize activeSection from router search params
  useEffect(() => {
    setActiveSection(searchParams.tab)
  }, [searchParams.tab])

  // Listen for cross-window tab change events
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      unlisten = await listen<SettingsSection>("settings-change-tab", event => {
        if (event.payload) {
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

  // Load web search provider config
  // biome-ignore lint/correctness/useExhaustiveDependencies: getConfigRef is stable via useLatest
  useEffect(() => {
    const loadConfig = async () => {
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
              {activeSection === SettingsSection.PROVIDERS && (
                <ProviderSection
                  activeProvider={activeProvider}
                  setActiveProvider={setActiveProvider}
                  formData={formData}
                  setFormData={setFormData}
                  onSave={handleSave}
                  onClear={handleClear}
                  saveStatus={saveStatus}
                  activeError={activeError}
                  isLoading={isLoading}
                  enabledProviders={enabledProviders}
                  setEnabledProviders={setEnabledProviders}
                  resetSaveFeedback={resetSaveFeedback}
                  isSaveDisabled={isSaveDisabled}
                  isClearDisabled={isClearDisabled}
                />
              )}

              {activeSection === SettingsSection.WEB_SEARCH && (
                <WebSearchSection
                  activeProvider={activeWebSearchProvider}
                  setActiveProvider={setActiveWebSearchProvider}
                  formData={formData}
                  setFormData={setFormData}
                  onSave={handleSave}
                  onClear={handleClear}
                  saveStatus={saveStatus}
                  activeError={activeError}
                  enabledProviders={enabledProviders}
                  setEnabledProviders={setEnabledProviders}
                  resetSaveFeedback={resetSaveFeedback}
                  isSaveDisabled={isWebSearchSaveDisabled}
                  isClearDisabled={isWebSearchClearDisabled}
                />
              )}

              {activeSection === SettingsSection.GENERAL && <GeneralSection />}

              {activeSection === SettingsSection.ADVANCED && <AdvancedSection />}

              {activeSection === SettingsSection.ABOUT && <AboutSection />}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
