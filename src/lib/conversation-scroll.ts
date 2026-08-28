export const CONVERSATION_BOTTOM_THRESHOLD_PX = 24
export const CONVERSATION_SCROLL_EPSILON_PX = 0.5

export function getConversationScrollFloor(scrollHeight: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight)
}

export function getConversationDistanceFromBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const floor = getConversationScrollFloor(scrollHeight, clientHeight)
  return Math.max(0, floor - scrollTop)
}

export function getExpectedConversationScrollTop(observedTop: number, floor: number): number {
  return Math.max(0, Math.min(observedTop, floor))
}

export function didConversationReaderMove({
  scrollTop,
  observedTop,
  floor,
  epsilon = CONVERSATION_SCROLL_EPSILON_PX
}: {
  scrollTop: number
  observedTop: number
  floor: number
  epsilon?: number
}): boolean {
  const expectedTop = getExpectedConversationScrollTop(observedTop, floor)
  return Math.abs(scrollTop - expectedTop) > epsilon
}

export function isConversationAtBottom(
  distanceFromBottom: number,
  threshold = CONVERSATION_BOTTOM_THRESHOLD_PX
): boolean {
  return distanceFromBottom <= threshold
}
