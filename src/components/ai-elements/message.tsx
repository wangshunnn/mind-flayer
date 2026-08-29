import { math } from "@streamdown/math"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { FileUIPart, UIMessage } from "ai"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LoaderCircleIcon,
  PaperclipIcon
} from "lucide-react"
import type { ComponentProps, HTMLAttributes, ReactElement } from "react"
import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { defaultRemarkPlugins, Streamdown } from "streamdown"
import {
  createRewriteLocalImageRemarkPlugin,
  createStreamdownComponentsWithLocalImage,
  streamdownRehypePluginsWithLocalImageSrc
} from "@/components/ai-elements/streamdown-local-image"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { saveUrlAs } from "@/lib/file-save"
import { buildImagePreviewPayload } from "@/lib/image-preview"
import { normalizeLocalImageMarkdown } from "@/lib/local-image-url"
import { cn } from "@/lib/utils"
import { openImagePreviewWindow } from "@/lib/window-manager"
import "katex/dist/katex.min.css"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export const Message = forwardRef<HTMLDivElement, MessageProps>(
  ({ className, from, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "group flex w-full flex-col gap-2 px-2",
        from === "user" ? "is-user ml-auto justify-end pt-6 pb-1" : "is-assistant",
        className
      )}
      {...props}
    />
  )
)

Message.displayName = "Message"

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    data-slot="message-content"
    className={cn(
      "is-user:dark flex w-fit max-w-full min-w-0 flex-col gap-2",
      "text-[14px] leading-[1.6] px-0",
      "group-[.is-user]:ml-auto group-[.is-user]:bg-secondary group-[.is-user]:text-foreground",
      "group-[.is-user]:px-4 group-[.is-user]:pt-2 group-[.is-user]:pb-2.25",
      "group-[.is-user]:rounded-lg group-[.is-user]:rounded-tr-none",
      "group-[.is-user]:bg-brand-soft",
      "group-[.is-user]:max-w-[75%]",
      "group-[.is-user]:overflow-hidden",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export type MessageActionsProps = ComponentProps<"div">

export const MessageActions = ({ className, children, ...props }: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
)

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip disableHoverableContent={true}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return button
}

type MessageBranchContextType = {
  currentBranch: number
  totalBranches: number
  goToPrevious: () => void
  goToNext: () => void
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(null)

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext)

  if (!context) {
    throw new Error("MessageBranch components must be used within MessageBranch")
  }

  return context
}

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])

  const handleBranchChange = (newBranch: number) => {
    setCurrentBranch(newBranch)
    onBranchChange?.(newBranch)
  }

  const goToPrevious = () => {
    const newBranch = currentBranch > 0 ? currentBranch - 1 : branches.length - 1
    handleBranchChange(newBranch)
  }

  const goToNext = () => {
    const newBranch = currentBranch < branches.length - 1 ? currentBranch + 1 : 0
    handleBranchChange(newBranch)
  }

  const contextValue: MessageBranchContextType = {
    currentBranch,
    totalBranches: branches.length,
    goToPrevious,
    goToNext,
    branches,
    setBranches
  }

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex items-center",
          "w-(--chat-content-width) max-w-(--chat-content-max-width)",
          "grid gap-2 [&>div]:pb-2",
          className
        )}
        {...props}
      />
    </MessageBranchContext.Provider>
  )
}

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>

export const MessageBranchContent = ({ children, ...props }: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch()
  const childrenArray = Array.isArray(children) ? children : [children]

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray)
    }
  }, [childrenArray, branches, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-0 overflow-hidden [&>div]:pb-0 pb-0!",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ))
}

export type MessageBranchSelectorProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export const MessageBranchSelector = ({
  className,
  from,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch()

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null
  }

  return (
    <ButtonGroup
      className="[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md"
      orientation="horizontal"
      {...props}
    />
  )
}

export type MessageBranchPreviousProps = ComponentProps<typeof Button>

export const MessageBranchPrevious = ({ children, ...props }: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export const MessageBranchNext = ({ children, className, ...props }: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  )
}

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>

export const MessageBranchPage = ({ className, ...props }: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch()

  return (
    <ButtonGroupText
      className={cn("border-none bg-transparent text-muted-foreground shadow-none", className)}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  )
}

export type MessageResponseProps = ComponentProps<typeof Streamdown> & {
  localImageProxyOrigin?: string
  streaming?: boolean
}

const MESSAGE_STREAMDOWN_CONTROLS = {
  table: true,
  code: true,
  mermaid: {
    download: true,
    copy: true,
    fullscreen: false,
    panZoom: true
  }
} as const
const MESSAGE_STREAMDOWN_LINK_SAFETY = { enabled: false } as const
const MESSAGE_STREAMDOWN_PLUGINS = { math }
const MESSAGE_STREAMDOWN_REMARK_PLUGINS = Object.values(defaultRemarkPlugins)

