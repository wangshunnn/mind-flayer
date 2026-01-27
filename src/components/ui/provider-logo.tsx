import { ALL_PROVIDERS } from "@/lib/provider-constants"

interface ProviderLogoProps {
  providerId: string
  className?: string
}

export function ProviderLogo({ providerId, className }: ProviderLogoProps) {
  const provider = ALL_PROVIDERS.find(p => p.id === providerId)

  if (!provider) {
    return null
  }

  const { logo: Logo, icon: Icon } = provider

  // Use logo component if available, otherwise fallback to icon
  if (Logo) {
    return <Logo className={className} />
  }

  return <Icon className={className} />
}
