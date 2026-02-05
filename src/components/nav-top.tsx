import { MessageSquarePlus } from "lucide-react"
import type * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useShortcutDisplay } from "@/hooks/use-shortcut-config"
import { cn } from "@/lib/utils"
import { ShortcutAction } from "@/types/settings"

function NewChatTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { t } = useTranslation("common")
  const shortcutKeys = useShortcutDisplay(ShortcutAction.NEW_CHAT)

  return (
    <Tooltip disableHoverableContent={true}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            className
          )}
          {...props}
        >
          <MessageSquarePlus className="size-4 lucide-light" />
          <span className="sr-only">{t("nav.newChat")}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t("nav.newChat")}{" "}
        <KbdGroup>
          {shortcutKeys.map(key => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  )
}

export { NewChatTrigger }
