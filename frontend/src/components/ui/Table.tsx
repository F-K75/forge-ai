import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children?: ReactNode
  striped?: boolean
  loading?: boolean
  loadingRows?: number
  loadingCols?: number
  empty?: boolean
  emptyContent?: ReactNode
}

interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode
  sticky?: boolean
}

interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode
  striped?: boolean
}

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode
  selected?: boolean
  striped?: boolean
}

interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode
  header?: boolean
}

export function Table({
  children,
  striped = false,
  loading = false,
  loadingRows = 4,
  loadingCols = 4,
  empty = false,
  emptyContent,
  className,
  ...rest
}: TableProps) {
  return (
    <div
      className={twMerge(
        clsx('w-full overflow-x-auto rounded-lg border border-border bg-panel', className)
      )}
    >
      <table
        className={twMerge(
          clsx(
            'w-full border-collapse text-left text-sm tabular-nums',
            striped && '[&_tbody>tr:nth-child(even)]:bg-panel-alt/50'
          )
        )}
        {...rest}
      >
        {children}
        {loading && (
          <tbody className="divide-y divide-border">
            {Array.from({ length: loadingRows }).map((_, rIdx) => (
              <tr key={rIdx}>
                {Array.from({ length: loadingCols }).map((_, cIdx) => (
                  <td key={cIdx} className="px-4 py-3">
                    <div className="h-4 w-3/4 rounded bg-panel-alt animate-shimmer" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
        {!loading && empty && emptyContent && (
          <tbody>
            <tr>
              <td colSpan={loadingCols} className="px-6 py-12 text-center text-muted">
                {emptyContent}
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  )
}

export function TableHeader({ children, sticky = true, className, ...rest }: TableHeaderProps) {
  return (
    <thead
      className={twMerge(
        clsx(
          'border-b border-border bg-panel-alt/80',
          sticky && 'sticky top-0 z-10',
          className
        )
      )}
      {...rest}
    >
      {children}
    </thead>
  )
}

export function TableBody({ children, striped = false, className, ...rest }: TableBodyProps) {
  return (
    <tbody
      className={twMerge(
        clsx(
          'divide-y divide-border',
          striped && '[&>tr:nth-child(even)]:bg-panel-alt/50',
          className
        )
      )}
      {...rest}
    >
      {children}
    </tbody>
  )
}

export function TableRow({ children, selected = false, striped = false, className, ...rest }: TableRowProps) {
  return (
    <tr
      className={twMerge(
        clsx(
          'transition-colors duration-fast',
          selected ? 'bg-accent/5' : 'hover:bg-panel-alt/60',
          striped && 'even:bg-panel-alt/40',
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
          header
            ? 'text-xs font-medium text-muted'
            : 'text-ink',
          className
        )
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
