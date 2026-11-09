import type { ElementType, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { fontScale, typeScale } from '../../lib/designTokens'

export type HeadingLevel =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'bodyLg'
  | 'body'
  | 'caption'
  | 'label'
  | 'section'

interface HeadingProps {
  level?: HeadingLevel
  className?: string
  children: ReactNode
  as?: ElementType
}

const elementFor: Record<HeadingLevel, ElementType> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  bodyLg: 'p',
  body: 'p',
  caption: 'span',
  label: 'p',
  section: 'h2',
}

const toneFor: Record<HeadingLevel, string> = {
  display: 'font-display text-ink',
  h1: 'font-display text-ink',
  h2: 'font-display text-ink',
  h3: 'font-display text-ink',
  h4: 'font-display text-ink font-semibold',
  h5: 'font-display text-ink font-semibold',
  h6: 'font-display text-ink font-semibold',
  bodyLg: 'text-ink',
  body: 'text-muted',
  caption: 'text-muted text-xs tracking-normal',
  label: 'font-medium uppercase tracking-widest text-muted',
  section: 'font-display text-ink',
}

export function Heading({ level = 'body', className, children, as }: HeadingProps) {
  const Tag = as || elementFor[level]
  const t = fontScale[level] || typeScale[level]
  return (
    <Tag
      className={twMerge(clsx(toneFor[level], className))}
      style={{
        fontSize: t.size,
        lineHeight: t.lineHeight,
        letterSpacing: `${t.tracking}em`,
        fontWeight: t.weight,
      }}
    >
      {children}
    </Tag>
  )
}
