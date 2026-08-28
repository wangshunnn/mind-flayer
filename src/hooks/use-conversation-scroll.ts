import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import {
  didConversationReaderMove,
  getConversationDistanceFromBottom,
  getConversationScrollFloor,
  getExpectedConversationScrollTop,
  isConversationAtBottom
} from "@/lib/conversation-scroll"

const SCROLL_TO_BOTTOM_DURATION_MS = 260

export type ConversationScrollBehavior = "instant" | "smooth"

export interface ConversationScrollController {
  scrollRef: MutableRefObject<HTMLDivElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
  isAtBottom: boolean
  getDistanceFromBottom: () => number
  addLayoutListener: (listener: () => void) => () => void
  reset: () => void
  scrollToBottom: (behavior?: ConversationScrollBehavior) => void
  stopFollowing: () => void
}

function shouldReduceMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

export function useConversationScroll(
  resetKey?: string | number | null
): ConversationScrollController {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const followingRef = useRef(true)
  const observedTopRef = useRef(0)
  const distanceFromBottomRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const layoutListenersRef = useRef<Set<() => void>>(new Set())
  const [isAtBottom, setIsAtBottom] = useState(true)

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current === null) {
      return
    }
    cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
  }, [])

  const publishFollowing = useCallback((following: boolean) => {
    followingRef.current = following
    setIsAtBottom(current => (current === following ? current : following))
  }, [])

  const readDistanceFromBottom = useCallback(() => {
    const element = scrollRef.current
    if (!element) {
      return distanceFromBottomRef.current
    }
    return getConversationDistanceFromBottom(
      element.scrollTop,
      element.scrollHeight,
      element.clientHeight
    )
  }, [])

  const writeDistanceFromBottom = useCallback((distanceFromBottom: number) => {
    const element = scrollRef.current
    if (!element) {
      return
    }
    const floor = getConversationScrollFloor(element.scrollHeight, element.clientHeight)
    element.scrollTop = Math.max(0, floor - Math.max(0, distanceFromBottom))
    observedTopRef.current = element.scrollTop
    distanceFromBottomRef.current = getConversationDistanceFromBottom(
      element.scrollTop,
      element.scrollHeight,
      element.clientHeight
    )
  }, [])

  const reset = useCallback(() => {
    cancelAnimation()
    publishFollowing(true)
    writeDistanceFromBottom(0)
  }, [cancelAnimation, publishFollowing, writeDistanceFromBottom])

  const stopFollowing = useCallback(() => {
    cancelAnimation()
    const element = scrollRef.current
    if (element) {
      observedTopRef.current = element.scrollTop
      distanceFromBottomRef.current = getConversationDistanceFromBottom(
        element.scrollTop,
        element.scrollHeight,
        element.clientHeight
      )
    }
    publishFollowing(false)
  }, [cancelAnimation, publishFollowing])

  const scrollToBottom = useCallback(
    (behavior: ConversationScrollBehavior = "smooth") => {
      cancelAnimation()
      publishFollowing(true)

      const startDistance = readDistanceFromBottom()
      if (behavior === "instant" || isConversationAtBottom(startDistance) || shouldReduceMotion()) {
        writeDistanceFromBottom(0)
        return
      }

      const startedAt = performance.now()
      const tick = (now: number) => {
        if (!followingRef.current) {
          animationFrameRef.current = null
          return
        }

        const progress = Math.min(1, (now - startedAt) / SCROLL_TO_BOTTOM_DURATION_MS)
        const eased = 1 - (1 - progress) ** 3
        writeDistanceFromBottom(startDistance * (1 - eased))

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(tick)
          return
        }

        writeDistanceFromBottom(0)
        animationFrameRef.current = null
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    },
    [cancelAnimation, publishFollowing, readDistanceFromBottom, writeDistanceFromBottom]
  )

  const addLayoutListener = useCallback((listener: () => void) => {
    layoutListenersRef.current.add(listener)
    return () => {
      layoutListenersRef.current.delete(listener)
    }
  }, [])

  useLayoutEffect(() => {
    const element = scrollRef.current
    const contentElement = contentRef.current
    if (!element || !contentElement) {
      return
    }

    const handleScroll = () => {
      const floor = getConversationScrollFloor(element.scrollHeight, element.clientHeight)
      const movedByReader = didConversationReaderMove({
        scrollTop: element.scrollTop,
        observedTop: observedTopRef.current,
        floor
      })
      const distanceFromBottom = getConversationDistanceFromBottom(
        element.scrollTop,
        element.scrollHeight,
        element.clientHeight
      )

      distanceFromBottomRef.current = distanceFromBottom
      if (movedByReader) {
        cancelAnimation()
        publishFollowing(isConversationAtBottom(distanceFromBottom))
      }
      observedTopRef.current = element.scrollTop
    }

    const handleLayout = () => {
      const floor = getConversationScrollFloor(element.scrollHeight, element.clientHeight)
      if (followingRef.current) {
        writeDistanceFromBottom(0)
      } else {
        observedTopRef.current = getExpectedConversationScrollTop(observedTopRef.current, floor)
        distanceFromBottomRef.current = getConversationDistanceFromBottom(
          element.scrollTop,
          element.scrollHeight,
          element.clientHeight
        )
      }

      for (const listener of layoutListenersRef.current) {
        listener()
      }
    }

    element.addEventListener("scroll", handleScroll, { passive: true })
    const observer = new ResizeObserver(handleLayout)
    observer.observe(element)
    observer.observe(contentElement)
    handleLayout()

    return () => {
      element.removeEventListener("scroll", handleScroll)
      observer.disconnect()
    }
  }, [cancelAnimation, publishFollowing, writeDistanceFromBottom])

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is an explicit imperative reset signal.
  useLayoutEffect(() => {
    reset()
  }, [reset, resetKey])

  useEffect(
    () => () => {
      cancelAnimation()
      layoutListenersRef.current.clear()
    },
    [cancelAnimation]
  )

  return useMemo(
    () => ({
      scrollRef,
      contentRef,
      isAtBottom,
      getDistanceFromBottom: readDistanceFromBottom,
      addLayoutListener,
      reset,
      scrollToBottom,
      stopFollowing
    }),
    [addLayoutListener, isAtBottom, readDistanceFromBottom, reset, scrollToBottom, stopFollowing]
  )
}
