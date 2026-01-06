import { useEffect, useState } from "react"

/**
 * Custom hook to manage tooltip visibility when used together with dropdown menus.
 * Automatically handles tooltip state transitions when dropdown opens/closes.
 *
 * @param isDropdownOpen - Current open state of the dropdown
 * @param closeDelay - Delay in milliseconds before resetting tooltip state (default: 200)
 * @returns Tuple containing tooltip open state and setter function
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false)
 * const [openTooltip, setOpenTooltip] = useDropdownTooltip(open)
 *
 * <Tooltip open={openTooltip}>
 *   <DropdownMenu open={open} onOpenChange={setOpen}>
 *     ...
 *   </DropdownMenu>
 * </Tooltip>
 * ```
 */
export function useDropdownTooltip(
  isDropdownOpen: boolean,
  closeDelay = 200
): [boolean | undefined, React.Dispatch<React.SetStateAction<boolean | undefined>>] {
  const [openTooltip, setOpenTooltip] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!isDropdownOpen) {
      setOpenTooltip(false)
      setTimeout(() => setOpenTooltip(undefined), closeDelay)
    }
  }, [isDropdownOpen, closeDelay])

  return [openTooltip, setOpenTooltip]
}
