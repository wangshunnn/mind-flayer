import type { ToolUIPart } from "ai"
import { AtomIcon, GlobeIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useRef, useState } from "react"
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
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
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
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources"
import { SelectModel } from "@/components/select-model"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type MessageType = {
  key: string
  from: "user" | "assistant"
  sources?: { href: string; title: string }[]
  versions: {
    id: string
    content: string
  }[]
  reasoning?: {
    content: string
    duration: number
  }
  tools?: {
    name: string
    description: string
    status: ToolUIPart["state"]
    parameters: Record<string, unknown>
    result: string | undefined
    error: string | undefined
  }[]
}

const initialMessages: MessageType[] = [
  {
    key: nanoid(),
    from: "user",
    versions: [
      {
        id: nanoid(),
        content: "Can you explain how to use React hooks effectively?"
      }
    ]
  },
  {
    key: nanoid(),
    from: "assistant",
    sources: [
      {
        href: "https://react.dev/reference/react",
        title: "React Documentation"
      },
      {
        href: "https://react.dev/reference/react-dom",
        title: "React DOM Documentation"
      }
    ],
    versions: [
      {
        id: nanoid(),
        content: `# React Hooks Best Practices
1. **Only call hooks at the top level** of your component or custom hooks
2. **Don't call hooks inside loops, conditions, or nested functions**`
      }
    ]
  }
]

// const _models = [
//   {
//     id: "gemini-2.0-flash-exp",
//     name: "Gemini 2.0 Flash",
//     chef: "Google",
//     chefSlug: "google",
//     providers: ["google"]
//   }
// ]

const mockResponses = [
  "That's a great question! Let me help you understand this concept better. The key thing to remember is that proper implementation requires careful consideration of the underlying principles and best practices in the field.",
  "I'd be happy to explain this topic in detail. From my understanding, there are several important factors to consider when approaching this problem. Let me break it down step by step for you.",
  "This is an interesting topic that comes up frequently. The solution typically involves understanding the core concepts and applying them in the right context. Here's what I recommend...",
  "Great choice of topic! This is something that many developers encounter. The approach I'd suggest is to start with the fundamentals and then build up to more complex scenarios.",
  "That's definitely worth exploring. From what I can see, the best way to handle this is to consider both the theoretical aspects and practical implementation details."
]

const AppChat = () => {
  const [text, setText] = useState<string>("")
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false)
  const [useDeepThink, setUseDeepThink] = useState<boolean>(false)
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready")
  const [messages, setMessages] = useState<MessageType[]>(initialMessages)
  const [, setStreamingMessageId] = useState<string | null>(null)
  const [isCondensed, setIsCondensed] = useState(false)
  const inputContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = inputContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setIsCondensed(entry.contentRect.width < 448) // md breakpoint
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const streamResponse = useCallback(async (messageId: string, content: string) => {
    setStatus("streaming")
    setStreamingMessageId(messageId)

    const words = content.split(" ")
    let currentContent = ""

    for (let i = 0; i < words.length; i++) {
      currentContent += (i > 0 ? " " : "") + words[i]

      setMessages(prev =>
        prev.map(msg => {
          if (msg.versions.some(v => v.id === messageId)) {
            return {
              ...msg,
              versions: msg.versions.map(v =>
                v.id === messageId ? { ...v, content: currentContent } : v
              )
            }
          }
          return msg
        })
      )

      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50))
    }

    setStatus("ready")
    setStreamingMessageId(null)
  }, [])

  const addUserMessage = useCallback(
    (content: string) => {
      const userMessage: MessageType = {
        key: `user-${Date.now()}`,
        from: "user",
        versions: [
          {
            id: `user-${Date.now()}`,
            content
          }
        ]
      }

      setMessages(prev => [...prev, userMessage])

      setTimeout(() => {
        const assistantMessageId = `assistant-${Date.now()}`
        const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)]

        const assistantMessage: MessageType = {
          key: `assistant-${Date.now()}`,
          from: "assistant",
          versions: [
            {
              id: assistantMessageId,
              content: ""
            }
          ]
        }

        setMessages(prev => [...prev, assistantMessage])
        streamResponse(assistantMessageId, randomResponse)
      }, 500)
    },
    [streamResponse]
  )

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text)
    const hasAttachments = Boolean(message.files?.length)

    if (!(hasText || hasAttachments)) {
      return
    }

    setStatus("submitted")

    if (message.files?.length) {
      toast.success("Files attached", {
        description: `${message.files.length} file(s) attached to message`
      })
    }

    addUserMessage(message.text || "Sent with attachments")
    setText("")
  }

  const { isCompact, open } = useSidebar()

  const isSubmitDisabled = !text.trim() || status === "streaming"

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
            {messages.map(({ versions, ...message }) => (
              <MessageBranch defaultBranch={0} key={message.key}>
                <MessageBranchContent>
                  {versions.map(version => (
                    <Message from={message.from} key={`${message.key}-${version.id}`}>
                      <div>
                        {message.sources?.length && (
                          <Sources>
                            <SourcesTrigger count={message.sources.length} />
                            <SourcesContent>
                              {message.sources.map(source => (
                                <Source href={source.href} key={source.href} title={source.title} />
                              ))}
                            </SourcesContent>
                          </Sources>
                        )}
                        {message.reasoning && (
                          <Reasoning duration={message.reasoning.duration}>
                            <ReasoningTrigger />
                            <ReasoningContent>{message.reasoning.content}</ReasoningContent>
                          </Reasoning>
                        )}
                        <MessageContent>
                          <MessageResponse>{version.content}</MessageResponse>
                        </MessageContent>
                      </div>
                    </Message>
                  ))}
                </MessageBranchContent>
                {versions.length > 1 && (
                  <MessageBranchSelector from={message.from}>
                    <MessageBranchPrevious />
                    <MessageBranchPage />
                    <MessageBranchNext />
                  </MessageBranchSelector>
                )}
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
                <PromptInputTextarea onChange={event => setText(event.target.value)} value={text} />
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
