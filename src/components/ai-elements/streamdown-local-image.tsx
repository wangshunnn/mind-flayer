import type { ComponentProps } from "react"
import { memo, useMemo, useState } from "react"
import type { StreamdownProps } from "streamdown"
import { defaultRehypePlugins } from "streamdown"
import { getOriginalLocalImagePathFromProxyUrl, resolveLocalImageUrl } from "@/lib/local-image-url"
import { cn } from "@/lib/utils"

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
    const resolvedSource = useMemo(
      () =>
        resolveLocalImageUrl(source, localImageProxyOrigin, {
          cacheBustKey: localImageCacheBustKey
        }),
      [source, localImageProxyOrigin, localImageCacheBustKey]
    )
    const fallbackText = useMemo(
      () => getOriginalLocalImagePathFromProxyUrl(source) ?? (source || resolvedSource),
      [source, resolvedSource]
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
      <img
        {...props}
        alt={props.alt || source || ""}
        className={className}
        src={resolvedSource}
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
