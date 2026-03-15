import { useCallback, useEffect, useId, useRef } from "react"

export function useAutofocusSelectedDropdownItem(open: boolean, selectedValue?: string | null) {
  const scopeId = useId().replace(/:/g, "")
  const frameIdRef = useRef<number | null>(null)

  const focusSelectedItem = useCallback(() => {
    if (!selectedValue) {
      return
    }

    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current)
    }

    frameIdRef.current = requestAnimationFrame(() => {
      frameIdRef.current = null

      const selectedItem = document.querySelector<HTMLElement>(
        `[data-autofocus-scope="${scopeId}"][data-item-value="${selectedValue}"]`
      )

      if (!selectedItem || selectedItem === document.activeElement) {
        return
      }

      selectedItem.focus()
    })
  }, [scopeId, selectedValue])

  useEffect(() => {
    if (!open || !selectedValue) {
      return
    }

    focusSelectedItem()

    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current)
        frameIdRef.current = null
      }
    }
  }, [focusSelectedItem, open, selectedValue])

  return { scopeId, focusSelectedItem }
}
