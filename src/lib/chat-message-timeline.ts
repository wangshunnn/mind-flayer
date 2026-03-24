export const CHAT_MESSAGE_TIMELINE_SCROLL_TOLERANCE = 8

interface ActiveTimelineAnchorIndexOptions {
  maxScrollTop?: number
  tolerance?: number
  viewportHeight?: number
}

export function getActiveTimelineAnchorIndex(
  anchorOffsets: number[],
  scrollTop: number,
  options: ActiveTimelineAnchorIndexOptions = {}
): number {
  if (anchorOffsets.length === 0) {
    return -1
  }

  const {
    maxScrollTop,
    tolerance = CHAT_MESSAGE_TIMELINE_SCROLL_TOLERANCE,
    viewportHeight
  } = options
  const targetTop = scrollTop + tolerance
  let activeIndex = -1

  for (let index = 0; index < anchorOffsets.length; index += 1) {
    if (anchorOffsets[index] <= targetTop) {
      activeIndex = index
      continue
    }

    break
  }

  if (viewportHeight === undefined || maxScrollTop === undefined) {
    return activeIndex
  }

  const isAtBottom = maxScrollTop <= tolerance || scrollTop >= maxScrollTop - tolerance
  if (!isAtBottom) {
    return activeIndex
  }

  const viewportBottom = scrollTop + viewportHeight - tolerance
  let lastVisibleIndex = -1

  for (let index = 0; index < anchorOffsets.length; index += 1) {
    if (anchorOffsets[index] <= viewportBottom) {
      lastVisibleIndex = index
      continue
    }

    break
  }

  if (lastVisibleIndex > activeIndex) {
    return lastVisibleIndex
  }

  return activeIndex
}
