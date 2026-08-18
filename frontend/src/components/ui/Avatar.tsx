import type { HTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type AvatarVariant = 'circle' | 'rounded' | 'square'

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  name?: string
  size?: AvatarSize
  variant?: AvatarVariant
  status?: 'online' | 'away' | 'busy' | 'offline'
  children?: ReactNode
  imgProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl',
}

const variantRadius: Record<AvatarVariant, number> = {
  circle: layout.radiusFull,
  rounded: layout.radiusMd,
  square: layout.radiusSm,
}

const statusColors: Record<string, string> = {
  online: 'bg-ok shadow-[0_0_0_2px_rgb(var(--bg))]',
  away: 'bg-warn shadow-[0_0_0_2px_rgb(var(--bg))]',
  busy: 'bg-error shadow-[0_0_0_2px_rgb(var(--bg))]',
  offline: 'bg-muted shadow-[0_0_0_2px_rgb(var(--bg))]',
}

const statusSizes: Record<AvatarSize, string> = {
  xs: 'h-1.5 w-1.5 -bottom-0.5 -right-0.5',
  sm: 'h-2 w-2 -bottom-0.5 -right-0.5',
  md: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5',
  lg: 'h-3 w-3 -bottom-0.5 -right-0.5',
  xl: 'h-4 w-4 -bottom-1 -right-1',
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function Avatar({
  src,
  alt,
  name,
  size = 'md',
  variant = 'circle',
  status,
  children,
  className,
  imgProps,
  ...rest
}: AvatarProps) {
  const initials = getInitials(name)

  return (
    <div
      className={twMerge(
        clsx(
          'relative inline-flex shrink-0 items-center justify-center overflow-hidden select-none',
          sizeClasses[size],
          className
        )
      )}
      style={{ borderRadius: variantRadius[variant] }}
      role="img"
      aria-label={alt || name || 'Avatar'}
      {...rest}
    >
      {src ? (
        <img
          src={src}
          alt={alt || name || ''}
          className="h-full w-full object-cover"
          {...imgProps}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-accent/15 text-accent font-medium">
          {children || initials}
        </span>
      )}
      {status && (
        <span
          className={clsx(
            'absolute rounded-full border-2 border-[rgb(var(--bg))]',
            statusColors[status],
            statusSizes[size]
          )}
          aria-label={status}
        />
      )}
    </div>
  )
}
