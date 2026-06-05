import { type ComponentProps, cloneElement, isValidElement, memo, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type ActivityIconProps = ComponentProps<"span"> & {
  children: ReactNode
}

type ActivityIconElementProps = {
  className?: string
}

export const ActivityIcon = memo(({ className, children, ...props }: ActivityIconProps) => {
  const icon = isValidElement<ActivityIconElementProps>(children)
    ? cloneElement(children, {
        className: cn(children.props.className, "size-3 shrink-0")
      })
    : children

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-3.5 shrink-0 items-center justify-center", className)}
      data-activity-icon="true"
      {...props}
    >
      {icon}
    </span>
  )
})

ActivityIcon.displayName = "ActivityIcon"
