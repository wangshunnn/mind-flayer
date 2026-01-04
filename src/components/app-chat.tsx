import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { AtomIcon, GlobeIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageContent,
  MessageResponse
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools
} from "@/components/ai-elements/prompt-input"
import { SelectModel } from "@/components/select-model"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const AppChat = () => {
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false)
  const [useDeepThink, setUseDeepThink] = useState<boolean>(false)
  const [isCondensed, setIsCondensed] = useState(false)
  const [input, setInput] = useState("")
  const inputContainerRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `http://localhost:${__SIDECAR_PORT__}/api/chat`,
      headers: {
        "X-API-Key": import.meta.env.VITE_MINIMAX_API_KEY || "",
        "X-Model": "MiniMax-M2"
      }
    }),
    onError: error => {
      toast.error("Error", {
        description: error.message
      })
    }
  })

  const { isCompact, open } = useSidebar()

  useEffect(() => {
    const el = inputContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setIsCondensed(entry.contentRect.width < 448) // md breakpoint
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text)
    const hasAttachments = Boolean(message.files?.length)

    if (!(hasText || hasAttachments)) {
      return
    }

    if (message.files?.length) {
      toast.success("Files attached", {
        description: `${message.files.length} file(s) attached to message`
      })
    }

    if (message.text) {
      sendMessage({ text: message.text })
      setInput("")
    }
  }

  const isSubmitDisabled = !input.trim() || status !== "ready"

  return (
    <div className="flex h-full flex-col">
      {/* Top */}
      <div className="bg-background flex h-13 items-center border-b-[0.5px] pt-0.5">
        <div
          className={cn(
            "fixed left-10 flex z-50 items-center justify-center pointer-events-auto gap-1.25",
            !isCompact && open ? "left-63" : "left-42",
            "transition-left duration-300 ease"
          )}
        >
          <SelectModel />
        </div>
      </div>

      {/* Middle */}
      <div className="flex-1 min-h-0">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map(message => (
              <MessageBranch defaultBranch={0} key={message.id}>
                <MessageBranchContent>
                  <Message from={message.role} key={message.id}>
                    <MessageContent>
                      <MessageResponse>
                        {message.parts
                          .filter(part => part.type === "text")
                          .map(part => (part.type === "text" ? part.text : ""))
                          .join("")}
                      </MessageResponse>
                    </MessageContent>
                  </Message>
                </MessageBranchContent>
              </MessageBranch>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      {/* Bottom */}
      <div className="relative bg-background flex-none">
        <div className="relative flex items-center justify-center px-5 w-(--chat-content-width)">
          {/* Gradient Region */}
          <div
            className={cn(
              "absolute bottom-full left-2.5 right-2.5 h-6",
              "bg-linear-to-b from-(--background-transparent) to-background"
            )}
          />

          {/* Chat Input */}
          <div
            className="relative w-full max-w-(--chat-content-max-width) pb-6"
            ref={inputContainerRef}
          >
            <PromptInput globalDrop multiple onSubmit={handleSubmit}>
              {/* Attachments header */}
              <PromptInputHeader>
                <PromptInputAttachments>
                  {attachment => <PromptInputAttachment data={attachment} />}
                </PromptInputAttachments>
              </PromptInputHeader>

              {/* Input box */}
              <PromptInputBody>
                <PromptInputTextarea
                  onChange={event => setInput(event.target.value)}
                  value={input}
                />
              </PromptInputBody>

              {/* Footer */}
              <PromptInputFooter>
                {/* Tools in Left */}
                <PromptInputTools>
                  <Tooltip open={!isCondensed ? false : undefined}>
                    <TooltipTrigger asChild>
                      <PromptInputButton
                        onClick={() => setUseDeepThink(!useDeepThink)}
                        variant={useDeepThink ? "selected" : "ghost"}
                        size={isCondensed ? "icon-xs" : "xs"}
                      >
                        <AtomIcon className="lucide-stroke-bold mb-px" />
                        {!isCondensed && <span>DeepThink</span>}
                      </PromptInputButton>
                    </TooltipTrigger>
                    <TooltipContent>Deep thinking</TooltipContent>
                  </Tooltip>

                  <Tooltip open={!isCondensed ? false : undefined}>
                    <TooltipTrigger asChild>
                      <PromptInputButton
                        onClick={() => setUseWebSearch(!useWebSearch)}
                        variant={useWebSearch ? "selected" : "ghost"}
                        size={isCondensed ? "icon-xs" : "xs"}
                      >
                        <GlobeIcon className="lucide-stroke-bold mb-px" />
                        {!isCondensed && <span>Search</span>}
                      </PromptInputButton>
                    </TooltipTrigger>
                    <TooltipContent>Web search</TooltipContent>
                  </Tooltip>
                </PromptInputTools>

                {/* Tools in Right */}
                <PromptInputTools className="gap-3">
                  {/* Add attachments */}
                  <PromptInputActionMenu>
                    {/* <Tooltip disableHoverableContent={true}>
                      <TooltipTrigger asChild> */}
                    <PromptInputActionMenuTrigger />
                    {/* </TooltipTrigger>
                      <TooltipContent>Add files, photos, and more</TooltipContent>
                    </Tooltip> */}
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>

                  {/* Submit button */}
                  <Tooltip disableHoverableContent={true} open={undefined}>
                    <TooltipTrigger asChild>
                      <div className={cn(isSubmitDisabled && "cursor-not-allowed")}>
                        <PromptInputSubmit disabled={isSubmitDisabled} status={status} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Submit</TooltipContent>
                  </Tooltip>
                </PromptInputTools>
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  )
}

export { AppChat }
