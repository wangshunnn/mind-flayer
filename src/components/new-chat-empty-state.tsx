import { useTranslation } from "react-i18next"
import { ConversationEmptyState } from "@/components/ai-elements/conversation"
import appLogo from "../../src-tauri/icons/128x128.png"

export function NewChatEmptyState() {
  const { t } = useTranslation("chat")
  const highlights = [
    t("emptyState.highlights.multiModel"),
    t("emptyState.highlights.memory"),
    t("emptyState.highlights.tools"),
    t("emptyState.highlights.skills"),
    t("emptyState.highlights.channels")
  ]

  return (
    <ConversationEmptyState className="gap-3 p-6 sm:p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <img
          alt={t("emptyState.logoAlt")}
          className="h-14 w-14 object-contain select-none"
          draggable={false}
          src={appLogo}
        />
        <p className="text-xs tracking-[0.02em] text-muted-foreground/75">
          {highlights.join(" · ")}
        </p>
      </div>
    </ConversationEmptyState>
  )
}
