import type { ComponentProps } from "react"
import { memo, useMemo, useState } from "react"
import type { StreamdownProps } from "streamdown"
import { defaultRehypePlugins } from "streamdown"
import { buildImagePreviewPayload } from "@/lib/image-preview"
import { getOriginalLocalImagePathFromProxyUrl, resolveLocalImageUrl } from "@/lib/local-image-url"
import { cn } from "@/lib/utils"
import { openImagePreviewWindow } from "@/lib/window-manager"

type SanitizeSchema = {
  protocols?: Record<string, string[] | undefined>
}

type SanitizePluginTuple = [unknown, SanitizeSchema]

const defaultRehypePluginList = Object.values(defaultRehypePlugins)

type MarkdownAstNode = {
  type?: string
  url?: string
  value?: string
  children?: MarkdownAstNode[]
}

function rewriteImgSrcInHtmlTag(
  htmlTag: string,
  localImageProxyOrigin: string,
  localImageCacheBustKey?: string
): string {
  return htmlTag.replace(
    /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
    (fullMatch, doubleQuotedSrc, singleQuotedSrc, unquotedSrc) => {
      const originalSrc = (doubleQuotedSrc ?? singleQuotedSrc ?? unquotedSrc ?? "") as string
      const rewrittenSrc = resolveLocalImageUrl(originalSrc, localImageProxyOrigin, {
        cacheBustKey: localImageCacheBustKey
      })

      if (doubleQuotedSrc !== undefined) {
        return `src="${rewrittenSrc}"`
      }
      if (singleQuotedSrc !== undefined) {
        return `src='${rewrittenSrc}'`
      }
      if (unquotedSrc !== undefined) {
        return `src=${rewrittenSrc}`
      }
      return fullMatch
    }
  )
}

function rewriteLocalImageSrcInHtml(
  html: string,
  localImageProxyOrigin: string,
  localImageCacheBustKey?: string
): string {
  return html.replace(/<img\b[^>]*>/gi, fullTag =>
    rewriteImgSrcInHtmlTag(fullTag, localImageProxyOrigin, localImageCacheBustKey)
  )
}

function visitMarkdownAst(node: MarkdownAstNode, visitor: (node: MarkdownAstNode) => void): void {
  visitor(node)

  if (!Array.isArray(node.children)) {
    return
  }

  for (const child of node.children) {
    visitMarkdownAst(child, visitor)
  }
}

export function createRewriteLocalImageRemarkPlugin(
  localImageProxyOrigin?: string,
  localImageCacheBustKey?: string
) {
  return () => (tree: MarkdownAstNode) => {
    if (!localImageProxyOrigin) {
      return
    }

    visitMarkdownAst(tree, node => {
      if (node.type === "image" && typeof node.url === "string") {
        node.url = resolveLocalImageUrl(node.url, localImageProxyOrigin, {
          cacheBustKey: localImageCacheBustKey
        })
        return
      }

      if (node.type === "html" && typeof node.value === "string") {
        node.value = rewriteLocalImageSrcInHtml(
          node.value,
          localImageProxyOrigin,
          localImageCacheBustKey
        )
      }
    })
  }
}

function createRehypePluginsWithFileImageSrc(): NonNullable<StreamdownProps["rehypePlugins"]> {
  const sanitizePlugin = defaultRehypePlugins.sanitize

  if (!Array.isArray(sanitizePlugin) || sanitizePlugin.length < 2) {
    return defaultRehypePluginList
  }

  const [sanitizeTransformer, sanitizeSchemaRaw] = sanitizePlugin as SanitizePluginTuple
  const sanitizeSchema = sanitizeSchemaRaw ?? {}
  const currentSrcProtocols = sanitizeSchema.protocols?.src ?? []
  const nextSrcProtocols = currentSrcProtocols.includes("file")
    ? currentSrcProtocols
    : [...currentSrcProtocols, "file"]

  return [
    defaultRehypePlugins.raw,
    [
      sanitizeTransformer,
      {
        ...sanitizeSchema,
        protocols: {
          ...sanitizeSchema.protocols,
          src: nextSrcProtocols
        }
      }
    ],
    defaultRehypePlugins.harden
  ] as NonNullable<StreamdownProps["rehypePlugins"]>
}

export const streamdownRehypePluginsWithLocalImageSrc = createRehypePluginsWithFileImageSrc()

type StreamdownLocalImageProps = ComponentProps<"img"> & {
  localImageProxyOrigin?: string
  localImageCacheBustKey?: string
}

type PreviewableImageProps = ComponentProps<"img"> & {
  displaySource: string
  localImageProxyOrigin?: string
  originalSource: string
}