export const MessageResponse = memo(
  ({
    className,
    children,
    components: componentsProp,
    localImageProxyOrigin,
    streaming = false,
    ...props
  }: MessageResponseProps) => {
    const [localImageCacheBustKey] = useState(
      () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    )
    const normalizedChildren = useMemo(
      () =>
        typeof children === "string" && localImageProxyOrigin
          ? normalizeLocalImageMarkdown(children)
          : children,
      [children, localImageProxyOrigin]
    )

    const components = useMemo(
      () =>
        createStreamdownComponentsWithLocalImage(
          componentsProp,
          localImageProxyOrigin,
          localImageCacheBustKey
        ),
      [componentsProp, localImageProxyOrigin, localImageCacheBustKey]
    )
    const rewriteLocalImagePlugin = useMemo(
      () => createRewriteLocalImageRemarkPlugin(localImageProxyOrigin, localImageCacheBustKey),
      [localImageProxyOrigin, localImageCacheBustKey]
    )
    const remarkPlugins = useMemo(
      () => [...MESSAGE_STREAMDOWN_REMARK_PLUGINS, rewriteLocalImagePlugin],
      [rewriteLocalImagePlugin]
    )

    return (
      <Streamdown
        className={cn(
          "app-chat",
          "size-full space-y-2.5",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        plugins={MESSAGE_STREAMDOWN_PLUGINS}
        linkSafety={MESSAGE_STREAMDOWN_LINK_SAFETY}
        controls={MESSAGE_STREAMDOWN_CONTROLS}
        components={components}
        isAnimating={streaming}
        mode={streaming ? "streaming" : "static"}
        remarkPlugins={remarkPlugins}
        rehypePlugins={streamdownRehypePluginsWithLocalImageSrc}
        {...props}
      >
        {normalizedChildren}
      </Streamdown>
    )
  }
)

MessageResponse.displayName = "MessageResponse"

export type MessageAttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: FileUIPart
  className?: string
  sidecarOrigin?: string
  variant: "single" | "tile"
}

const HTTP_PROTOCOL_REGEX = /^https?:/i

export const MessageAttachment = memo(function MessageAttachment({
  data,
  className,
  sidecarOrigin,
  variant,
  ...props
}: MessageAttachmentProps) {
  const { t } = useTranslation(["chat", "common"])
  const filename = data.filename?.trim() || ""
  const isImage = data.mediaType?.startsWith("image/") && Boolean(data.url)
  const attachmentLabel =
    filename || t(isImage ? "chat:attachments.image" : "chat:attachments.file")
  const previewPayload = useMemo(
    () =>
      isImage
        ? buildImagePreviewPayload(data.url, attachmentLabel, sidecarOrigin, {
            allowEmbedded: true,
            filename: attachmentLabel
          })
        : null,
    [attachmentLabel, data.url, isImage, sidecarOrigin]
  )
  const imageUrl = previewPayload?.resourceUrl ?? data.url
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const showFileCard = !isImage || failedImageUrl === imageUrl

  const handleOpenPreview = useCallback(() => {
    if (!previewPayload) {
      return
    }

    void openImagePreviewWindow(previewPayload).catch(() => {
      toast.error(t("common:toast.error"), {
        description: t("chat:attachments.toast.previewError")
      })
    })
  }, [previewPayload, t])

  const handleSave = useCallback(async () => {
    if (isSaving) {
      return
    }

    setIsSaving(true)
    try {
      const saved = await saveUrlAs(data.url, attachmentLabel)
      if (saved) {
        toast.success(t("chat:attachments.toast.saveSuccess"))
      }
    } catch {
      if (HTTP_PROTOCOL_REGEX.test(data.url)) {
        try {
          await openUrl(data.url)
          return
        } catch {
          // Report the shared attachment error below.
        }
      }

      toast.error(t("common:toast.error"), {
        description: t("chat:attachments.toast.saveError")
      })
    } finally {
      setIsSaving(false)
    }
  }, [attachmentLabel, data.url, isSaving, t])

  return (
    <div className={cn("min-w-0", className)} {...props}>
      {showFileCard ? (
        <TooltipProvider>
          <Tooltip disableHoverableContent={true}>
            <TooltipTrigger asChild>
              <button
                aria-label={t("chat:attachments.downloadNamed", { name: attachmentLabel })}
                className={cn(
                  "flex h-12 min-w-40 max-w-64 items-center gap-2 rounded-lg border border-border",
                  "bg-background/80 px-3 text-left shadow-xs transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-60"
                )}
                data-slot="message-attachment-file"
                disabled={isSaving}
                onClick={() => {
                  void handleSave()
                }}
                type="button"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <PaperclipIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{attachmentLabel}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {data.mediaType || t("chat:attachments.unknownType")}
                  </span>
                </span>
                {isSaving ? (
                  <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{attachmentLabel}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <TooltipProvider>
          <Tooltip disableHoverableContent={true}>
            <TooltipTrigger asChild>
              <button
                aria-label={t("chat:attachments.previewNamed", { name: attachmentLabel })}
                className={cn(
                  "block overflow-hidden rounded-lg border border-border bg-muted/30",
                  "cursor-zoom-in transition-colors hover:bg-muted/50",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  variant === "single" ? "max-h-40 max-w-40" : "size-24"
                )}
                data-attachment-variant={variant}
                data-slot="message-attachment-image"
                onClick={handleOpenPreview}
                type="button"
              >
                <img
                  alt={attachmentLabel}
                  className={cn(
                    "block object-contain",
                    variant === "single"
                      ? "h-auto max-h-40 w-auto max-w-40"
                      : "size-full object-cover"
                  )}
                  decoding="async"
                  height={variant === "single" ? 160 : 96}
                  loading="lazy"
                  onError={() => {
                    setFailedImageUrl(imageUrl)
                  }}
                  src={imageUrl}
                  width={variant === "single" ? 160 : 96}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("chat:attachments.previewNamed", { name: attachmentLabel })}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
})

export type MessageAttachmentsProps = ComponentProps<"div">

export function MessageAttachments({ children, className, ...props }: MessageAttachmentsProps) {
  if (!children) {
    return null
  }

  return (
    <div
      className={cn(
        "ml-auto flex w-fit max-w-[75%] flex-wrap items-start justify-end gap-2",
        className
      )}
      data-slot="message-attachments"
      {...props}
    >
      {children}
    </div>
  )
}

export type MessageToolbarProps = ComponentProps<"div">

export const MessageToolbar = ({ className, children, ...props }: MessageToolbarProps) => (
  <div className={cn("mt-4 flex w-full items-center justify-between gap-4", className)} {...props}>
    {children}
  </div>
)
