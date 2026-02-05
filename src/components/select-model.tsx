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
import { useAvailableModels } from "@/hooks/use-available-models"
import { useDropdownTooltip } from "@/hooks/use-dropdown-tooltip"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"

interface ModelOption {
  provider: string
  label: string
  api_id: string
}

interface SelectModelProps extends Omit<React.ComponentProps<typeof Button>, "onChange" | "value"> {
  value?: ModelOption
  onChange?: (model: ModelOption) => void
}

function SelectModel({ className, value, onChange, ...props }: SelectModelProps) {
  const { t } = useTranslation("chat")
  const [open, setOpen] = useState(false)
  const { availableModels, isLoading } = useAvailableModels()

  // Use controlled state if provided, otherwise use internal state
  const [internalModel, setInternalModel] = useState({} as ModelOption)
  const selectedModel = value ?? internalModel
  const setSelectedModel = onChange ?? setInternalModel
  const [openTooltip] = useDropdownTooltip(open)

  // Group models by provider
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

      <DropdownMenuContent align="start" sideOffset={4}>
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
                {models.map((model: ModelOption) => (
                  <DropdownMenuItem
                    key={model.api_id}
                    onClick={() => setSelectedModel(model)}
                    className={cn("flex items-center gap-2 pl-1 pr-3 font-medium")}
                  >
                    <ProviderLogo providerId={model.provider} className="size-4" />
                    <span className="flex-1 text-left">{model.label}</span>
                    <span className="ml-10 shrink-0">
                      {selectedModel.api_id === model.api_id && <CheckIcon className="size-4" />}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </Fragment>
            ))
          )}
          <DropdownMenuItem onClick={() => openSettingsWindow(SettingsSection.PROVIDERS)}>
            <span>{t("model.configureModels")}</span>
            <ArrowRightIcon className="size-4" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SelectModel }
export type { ModelOption }
