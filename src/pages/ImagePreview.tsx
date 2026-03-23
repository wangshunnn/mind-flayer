import { useSearch } from "@tanstack/react-router"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { save } from "@tauri-apps/plugin-dialog"
import { writeFile } from "@tauri-apps/plugin-fs"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { CopyIcon, DownloadIcon, FolderSearchIcon, InfoIcon, LoaderCircleIcon } from "lucide-react"
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { consumeImagePreviewSession, type ImagePreviewPayload } from "@/lib/image-preview"
import { cn } from "@/lib/utils"

type ImageMetrics = {
  fileSize: number | null
  height: number | null
  mimeType: string | null
  width: number | null
}

type ImageResourceState = {
  blob: Blob | null
  error: string | null
  isLoading: boolean
  objectUrl: string | null
}

type ImagePanOffset = {
  x: number
  y: number
}

type ImageDragState = {
  originX: number
  originY: number
  pointerId: number
  scale: number
  startX: number
  startY: number
}

const EMPTY_METRICS: ImageMetrics = {
  fileSize: null,
  height: null,
  mimeType: null,
  width: null
}

const DEFAULT_PAN_OFFSET: ImagePanOffset = { x: 0, y: 0 }
const IMAGE_MAX_ZOOM = 5
const IMAGE_MIN_ZOOM = 0.5
const IMAGE_ZOOM_SENSITIVITY = 0.0015

function formatFileSize(size: number | null, notAvailableText: string): string {
  if (size === null || Number.isNaN(size)) {
    return notAvailableText
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatResolution(metrics: ImageMetrics, notAvailableText: string): string {
  if (!metrics.width || !metrics.height) {
    return notAvailableText
  }

  return `${metrics.width} × ${metrics.height}`
}

function clampZoomScale(scale: number): number {
  return Math.min(IMAGE_MAX_ZOOM, Math.max(IMAGE_MIN_ZOOM, scale))
}

function clampPanOffset({
  baseHeight,
  baseWidth,
  scale,
  viewportHeight,
  viewportWidth,
  x,
  y
}: {
  baseHeight: number
  baseWidth: number
  scale: number
  viewportHeight: number
  viewportWidth: number
  x: number
  y: number
}): ImagePanOffset {
  const maxOffsetX = Math.max(0, (baseWidth * scale - viewportWidth) / 2)
  const maxOffsetY = Math.max(0, (baseHeight * scale - viewportHeight) / 2)

  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y))
  }
}

async function convertImageElementToPngBlob(imageElement: HTMLImageElement | null): Promise<Blob> {
  if (!imageElement || !imageElement.naturalWidth || !imageElement.naturalHeight) {
    throw new Error("Image is not ready to copy")
  }

  const canvas = document.createElement("canvas")
  canvas.width = imageElement.naturalWidth
  canvas.height = imageElement.naturalHeight

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Unable to access canvas context")
  }

  context.drawImage(imageElement, 0, 0)

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, "image/png")
  })

  if (!blob) {
    throw new Error("Unable to convert image to PNG")
  }

  return blob
}

async function copyImageBlobToClipboard(
  blob: Blob,
  imageElement: HTMLImageElement | null
): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Clipboard image writing is not supported")
  }

  const preferredMimeType = blob.type || "image/png"

  try {
    await navigator.clipboard.write([new ClipboardItem({ [preferredMimeType]: blob })])
    return
  } catch {
    const pngBlob = await convertImageElementToPngBlob(imageElement)
    await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })])
  }
}

