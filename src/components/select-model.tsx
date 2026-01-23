import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, BotIcon, ChevronDown, CircleIcon } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAvailableModels } from "@/hooks/use-available-models"
import { useDropdownTooltip } from "@/hooks/use-dropdown-tooltip"
import { cn } from "@/lib/utils"

interface ModelOption {
  provider: string
  label: string
  api_id: string
}

// Provider logo components - can be replaced with actual SVG logos
const ProviderIcons: Record<string, React.ReactNode> = {
  minimax: <span className="flex size-5 items-center justify-center text-[10px] font-bold">M</span>,
  anthropic: (
    <span className="flex size-5 items-center justify-center text-[10px] font-bold">A</span>
  )
}

// Default fallback icon for unknown providers
function DefaultProviderIcon() {
  return <BotIcon className="size-5 text-muted-foreground" />
}

function getProviderIcon(provider: string) {
  return ProviderIcons[provider] ?? <DefaultProviderIcon />
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
              variant="ghost"
              className={cn("h-8 gap-1.5 data-[state=open]:bg-accent font-medium", className)}
              {...props}
            >
              {selectedModel.label || t("model.selectModel")}
              <ChevronDown
                className={cn("size-3.5 transition-transform duration-300", open && "-rotate-180")}
              />
              <span className="sr-only">{t("model.selectModel")}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("model.switchModel")}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" sideOffset={6}>
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
                    className={cn("flex items-center gap-2 px-1 font-medium")}
                  >
                    {getProviderIcon(model.provider)}
                    <span className="flex-1 text-left">{model.label}</span>
                    <span className="ml-8 w-4 shrink-0">
                      {selectedModel.api_id === model.api_id && (
                        <CircleIcon className="size-2 fill-current text-brand-green" />
                      )}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </Fragment>
            ))
          )}
          <DropdownMenuItem asChild>
            <Link
              to="/settings"
              search={{ tab: "providers" }}
              className="flex items-center justify-between gap-2 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              <span>{t("model.configureModels")}</span>
              <ArrowRightIcon className="size-4" />
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SelectModel }
export type { ModelOption }
