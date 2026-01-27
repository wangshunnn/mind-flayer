interface KimiIconProps {
  className?: string
}

export function KimiIcon({ className }: KimiIconProps) {
  return <img src="/provider-logos/kimi-color.svg" alt="Kimi" className={className} />
}
