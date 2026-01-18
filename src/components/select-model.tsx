import { ArrowRightIcon, BotIcon, ChevronDown, CircleIcon } from "lucide-react"
import { useState } from "react"
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

const MODEL_OPTIONS: ModelOption[] = [
  {
    provider: "minimax",
    label: "MiniMax M2.1",
    api_id: "MiniMax-M2.1"
  },
  {
    provider: "minimax",
    label: "MiniMax M2.1 lightning",
    api_id: "MiniMax-M2.1-lightning"
  },
  {
    provider: "minimax",
    label: "MiniMax M2",
    api_id: "MiniMax-M2"
  }
  // {
  //   provider: "anthropic",
  //   label: "Claude Sonnet 4.5",
  //   api_id: "claude-haiku-4-5-20251001"
  // },
  // {
  //   provider: "anthropic",
  //   label: "Claude Opus 4.5",
  //   api_id: "claude-opus-4-5-20251101"
  // }
]

interface SelectModelProps extends Omit<React.ComponentProps<typeof Button>, "onChange" | "value"> {
  value?: ModelOption
  onChange?: (model: ModelOption) => void
}

function SelectModel({ className, value, onChange, ...props }: SelectModelProps) {
  const { t } = useTranslation("chat")
  const [open, setOpen] = useState(false)
  // Use controlled state if provided, otherwise use internal state
  const [internalModel, setInternalModel] = useState(MODEL_OPTIONS[0])
  const selectedModel = value ?? internalModel
  const setSelectedModel = onChange ?? setInternalModel
  const [openTooltip] = useDropdownTooltip(open)

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
              {selectedModel.label}
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
          {MODEL_OPTIONS.map(model => (
            <DropdownMenuItem
              key={model.label}
              onClick={() => setSelectedModel(model)}
              className={cn("flex items-center gap-2 px-1 font-medium")}
            >
              {getProviderIcon(model.provider)}
              <span className="flex-1 text-left">{model.label}</span>
              <span className="ml-8 w-4 shrink-0">
                {selectedModel.label === model.label && (
                  <CircleIcon className="size-2 fill-current text-brand-green" />
                )}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center justify-between gap-2 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              // TODO: Navigate to model configuration page
            }}
          >
            <span>{t("model.configureModels")}</span>
            <ArrowRightIcon className="size-4" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SelectModel, MODEL_OPTIONS }
export type { ModelOption }
