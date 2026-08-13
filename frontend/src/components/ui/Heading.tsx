import type { ElementType, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { fontScale } from '../../lib/designTokens'

export type HeadingLevel = 'display' | 'h1' | 'h2' | 'h3' | 'bodyLg' | 'body' | 'label' | 'section'

interface HeadingProps {
  level?: HeadingLevel
  className?: string
  children: ReactNode
}

const elementFor: Record<HeadingLevel, ElementType> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  bodyLg: 'p',
  body: 'p',
  label: 'p',
  section: 'h2',
}

const toneFor: Record<HeadingLevel, string> = {
  display: 'font-display text-ink',
  h1: 'font-display text-ink',
  h2: 'font-display text-ink',
  h3: 'font-display text-ink',
  bodyLg: 'text-ink',
  body: 'text-muted',
  label: 'font-medium uppercase tracking-widest text-muted',
  section: 'font-display text-ink',
}

/**
 * Heading mapped to the token type scale (font size/weight/tracking from
 * `fontScale`). Level also sets the semantic element.
 */
export function Heading({ level = 'body', className, children }: HeadingProps) {
  const Tag = elementFor[level]
  const t = fontScale[level]
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