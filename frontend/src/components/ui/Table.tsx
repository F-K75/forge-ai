import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode
}

interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode
}

interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode
}

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode
  selected?: boolean
}

interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode
  header?: boolean
}

export function Table({ children, className, ...rest }: TableProps) {
  return (
    <div className={twMerge(clsx('w-full overflow-x-auto', className))}>
      <table
        className="w-full border-collapse text-left text-sm"
        {...rest}
      >
        {children}
      </table>
    </div>
  )
}

export function TableHeader({ children, className, ...rest }: TableHeaderProps) {
  return (
    <thead className={twMerge(clsx('border-b border-border-soft', className))} {...rest}>
      {children}
    </thead>
  )
}

export function TableBody({ children, className, ...rest }: TableBodyProps) {
  return (
    <tbody className={twMerge(clsx('divide-y divide-border-soft', className))} {...rest}>
      {children}
    </tbody>
  )
}

export function TableRow({ children, selected = false, className, ...rest }: TableRowProps) {
  return (
    <tr
      className={twMerge(
        clsx(
          'transition-colors duration-fast',
          selected ? 'bg-accent/5' : 'hover:bg-inlay',
          className
        )
      )}
      {...rest}
    >
      {children}
    </tr>
  )
}

export function TableCell({ children, header = false, className, ...rest }: TableCellProps) {
  const Tag = header ? 'th' : 'td'
  return (
    <Tag
      className={twMerge(
        clsx(
          'px-4 py-3 text-sm',
          header ? 'font-semibold text-ink' : 'text-ink/80',
          className
        )
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