const MESSAGE_IMAGE_WRAPPER_CLASSNAME =
  "block w-fit max-w-full bg-transparent p-0 text-left sm:max-w-[32rem]"
const MESSAGE_IMAGE_CLASSNAME =
  "block h-auto w-auto max-w-full max-h-[28rem] rounded-xl object-contain"

const PreviewableImage = memo(
  ({
    alt,
    className,
    displaySource,
    localImageProxyOrigin,
    originalSource,
    ...props
  }: PreviewableImageProps) => {
    const previewPayload = useMemo(
      () => buildImagePreviewPayload(originalSource, alt || "", localImageProxyOrigin),
      [alt, localImageProxyOrigin, originalSource]
    )

    if (!previewPayload) {
      return (
        <img
          {...props}
          alt={alt}
          className={cn(className, MESSAGE_IMAGE_CLASSNAME)}
          src={displaySource}
          onContextMenu={event => {
            props.onContextMenu?.(event)
          }}
        />
      )
    }

    return (
      <button
        type="button"
        className={cn(
          MESSAGE_IMAGE_WRAPPER_CLASSNAME,
          "cursor-zoom-in",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
        onClick={() => {
          void openImagePreviewWindow(previewPayload)
        }}
        onContextMenu={event => {
          event.preventDefault()
        }}
      >
        <img
          {...props}
          alt={alt}
          className={cn(className, MESSAGE_IMAGE_CLASSNAME)}
          src={displaySource}
        />
      </button>
    )
  }
)

PreviewableImage.displayName = "PreviewableImage"

const StreamdownLocalImage = memo(
  ({
    src,
    className,
    onError,
    onLoad,
    localImageProxyOrigin,
    localImageCacheBustKey,
    ...props
  }: StreamdownLocalImageProps) => {
    const source = typeof src === "string" ? src : ""
    const previewPayload = useMemo(
      () => buildImagePreviewPayload(source, props.alt || "", localImageProxyOrigin),
      [source, props.alt, localImageProxyOrigin]
    )
    const resolvedSource = useMemo(() => {
      if (previewPayload?.kind === "local") {
        return resolveLocalImageUrl(previewPayload.originalUrl, localImageProxyOrigin, {
          cacheBustKey: localImageCacheBustKey
        })
      }

      if (previewPayload) {
        return previewPayload.resourceUrl
      }

      return resolveLocalImageUrl(source, localImageProxyOrigin, {
        cacheBustKey: localImageCacheBustKey
      })
    }, [source, previewPayload, localImageProxyOrigin, localImageCacheBustKey])
    const fallbackText = useMemo(
      () =>
        previewPayload?.localPath ??
        previewPayload?.originalUrl ??
        getOriginalLocalImagePathFromProxyUrl(source) ??
        (source || resolvedSource),
      [previewPayload, source, resolvedSource]
    )
    const [failedSource, setFailedSource] = useState<string | null>(null)
    const hasLoadError = failedSource === resolvedSource

    if (!resolvedSource) {
      return null
    }

    if (hasLoadError) {
      return (
        <a
          className={cn(
            "break-all text-muted-foreground decoration-dotted underline underline-offset-4",
            className
          )}
          href={resolvedSource}
          rel="noopener noreferrer"
          target="_blank"
        >
          {fallbackText}
        </a>
      )
    }

    return (
      <PreviewableImage
        {...props}
        alt={props.alt || previewPayload?.filename || source || ""}
        className={className}
        displaySource={resolvedSource}
        localImageProxyOrigin={localImageProxyOrigin}
        originalSource={source}
        onError={event => {
          setFailedSource(resolvedSource)
          onError?.(event)
        }}
        onLoad={event => {
          setFailedSource(current => (current === resolvedSource ? null : current))
          onLoad?.(event)
        }}
      />
    )
  }
)

StreamdownLocalImage.displayName = "StreamdownLocalImage"

type StreamdownImageComponentProps = ComponentProps<"img"> & {
  node?: unknown
}

export function createStreamdownComponentsWithLocalImage(
  components: StreamdownProps["components"] | undefined,
  localImageProxyOrigin?: string,
  localImageCacheBustKey?: string
): NonNullable<StreamdownProps["components"]> {
  return {
    ...(components ?? {}),
    img: ({ node: _node, ...imageProps }: StreamdownImageComponentProps) => (
      <StreamdownLocalImage
        {...imageProps}
        localImageProxyOrigin={localImageProxyOrigin}
        localImageCacheBustKey={localImageCacheBustKey}
      />
    )
  }
}
