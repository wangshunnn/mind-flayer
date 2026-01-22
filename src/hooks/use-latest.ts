import { useEffect, useRef } from "react"

/**
 * Returns a ref that always holds the latest value.
 * Useful for accessing current values in callbacks without triggering re-renders.
 *
 * @example
 * ```tsx
 * const latestValue = useLatest(someValue)
 * ```
 * latestValue.current always has the latest value
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}
