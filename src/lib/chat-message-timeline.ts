export const CHAT_MESSAGE_TIMELINE_SCROLL_TOLERANCE = 8

interface ActiveTimelineAnchorIndexOptions {
  maxScrollTop?: number
  tolerance?: number
  viewportHeight?: number
}

function lastIndexAtOrBefore(offsets: number[], target: number): number {
  let low = 0
  let high = offsets.length

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (offsets[middle] <= target) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low - 1
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
  const activeIndex = lastIndexAtOrBefore(anchorOffsets, targetTop)

  if (viewportHeight === undefined || maxScrollTop === undefined) {
    return activeIndex
  }

  const isAtBottom = maxScrollTop <= tolerance || scrollTop >= maxScrollTop - tolerance
  if (!isAtBottom) {
    return activeIndex
  }

  const viewportBottom = scrollTop + viewportHeight - tolerance
  const lastVisibleIndex = lastIndexAtOrBefore(anchorOffsets, viewportBottom)

  if (lastVisibleIndex > activeIndex) {
    return lastVisibleIndex
  }

  return activeIndex
}
