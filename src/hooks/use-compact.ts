import * as React from "react"

const COMPACT_BREAKPOINT = 600

export function useIsCompact() {
  const [isCompact, setIsCompact] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsCompact(window.innerWidth < COMPACT_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsCompact(window.innerWidth < COMPACT_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isCompact
}
