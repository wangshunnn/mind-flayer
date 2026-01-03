import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function SelectModel({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Tooltip disableHoverableContent={true}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-8 px-1.25 pl-1.75",
            // "hover:bg-sidebar-search-hover hover:text-sidebar-accent-foreground",
            className
          )}
          {...props}
        >
          DeepSeek
          <span className="sr-only">DeepSeek</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch Model</TooltipContent>
    </Tooltip>
  )
}

export { SelectModel }
