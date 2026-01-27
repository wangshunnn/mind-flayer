interface GeminiIconProps {
  className?: string
}

export function GeminiIcon({ className }: GeminiIconProps) {
  return <img src="/provider-logos/gemini-color.svg" alt="Gemini" className={className} />
}
