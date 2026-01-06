import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"
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
  AssistantMessageActionsBar,
  UserMessageActionsBar
} from "@/components/ai-elements/message-actions-bar"
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
  type PromptInputTextareaHandle,
  PromptInputTools
} from "@/components/ai-elements/prompt-input"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import {
  ToolCall,
  ToolCallApprovalRequested,
  ToolCallContent,
  ToolCallInputStreaming,
  ToolCallOutputDenied,
  ToolCallOutputError,
  ToolCallTrigger,
  ToolCallWebSearchResults
} from "@/components/ai-elements/tool-call"
import { MODEL_OPTIONS, type ModelOption, SelectModel } from "@/components/select-model"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const AppChat = () => {
  const [useWebSearch, setUseWebSearch] = useState<boolean>(true)
  const [useDeepThink, setUseDeepThink] = useState<boolean>(false)
  const [isCondensed, setIsCondensed] = useState(false)
  const [input, setInput] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODEL_OPTIONS[0])
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<PromptInputTextareaHandle>(null)

  // Use refs to keep latest values accessible in headers function
  const selectedModelRef = useRef(selectedModel)
  const useWebSearchRef = useRef(useWebSearch)

  // Keep refs in sync with state
  useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])

  useEffect(() => {
    useWebSearchRef.current = useWebSearch
  }, [useWebSearch])

  const { status, messages, sendMessage, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
      api: `http://localhost:${__SIDECAR_PORT__}/api/chat`,
      headers: () => ({
        "X-API-Key": import.meta.env.VITE_MINIMAX_API_KEY || "",
        "X-Model-Provider": selectedModelRef.current.provider,
        "X-Model-Id": selectedModelRef.current.api_id,
        "X-Use-Web-Search": useWebSearchRef.current.toString()
      })
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: error => {
      toast.error("Error", {
        description: error.message
      })
    }
  })

  console.dir(messages.at(-1)?.parts, { depth: null })

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
      // Reset textarea height after sending
      textareaRef.current?.resetHeight()
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
            !isCompact && open ? "left-58" : "left-42",
            "transition-left duration-300 ease"
          )}
        >
          <SelectModel value={selectedModel} onChange={setSelectedModel} />
        </div>
      </div>

      {/* Middle */}
      <div className="flex-1 min-h-0">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message, index) => {
              const reasoningText = message.parts
                .filter(part => part.type === "reasoning")
                .map(part => part.text)
                .join("")
              const messageText = message.parts
                .filter(part => part.type === "text")
                .map(part => part.text)
                .join("")

              // Ensure metadata is typed as an object with optional totalTokens
              const metadata = message.metadata as
                | {
                    totalUsage?: {
                      inputTokens: number
                      outputTokens: number
                      totalTokens: number
                    }
                  }
                | undefined

              // Check if this is the last message and currently streaming
              const isLastMessage = index === messages.length - 1
              const isCurrentlyStreaming = status === "streaming" && isLastMessage

              return (
                <MessageBranch defaultBranch={0} key={message.id}>
                  <MessageBranchContent>
                    <Message from={message.role} key={message.id}>
                      {/* Reasoning */}
                      {reasoningText && (
                        <Reasoning isStreaming={isCurrentlyStreaming}>
                          <ReasoningTrigger />
                          <ReasoningContent>{reasoningText}</ReasoningContent>
                        </Reasoning>
                      )}

                      {/* Render tool parts for assistant messages */}
                      {message.role === "assistant" &&
                        message.parts.map(part => {
                          // Handle webSearch tool with approval
                          if (part.type === "tool-webSearch") {
                            const callId = part.toolCallId
                            // Type assertion for input
                            const input = part.input as { query: string; maxResults?: number }

                            // Get result count for output-available state
                            const output =
                              part.state === "output-available"
                                ? (part.output as {
                                    query: string
                                    results: Array<{
                                      title: string
                                      url: string
                                      snippet: string
                                    }>
                                    totalResults: number
                                  })
                                : null

                            return (
                              <ToolCall
                                key={callId}
                                toolName="webSearch"
                                state={part.state}
                                resultCount={output?.totalResults}
                              >
                                <ToolCallTrigger />
                                <ToolCallContent>
                                  {part.state === "input-streaming" && (
                                    <ToolCallInputStreaming message="Preparing web search..." />
                                  )}
                                  {part.state === "input-available" && (
                                    <ToolCallInputStreaming
                                      message={`Searching: "${input.query}"`}
                                    />
                                  )}
                                  {part.state === "approval-requested" && (
                                    <ToolCallApprovalRequested
                                      description={
                                        <>
                                          The AI wants to search the web for:{" "}
                                          <strong>"{input.query}"</strong>
                                        </>
                                      }
                                      onApprove={() =>
                                        addToolApprovalResponse({
                                          id: part.approval.id,
                                          approved: true
                                        })
                                      }
                                      onDeny={() =>
                                        addToolApprovalResponse({
                                          id: part.approval.id,
                                          approved: false
                                        })
                                      }
                                    />
                                  )}
                                  {part.state === "output-available" && output && (
                                    <ToolCallWebSearchResults results={output.results} />
                                  )}
                                  {part.state === "output-error" && (
                                    <ToolCallOutputError errorText={part.errorText} />
                                  )}
                                  {part.state === "output-denied" && (
                                    <ToolCallOutputDenied message={part.errorText} />
                                  )}
                                </ToolCallContent>
                              </ToolCall>
                            )
                          }
                          return null
                        })}

                      {/* Message content */}
                      <MessageContent>
                        <MessageResponse>{messageText}</MessageResponse>
                      </MessageContent>
                      {/* Action bar for user messages (hover to show) */}
                      {message.role === "user" && (
                        <UserMessageActionsBar
                          messageText={messageText}
                          onEdit={() => {
                            // TODO: Implement edit functionality
                          }}
                        />
                      )}
                      {/* Action bar for assistant messages (show only after streaming is complete and no pending approvals) */}
                      {message.role === "assistant" &&
                        !isCurrentlyStreaming &&
                        !message.parts.some(
                          part =>
                            part.type.startsWith("tool-") &&
                            (part as { state?: string }).state === "approval-requested"
                        ) && (
                          <AssistantMessageActionsBar
                            messageText={messageText}
                            tokenInfo={metadata?.totalUsage}
                            onLike={() => {
                              // TODO: Implement like functionality
                            }}
                            onDislike={() => {
                              // TODO: Implement dislike functionality
                            }}
                            onShare={() => {
                              // TODO: Implement share functionality
                            }}
                            onRefresh={() => {
                              // TODO: Implement regenerate functionality
                            }}
                          />
                        )}
                    </Message>
                  </MessageBranchContent>
                </MessageBranch>
              )
            })}
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
                  ref={textareaRef}
                  onChange={event => setInput(event.target.value)}
                  value={input}
                />
              </PromptInputBody>

              {/* Footer */}
              <PromptInputFooter>
                {/* Tools in Left */}
                <PromptInputTools className="-ml-1.5">
                  <Tooltip open={!isCondensed ? false : undefined}>
                    <TooltipTrigger asChild>
                      <PromptInputButton
                        onClick={() => setUseWebSearch(!useWebSearch)}
                        variant={useWebSearch ? "selected" : "ghost"}
                        collapsed={isCondensed}
                      >
                        <GlobeIcon className="lucide-stroke-bold mb-px" />
                        {!isCondensed && <span>Search</span>}
                      </PromptInputButton>
                    </TooltipTrigger>
                    <TooltipContent>Web search</TooltipContent>
                  </Tooltip>

                  <Tooltip open={!isCondensed ? false : undefined}>
                    <TooltipTrigger asChild>
                      <PromptInputButton
                        onClick={() => setUseDeepThink(!useDeepThink)}
                        variant={useDeepThink ? "selected" : "ghost"}
                        collapsed={isCondensed}
                      >
                        <AtomIcon className="lucide-stroke-bold mb-px" />
                        {!isCondensed && <span>DeepThink</span>}
                      </PromptInputButton>
                    </TooltipTrigger>
                    <TooltipContent>Deep thinking</TooltipContent>
                  </Tooltip>
                </PromptInputTools>

                {/* Tools in Right */}
                <PromptInputTools className="gap-3">
                  {/* Add attachments */}
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger />
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

      {/* Copyright */}
      <div
        className={cn(
          "absolute bottom-1 flex w-full max-h-6 items-center justify-center",
          "w-(--chat-content-width) max-w-(--chat-content-max-width)",
          "text-[10px] text-muted-foreground/50 shadow-none"
        )}
      >
        AI-generated content, for reference only
      </div>
    </div>
  )
}

export { AppChat }
