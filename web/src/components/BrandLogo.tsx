import clsx from 'clsx'
import logoUrl from '@/assets/brand/logo.png'

type BrandLogoProps = {
  size?: number
  alt?: string
  className?: string
}

export default function BrandLogo({ size = 24, alt = 'VentoOS logo', className }: BrandLogoProps) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={clsx('vos-brand-logo', className)}
      draggable={false}
    />
  )
}
