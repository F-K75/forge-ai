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
    <div className={twMerge(clsx('w-full overflow-x-auto border-2 border-black bg-white shadow-brutal rounded-sm', className))}>
      <table
        className={twMerge(
          clsx(
            'w-full border-collapse text-left text-sm',
            striped && '[&_tbody>tr:nth-child(even)]:bg-black/[0.03]'
          )
        )}
        {...rest}
      >
        {children}
        {loading && (
          <tbody className="divide-y-2 divide-black/10">
            {Array.from({ length: loadingRows }).map((_, rIdx) => (
              <tr key={rIdx} className="animate-pulse">
                {Array.from({ length: loadingCols }).map((_, cIdx) => (
                  <td key={cIdx} className="px-4 py-3 border-r border-black/10 last:border-r-0">
                    <div className="h-4 bg-neutral-200 rounded-sm w-3/4" />
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
          'border-b-2 border-black bg-brutal-cream',
          sticky && 'sticky top-0 z-10 shadow-[0_1px_0_0_#000000]',
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
          'divide-y-2 divide-black',
          striped && '[&>tr:nth-child(even)]:bg-black/[0.03]',
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
          'transition-colors duration-150',
          selected ? 'bg-brutal-yellow/20 font-semibold' : 'hover:bg-brutal-yellow/10',
          striped && 'even:bg-black/[0.03]',
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
          header ? 'font-bold uppercase tracking-wider text-xs text-black border-r border-black/10 last:border-r-0' : 'text-ink font-medium border-r border-black/10 last:border-r-0',
          className
        )
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
