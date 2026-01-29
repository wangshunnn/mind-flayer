import { MessageSquarePlus } from "lucide-react"
import type * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function NewChatTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { t } = useTranslation("common")
  return (
    <Tooltip disableHoverableContent={true}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            className
          )}
          {...props}
        >
          <MessageSquarePlus className="cursor-pointer size-4.5" />
          <span className="sr-only">{t("nav.newChat")}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("nav.newChat")}</TooltipContent>
    </Tooltip>
  )
}

export { NewChatTrigger }
