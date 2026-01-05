import { ChevronDown, CircleIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ModelOption {
  provider: string
  label: string
  api_id: string
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    provider: "Minimax",
    label: "MiniMax M2.1",
    api_id: "MiniMax-M2.1"
  },
  {
    provider: "Minimax",
    label: "MiniMax M2.1 lightning",
    api_id: "MiniMax-M2.1-lightning"
  },
  {
    provider: "Minimax",
    label: "MiniMax M2",
    api_id: "MiniMax-M2"
  }
  // {
  //   provider: "Anthropic",
  //   label: "Claude Sonnet 4.5",
  //   api_id: "claude-haiku-4-5-20251001"
  // },
  // {
  //   provider: "Anthropic",
  //   label: "Claude Opus 4.5",
  //   api_id: "claude-opus-4-5-20251101"
  // }
]

interface SelectModelProps extends Omit<React.ComponentProps<typeof Button>, "onChange" | "value"> {
  value?: ModelOption
  onChange?: (model: ModelOption) => void
}

function SelectModel({ className, value, onChange, ...props }: SelectModelProps) {
  const [open, setOpen] = useState(false)
  // Use controlled state if provided, otherwise use internal state
  const [internalModel, setInternalModel] = useState(MODEL_OPTIONS[0])
  const selectedModel = value ?? internalModel
  const setSelectedModel = onChange ?? setInternalModel

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disableHoverableContent={true}>
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
              <span className="sr-only">Select Model</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Switch Model</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" sideOffset={6}>
        {MODEL_OPTIONS.map(model => (
          <DropdownMenuItem
            key={model.label}
            onClick={() => setSelectedModel(model)}
            className={cn("w-55 flex items-center")}
          >
            {model.label}
            {selectedModel.label === model.label && (
              <CircleIcon className="ml-auto size-2 fill-current text-brand-green" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SelectModel, MODEL_OPTIONS }
export type { ModelOption }
