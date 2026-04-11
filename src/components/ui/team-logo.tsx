interface TeamLogoProps {
  logoUrl?: string | null
  color?: string | null
  name?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
}

export function TeamLogo({ logoUrl, color, name, size = 'sm', className = '' }: TeamLogoProps) {
  const cls = `${SIZES[size]} rounded-full flex-shrink-0 border border-gray-200 ${className}`
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name ?? ''} className={`${cls} object-cover`} />
  }
  return <span className={cls} style={{ backgroundColor: color ?? '#ccc' }} />
}
