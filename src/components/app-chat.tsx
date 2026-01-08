import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"
import { AtomIcon, GlobeIcon, SparklesIcon, ZapIcon } from "lucide-react"
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
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputTextareaHandle,
  PromptInputTools
} from "@/components/ai-elements/prompt-input"
import {
  ReasoningSegment,
  ReasoningSegmentContent,
  ThinkingProcess,
  ThinkingProcessCompletion,
  ThinkingProcessContent,
  ThinkingProcessTrigger
} from "@/components/ai-elements/thinking-process"
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
import {
  ToolCallsContainer,
  ToolCallsContainerContent,
  ToolCallsContainerTrigger
} from "@/components/ai-elements/tool-calls-container"
import { MODEL_OPTIONS, type ModelOption, SelectModel } from "@/components/select-model"
import { ToolButton } from "@/components/tool-button"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const AppChat = () => {
  const [useWebSearch, setUseWebSearch] = useState<boolean>(true)
  const [webSearchMode, setWebSearchMode] = useState<"auto" | "always">("auto")
  const [useDeepThink, setUseDeepThink] = useState<boolean>(false)
  const [isCondensed, setIsCondensed] = useState(false)
  const [input, setInput] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODEL_OPTIONS[0])
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<PromptInputTextareaHandle>(null)

  // Use refs to keep latest values accessible in headers function
  const selectedModelRef = useRef(selectedModel)
  const useWebSearchRef = useRef(useWebSearch)
  const webSearchModeRef = useRef(webSearchMode)

  // Keep refs in sync with state
  useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])

  useEffect(() => {
    useWebSearchRef.current = useWebSearch
  }, [useWebSearch])

  useEffect(() => {
    webSearchModeRef.current = webSearchMode
  }, [webSearchMode])

  const { status, messages, sendMessage, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
      api: `http://localhost:${__SIDECAR_PORT__}/api/chat`,
      headers: () => ({
        "X-API-Key": import.meta.env.VITE_MINIMAX_API_KEY || "",
        "X-Model-Provider": selectedModelRef.current.provider,
        "X-Model-Id": selectedModelRef.current.api_id,
        "X-Use-Web-Search": useWebSearchRef.current.toString(),
        "X-Web-Search-Mode": webSearchModeRef.current
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
      <div className="bg-background flex h-13 items-center border-b-[0.5px] pt-0">
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

              // Check if the thinking/reasoning phase is still streaming
              // This is true only if we're streaming AND the last part is reasoning/tool related
              const lastPart = message.parts[message.parts.length - 1]
              const isThinkingStreaming =
                isCurrentlyStreaming &&
                (lastPart?.type === "reasoning" ||
                  lastPart?.type === "step-start" ||
                  lastPart?.type.startsWith("tool-"))

              // Process message parts to organize by steps
              type StepSegment = {
                type: "reasoning" | "tool"
                partIndex: number
                reasoning?: { text: string; isStreaming: boolean }
                tool?: { type: string; state?: string; [key: string]: unknown }
              }

              const steps: StepSegment[][] = []
              let currentStep: StepSegment[] = []

              message.parts.forEach((part, partIndex) => {
                if (part.type === "step-start") {
                  // Start a new step
                  if (currentStep.length > 0) {
                    steps.push(currentStep)
                    currentStep = []
                  }
                } else if (part.type === "reasoning") {
                  const isReasoningStreaming =
                    isThinkingStreaming && partIndex === message.parts.length - 1
                  currentStep.push({
                    type: "reasoning",
                    partIndex,
                    reasoning: { text: part.text, isStreaming: isReasoningStreaming }
                  })
                } else if (part.type.startsWith("tool-")) {
                  currentStep.push({
                    type: "tool",
                    partIndex,
                    tool: part
                  })
                }
              })

              // Add the last step
              if (currentStep.length > 0) {
                steps.push(currentStep)
              }

              const hasThinkingProcess =
                steps.length > 0 &&
                steps.some(step =>
                  step.some(segment => segment.type === "reasoning" || segment.type === "tool")
                )

              // Check if thinking process is complete (all reasoning and tools are done)
              const isThinkingComplete = steps.every(step =>
                step.every(segment => {
                  if (segment.type === "reasoning") {
                    return !segment.reasoning?.isStreaming
                  }
                  if (segment.type === "tool" && segment.tool) {
                    const toolState = (segment.tool as { state?: string }).state
                    return (
                      !toolState ||
                      ![
                        "input-streaming",
                        "input-available",
                        "approval-requested",
                        "approval-responded"
                      ].includes(toolState)
                    )
                  }
                  return true
                })
              )

              // Collect tool information for detailed container (show as soon as there are tool calls)
              const toolParts = message.parts.filter(part => part.type.startsWith("tool-"))
              const toolNames = toolParts.map(part => {
                const toolType = part.type.replace("tool-", "")
                return toolType === "webSearch" ? "Web Search" : toolType
              })
              const hasTools = toolParts.length > 0

              return (
                <MessageBranch defaultBranch={0} key={message.id}>
                  <MessageBranchContent>
                    <Message from={message.role} key={message.id}>
                      {/* Thinking Process - organized by steps */}
                      {message.role === "assistant" && hasThinkingProcess && (
                        <ThinkingProcess isStreaming={isThinkingStreaming}>
                          <ThinkingProcessTrigger />
                          <ThinkingProcessContent>
                            {steps.map(step => {
                              // Process all segments in this step
                              return step.map(segment => {
                                if (segment.type === "reasoning") {
                                  return (
                                    <ReasoningSegment
                                      key={`reasoning-${message.id}-${segment.partIndex}`}
                                      isStreaming={segment.reasoning?.isStreaming}
                                      segmentType="reasoning"
                                    >
                                      <ReasoningSegmentContent>
                                        {segment.reasoning?.text || ""}
                                      </ReasoningSegmentContent>
                                    </ReasoningSegment>
                                  )
                                }

                                if (segment.type === "tool" && segment.tool) {
                                  const tool = segment.tool as {
                                    type: string
                                    state?: string
                                    output?: { totalResults?: number; [key: string]: unknown }
                                    input?: {
                                      objective: string
                                      searchQueries: string[]
                                      maxResults?: number
                                    }
                                  }
                                  const toolType = tool.type.replace("tool-", "")
                                  const isWebSearch = toolType === "webSearch"
                                  const segmentType = isWebSearch ? "tool-webSearch" : "tool-other"
                                  const toolDisplayName = isWebSearch ? "Web Search" : toolType

                                  // Get tool result summary
                                  let toolResult = "Working..."
                                  switch (tool.state) {
                                    case "output-available": {
                                      if (tool.output) {
                                        if (isWebSearch && tool.output.totalResults !== undefined) {
                                          toolResult = `Searched ${tool.output.totalResults} results`
                                        } else {
                                          toolResult = "Done"
                                        }
                                      }
                                      break
                                    }
                                    case "output-error": {
                                      toolResult = "Failed"
                                      break
                                    }
                                    case "output-denied": {
                                      toolResult = "Cancelled"
                                      break
                                    }
                                    case "input-streaming":
                                    case "input-available": {
                                      toolResult = "Working..."
                                      break
                                    }
                                    case "approval-requested": {
                                      toolResult = "Awaiting approval..."
                                      break
                                    }
                                  }

                                  const toolDescription = isWebSearch ? tool.input?.objective : ""

                                  const toolIdentifier = `${tool.type}-${message.id}-${segment.partIndex}`
                                  return (
                                    <ReasoningSegment
                                      key={toolIdentifier}
                                      segmentType={segmentType}
                                      toolName={toolDisplayName}
                                      toolResult={toolResult}
                                      toolState={tool.state}
                                      toolDescription={toolDescription}
                                    >
                                      1212
                                    </ReasoningSegment>
                                  )
                                }

                                return null
                              })
                            })}

                            {/* Show completion summary when thinking process is complete */}
                            {isThinkingComplete && (
                              <ThinkingProcessCompletion stepCount={steps.length} />
                            )}
                          </ThinkingProcessContent>
                        </ThinkingProcess>
                      )}

                      {/* Tool Calls Container - only show after streaming is done */}
                      {message.role === "assistant" && hasTools && (
                        <ToolCallsContainer toolCount={toolParts.length}>
                          <ToolCallsContainerTrigger toolNames={toolNames} />
                          <ToolCallsContainerContent>
                            {toolParts.map(part => {
                              // Handle webSearch tool with approval
                              if (part.type === "tool-webSearch") {
                                const callId = part.toolCallId
                                // Type assertion for input
                                const input = part.input as {
                                  objective: string
                                  searchQueries: string[]
                                  maxResults?: number
                                }

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
                                      {(part.state === "input-streaming" ||
                                        part.state === "input-available") && (
                                        <ToolCallInputStreaming
                                          message={`Searching "${input?.objective ? input.objective : "..."}"`}
                                        />
                                      )}
                                      {part.state === "approval-requested" && (
                                        <ToolCallApprovalRequested
                                          description={
                                            <>
                                              The AI wants to search the web for:{" "}
                                              <strong>"{input?.objective ?? ""}"</strong>
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
                          </ToolCallsContainerContent>
                        </ToolCallsContainer>
                      )}

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
                  <ToolButton
                    icon={GlobeIcon}
                    label="Search"
                    tooltip="Web search"
                    enabled={useWebSearch}
                    onEnabledChange={setUseWebSearch}
                    collapsed={isCondensed}
                    modes={[
                      {
                        value: "auto",
                        label: "Auto",
                        badge: "Recommended",
                        description: "Search only when needed needed",
                        icon: SparklesIcon
                      },
                      {
                        value: "always",
                        label: "Always",
                        description: "Search for every query",
                        icon: ZapIcon
                      }
                    ]}
                    selectedMode={webSearchMode}
                    onModeChange={mode => setWebSearchMode(mode as "auto" | "always")}
                  />

                  <ToolButton
                    icon={AtomIcon}
                    label="DeepThink"
                    tooltip="Deep thinking"
                    enabled={useDeepThink}
                    onEnabledChange={setUseDeepThink}
                    collapsed={isCondensed}
                  />
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
          "absolute bottom-1 flex max-h-6 items-center justify-center",
          "max-w-(--chat-content-max-width) mx-auto left-0 right-0",
          "text-[9px] text-muted-foreground/50 shadow-none",
          "overflow-hidden whitespace-nowrap text-ellipsis"
        )}
      >
        AI-generated content, for reference only. Star at{" "}
        <a
          href="https://github.com/wangshunnn/mind-flayer"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors underline"
        >
          Github
        </a>
        {"."}
      </div>
    </div>
  )
}

export { AppChat }