function ActionButton({
  label,
  onClick,
  children,
  disabled = false
}: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick?: () => void
}) {
  return (
    <Tooltip disableHoverableContent={true}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export default function ImagePreview() {
  const { t: tChat } = useTranslation("chat")
  const { t: tCommon } = useTranslation("common")
  const searchParams = useSearch({ from: "/image-preview" })
  const imageRef = useRef<HTMLImageElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<ImageDragState | null>(null)
  const [payload, setPayload] = useState<ImagePreviewPayload | null>(() =>
    searchParams.session ? consumeImagePreviewSession(searchParams.session) : null
  )
  const [isPanning, setIsPanning] = useState(false)
  const [metrics, setMetrics] = useState<ImageMetrics>(EMPTY_METRICS)
  const [panOffset, setPanOffset] = useState<ImagePanOffset>(DEFAULT_PAN_OFFSET)
  const [zoomScale, setZoomScale] = useState(1)
  const [resourceState, setResourceState] = useState<ImageResourceState>({
    blob: null,
    error: null,
    isLoading: false,
    objectUrl: null
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      unlisten = await listen<ImagePreviewPayload>("image-preview:show", event => {
        setPayload(event.payload)
      })
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [])

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        void getCurrentWindow().close()
      }
    }

    window.addEventListener("contextmenu", handleContextMenu)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  useEffect(() => {
    void getCurrentWindow().setTitle(payload?.filename || tChat("imagePreview.windowTitle"))
  }, [payload, tChat])

  useEffect(() => {
    if (!payload) {
      dragStateRef.current = null
      setIsPanning(false)
      setPanOffset(DEFAULT_PAN_OFFSET)
      setZoomScale(1)
      setMetrics(EMPTY_METRICS)
      setResourceState({
        blob: null,
        error: null,
        isLoading: false,
        objectUrl: null
      })
      return
    }

    const controller = new AbortController()
    let nextObjectUrl: string | null = null

    dragStateRef.current = null
    setIsPanning(false)
    setPanOffset(DEFAULT_PAN_OFFSET)
    setZoomScale(1)
    setMetrics(EMPTY_METRICS)
    setResourceState(current => ({
      ...current,
      blob: null,
      error: null,
      isLoading: true,
      objectUrl: null
    }))

    const loadResource = async () => {
      try {
        const response = await fetch(payload.resourceUrl, {
          signal: controller.signal
        })
        if (!response.ok) {
          throw new Error(tChat("imagePreview.errors.load"))
        }

        const blob = await response.blob()
        nextObjectUrl = URL.createObjectURL(blob)

        setMetrics(current => ({
          ...current,
          fileSize: blob.size,
          mimeType: blob.type || response.headers.get("content-type")
        }))
        setResourceState({
          blob,
          error: null,
          isLoading: false,
          objectUrl: nextObjectUrl
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setResourceState({
          blob: null,
          error: error instanceof Error ? error.message : tChat("imagePreview.errors.load"),
          isLoading: false,
          objectUrl: null
        })
      }
    }

    void loadResource()

    return () => {
      controller.abort()
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl)
      }
    }
  }, [payload, tChat])

  const revealLabel = tChat("imagePreview.actions.reveal")
  const saveLabel = tChat("imagePreview.actions.save")
  const copyLabel = tChat("imagePreview.actions.copy")
  const infoLabel = tChat("imagePreview.actions.info")
  const notAvailableText = tChat("imagePreview.info.notAvailable")

  const infoRows = useMemo(
    () =>
      payload
        ? [
            {
              label: tChat("imagePreview.info.fileName"),
              value: payload.filename
            },
            {
              label: tChat("imagePreview.info.source"),
              value:
                payload.kind === "local"
                  ? tChat("imagePreview.info.sourceLocal")
                  : tChat("imagePreview.info.sourceRemote")
            },
            {
              label: tChat("imagePreview.info.resolution"),
              value: formatResolution(metrics, notAvailableText)
            },
            {
              label: tChat("imagePreview.info.fileSize"),
              value: formatFileSize(metrics.fileSize, notAvailableText)
            },
            {
              label: tChat("imagePreview.info.mimeType"),
              value: metrics.mimeType || notAvailableText
            },
            {
              label:
                payload.kind === "local"
                  ? tChat("imagePreview.info.localPath")
                  : tChat("imagePreview.info.url"),
              value:
                payload.kind === "local"
                  ? (payload.localPath ?? notAvailableText)
                  : payload.originalUrl
            }
          ]
        : [],
    [metrics, notAvailableText, payload, tChat]
  )

  const handleCopy = useCallback(async () => {
    if (!resourceState.blob) {
      return
    }

    try {
      await copyImageBlobToClipboard(resourceState.blob, imageRef.current)
      toast.success(tChat("imagePreview.toast.copySuccess"))
    } catch (error) {
      toast.error(tCommon("toast.error"), {
        description: error instanceof Error ? error.message : tChat("imagePreview.toast.copyError")
      })
    }
  }, [resourceState.blob, tChat, tCommon])

  const handleSave = useCallback(async () => {
    if (!payload || !resourceState.blob) {
      return
    }

    try {
      const filePath = await save({
        defaultPath: payload.filename
      })

      if (!filePath || Array.isArray(filePath)) {
        return
      }

      const bytes = new Uint8Array(await resourceState.blob.arrayBuffer())
      await writeFile(filePath, bytes)
      toast.success(tChat("imagePreview.toast.saveSuccess"))
    } catch (error) {
      toast.error(tCommon("toast.error"), {
        description: error instanceof Error ? error.message : tChat("imagePreview.toast.saveError")
      })
    }
  }, [payload, resourceState.blob, tChat, tCommon])

  const handleReveal = useCallback(async () => {
    if (!payload?.localPath) {
      return
    }

    try {
      await revealItemInDir(payload.localPath)
    } catch (error) {
      toast.error(tCommon("toast.error"), {
        description:
          error instanceof Error ? error.message : tChat("imagePreview.toast.revealError")
      })
    }
  }, [payload?.localPath, tChat, tCommon])

  const endImagePan = useCallback(() => {
    dragStateRef.current = null
    setIsPanning(false)
  }, [])

  const handleImageWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!imageRef.current || !viewportRef.current) {
        return
      }

      event.preventDefault()

      const viewportRect = viewportRef.current.getBoundingClientRect()
      const imageRect = imageRef.current.getBoundingClientRect()
      if (!imageRect.width || !imageRect.height || !viewportRect.width || !viewportRect.height) {
        return
      }

      const currentScale = zoomScale
      const nextScale = clampZoomScale(
        currentScale * Math.exp(-event.deltaY * IMAGE_ZOOM_SENSITIVITY)
      )
      if (nextScale === currentScale) {
        return
      }

      const baseWidth = imageRect.width / currentScale
      const baseHeight = imageRect.height / currentScale
      const pointerX = event.clientX - viewportRect.left - viewportRect.width / 2
      const pointerY = event.clientY - viewportRect.top - viewportRect.height / 2
      const scaleRatio = nextScale / currentScale

      const nextPanOffset = clampPanOffset({
        baseHeight,
        baseWidth,
        scale: nextScale,
        viewportHeight: viewportRect.height,
        viewportWidth: viewportRect.width,
        x: pointerX - (pointerX - panOffset.x) * scaleRatio,
        y: pointerY - (pointerY - panOffset.y) * scaleRatio
      })

      setPanOffset(nextPanOffset)
      setZoomScale(nextScale)
    },
    [panOffset.x, panOffset.y, zoomScale]
  )

  const handleImagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLImageElement>) => {
      if (zoomScale <= 1) {
        return
      }

      event.preventDefault()
      dragStateRef.current = {
        originX: panOffset.x,
        originY: panOffset.y,
        pointerId: event.pointerId,
        scale: zoomScale,
        startX: event.clientX,
        startY: event.clientY
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsPanning(true)
    },
    [panOffset.x, panOffset.y, zoomScale]
  )

  const handleImagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLImageElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      if (!imageRef.current || !viewportRef.current) {
        endImagePan()
        return
      }

      event.preventDefault()

      const viewportRect = viewportRef.current.getBoundingClientRect()
      const imageRect = imageRef.current.getBoundingClientRect()
      if (!imageRect.width || !imageRect.height || !viewportRect.width || !viewportRect.height) {
        return
      }

      const baseWidth = imageRect.width / dragState.scale
      const baseHeight = imageRect.height / dragState.scale
      const nextPanOffset = clampPanOffset({
        baseHeight,
        baseWidth,
        scale: dragState.scale,
        viewportHeight: viewportRect.height,
        viewportWidth: viewportRect.width,
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY)
      })

      setPanOffset(nextPanOffset)
    },
    [endImagePan]
  )

  const handleImagePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLImageElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      endImagePan()
    },
    [endImagePan]
  )

  const handleImagePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLImageElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      endImagePan()
    },
    [endImagePan]
  )

  const handleImageLostPointerCapture = useCallback(() => {
    endImagePan()
  }, [endImagePan])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="relative shrink-0 bg-background px-4">
        <div
          data-tauri-drag-region
          className="relative flex h-10 items-center justify-end pl-12 sm:pl-18"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full select-none items-center justify-center px-24 sm:px-36">
            <p className="z-100 truncate select-none text-center text-sm font-medium text-foreground">
              {payload?.filename || tChat("imagePreview.empty.title")}
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <ActionButton
              label={copyLabel}
              disabled={!resourceState.blob}
              onClick={() => {
                void handleCopy()
              }}
            >
              <CopyIcon className="size-4" />
            </ActionButton>

            <ActionButton
              label={saveLabel}
              disabled={!resourceState.blob}
              onClick={() => {
                void handleSave()
              }}
            >
              <DownloadIcon className="size-4" />
            </ActionButton>

            <HoverCard closeDelay={120} openDelay={120}>
              <HoverCardTrigger asChild>
                <div>
                  <ActionButton label={infoLabel} disabled={!payload}>
                    <InfoIcon className="size-4" />
                  </ActionButton>
                </div>
              </HoverCardTrigger>
              <HoverCardContent
                align="end"
                className="w-80 space-y-3 border bg-popover p-4 text-popover-foreground shadow-lg"
              >
                <div>
                  <p className="text-sm font-medium text-popover-foreground">
                    {tChat("imagePreview.info.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tChat("imagePreview.info.description")}
                  </p>
                </div>
                <Separator />
                <div className="space-y-2">
                  {infoRows.map(row => (
                    <div className="space-y-1" key={row.label}>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {row.label}
                      </p>
                      <p className="break-all text-sm leading-5 text-popover-foreground">
                        {row.value}
                      </p>
                    </div>
                  ))}
                </div>
              </HoverCardContent>
            </HoverCard>

            {payload?.localPath && (
              <ActionButton
                label={revealLabel}
                onClick={() => {
                  void handleReveal()
                }}
              >
                <FolderSearchIcon className="size-4" />
              </ActionButton>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div
          ref={viewportRef}
          className="relative flex h-full items-center justify-center overflow-hidden bg-muted/30"
          onWheel={handleImageWheel}
        >
          <div data-tauri-drag-region className="absolute inset-0 z-0" />
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-0 z-0",
              "bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.42)_0%,transparent_58%)]",
              "dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0%,transparent_58%)]"
            )}
          />
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-0 z-0 opacity-[0.1]",
              "bg-[linear-gradient(45deg,rgba(255,255,255,0.18)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.18)_75%,rgba(255,255,255,0.18)),linear-gradient(45deg,rgba(0,0,0,0.04)_25%,transparent_25%,transparent_75%,rgba(0,0,0,0.04)_75%,rgba(0,0,0,0.04))]",
              "bg-position-[0_0,16px_16px] bg-size-[32px_32px]"
            )}
          />

          {!payload && (
            <div className="relative z-10 pointer-events-none px-6 text-center">
              <p className="text-base font-medium text-foreground">
                {tChat("imagePreview.empty.title")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {tChat("imagePreview.empty.description")}
              </p>
            </div>
          )}

          {payload && resourceState.isLoading && (
            <div className="relative z-10 pointer-events-none flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <LoaderCircleIcon className="size-4 animate-spin" />
              <span>{tChat("imagePreview.loading")}</span>
            </div>
          )}

          {payload && resourceState.error && !resourceState.isLoading && (
            <div className="relative z-10 pointer-events-none max-w-md px-6 text-center">
              <p className="text-base font-medium text-foreground">
                {tChat("imagePreview.errors.title")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{resourceState.error}</p>
            </div>
          )}

          {payload &&
            resourceState.objectUrl &&
            !resourceState.isLoading &&
            !resourceState.error && (
              <img
                ref={imageRef}
                alt={payload.alt || payload.filename}
                src={resourceState.objectUrl}
                className={cn(
                  "relative z-10 block max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] select-none object-contain",
                  zoomScale > 1 ? "cursor-grab" : "cursor-default",
                  isPanning && "cursor-grabbing",
                  isPanning ? "transition-none" : "transition-transform duration-100 ease-out",
                  "will-change-transform",
                  "sm:max-h-[calc(100%-3rem)] sm:max-w-[calc(100%-3rem)]"
                )}
                draggable={false}
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                  transformOrigin: "center center"
                }}
                onContextMenu={event => {
                  event.preventDefault()
                }}
                onLostPointerCapture={handleImageLostPointerCapture}
                onLoad={event => {
                  const { naturalHeight, naturalWidth } = event.currentTarget
                  setMetrics(current => ({
                    ...current,
                    height: naturalHeight,
                    width: naturalWidth
                  }))
                }}
                onPointerCancel={handleImagePointerCancel}
                onPointerDown={handleImagePointerDown}
                onPointerMove={handleImagePointerMove}
                onPointerUp={handleImagePointerUp}
              />
            )}
        </div>
      </main>
    </div>
  )
}
