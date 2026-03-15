import { ArrowRightIcon, CheckIcon, ChevronDown } from "lucide-react"
import { Fragment, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ProviderLogo } from "@/components/ui/provider-logo"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAutofocusSelectedDropdownItem } from "@/hooks/use-autofocus-selected-dropdown-item"
import { useAvailableModels } from "@/hooks/use-available-models"
import { useDropdownTooltip } from "@/hooks/use-dropdown-tooltip"
import type { ModelPricing } from "@/lib/provider-constants"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"

interface ModelOption {
  provider: string
  label: string
  api_id: string
  contextWindow?: number | null
  pricing?: ModelPricing
}

interface SelectModelProps extends Omit<React.ComponentProps<typeof Button>, "onChange" | "value"> {
  value?: ModelOption
  onChange?: (model: ModelOption) => void
}

function SelectModel({ className, value, onChange, ...props }: SelectModelProps) {
  const { t } = useTranslation("chat")
  const [open, setOpen] = useState(false)
  const { availableModels, isLoading } = useAvailableModels()
  const [internalModel, setInternalModel] = useState({} as ModelOption)
  const selectedModel = value ?? internalModel
  const setSelectedModel = onChange ?? setInternalModel
  const [openTooltip] = useDropdownTooltip(open)
  const { scopeId: autofocusScope } = useAutofocusSelectedDropdownItem(open, selectedModel.api_id)

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {}
    availableModels.forEach(model => {
      if (!groups[model.provider]) {
        groups[model.provider] = []
      }
      groups[model.provider].push(model)
    })
    return Object.entries(groups)
  }, [availableModels])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disableHoverableContent={true} open={openTooltip}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline-no-shadow"
              className={cn("h-7 gap-2 data-[state=open]:bg-accent font-normal text-xs", className)}
              {...props}
            >
              <ProviderLogo providerId={selectedModel.provider} className="size-3.5" />
              {selectedModel.label || t("model.selectModel")}
              <ChevronDown
                className={cn("size-3 transition-transform duration-300", open && "-rotate-180")}
              />
              <span className="sr-only">{t("model.selectModel")}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("model.switchModel")}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" sideOffset={4} className="w-max">
        <DropdownMenuGroup>
          {isLoading ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              {t("model.loadingModels")}
            </DropdownMenuItem>
          ) : availableModels.length === 0 ? (
            <>
              <DropdownMenuItem disabled className="text-muted-foreground">
                {t("model.noModelsAvailable")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : (
            groupedModels.map(([provider, models]) => (
              <Fragment key={provider}>
                {models.map((model: ModelOption) => {
                  const isSelected = selectedModel.api_id === model.api_id

                  return (
                    <DropdownMenuItem
                      key={model.api_id}
                      onClick={() => setSelectedModel(model)}
                      className="flex w-full items-center justify-between gap-10 px-2 py-1.5 font-medium"
                      data-autofocus-scope={autofocusScope}
                      data-item-value={model.api_id}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <ProviderLogo providerId={model.provider} className="size-4" />
                        <span className="text-left">{model.label}</span>
                      </span>
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        {isSelected && <CheckIcon className="size-4" />}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
                <DropdownMenuSeparator />
              </Fragment>
            ))
          )}
          <DropdownMenuItem onClick={() => openSettingsWindow(SettingsSection.PROVIDERS)}>
            <span>{t("model.moreModels")}</span>
            <ArrowRightIcon className="size-4" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SelectModel }
export type { ModelOption }
