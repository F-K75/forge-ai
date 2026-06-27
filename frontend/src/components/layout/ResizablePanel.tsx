import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react'
import clsx from 'clsx'

interface ResizablePanelProps {
  children: ReactNode
  defaultSize: number
  minSize: number
  maxSize: number
  side: 'left' | 'right'
  className?: string
}

export function ResizablePanel({ children, defaultSize, minSize, maxSize, side, className }: ResizablePanelProps) {
  const [size, setSize] = useState(defaultSize)
  const [collapsed, setCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty(side === 'left' ? '--panel-width' : '--panel-width', `${collapsed ? 72 : size}px`)
    }
  }, [collapsed, size, side])

  const style = useMemo(() => ({
    width: collapsed ? 72 : size,
  }), [collapsed, size])

  return (
    <div ref={containerRef} className={clsx('relative flex-shrink-0 border-r border-forge-border/80 bg-forge-surface/80', className)} style={style}>
      <button
        type="button"
        onClick={() => setCollapsed(value => !value)}
        className="absolute right-2 top-3 z-10 rounded-full border border-forge-border bg-forge-bg/80 p-1.5 text-forge-text-secondary transition hover:text-forge-text"
      >
        {collapsed ? (side === 'left' ? <PanelRightOpen size={14} /> : <PanelLeftOpen size={14} />) : (side === 'left' ? <PanelLeftOpen size={14} /> : <PanelRightOpen size={14} />)}
      </button>
      <div className={clsx('h-full overflow-hidden', collapsed && 'opacity-0')}>{children}</div>
      {!collapsed && (
        <div
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
          onMouseDown={event => {
            event.preventDefault()
            const startX = event.clientX
            const startSize = size
            const onMove = (moveEvent: MouseEvent) => {
              const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX
              const nextSize = Math.max(minSize, Math.min(maxSize, startSize + delta))
              setSize(nextSize)
            }
            const onUp = () => {
              window.removeEventListener('mousemove', onMove)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
        />
      )}
    </div>
  )
}
