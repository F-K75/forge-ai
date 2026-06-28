import { useEffect, useMemo, useRef, useState, type ReactNode, useCallback } from 'react'
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
      containerRef.current.style.setProperty('--panel-width', `${collapsed ? 72 : size}px`)
    }
  }, [collapsed, size])

  const style = useMemo(() => ({
    width: collapsed ? 72 : size,
  }), [collapsed, size])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setCollapsed(value => !value)
    }
    if (e.key === 'ArrowLeft' && side === 'right' && !collapsed) {
      e.preventDefault()
      setSize(s => Math.max(minSize, s - 10))
    }
    if (e.key === 'ArrowRight' && side === 'left' && !collapsed) {
      e.preventDefault()
      setSize(s => Math.min(maxSize, s + 10))
    }
  }, [collapsed, side, minSize, maxSize])

  const handleResizeMouseDown = useCallback((event: React.MouseEvent) => {
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
  }, [size, side, minSize, maxSize])

  return (
    <div 
      ref={containerRef} 
      className={clsx('relative flex-shrink-0 border-r border-forge-border/80 bg-forge-surface/80', className)} 
      style={style}
      role="region"
      aria-label={`${side === 'left' ? 'Left' : 'Right'} panel`}
      aria-expanded={!collapsed}
    >
      <button
        type="button"
        onClick={() => setCollapsed(value => !value)}
        onKeyDown={handleKeyDown}
        aria-label={collapsed ? `Expand ${side} panel` : `Collapse ${side} panel`}
        aria-expanded={!collapsed}
        className="absolute right-2 top-3 z-10 rounded-full border border-forge-border bg-forge-bg/80 p-1.5 text-forge-text-secondary transition hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        {collapsed ? (side === 'left' ? <PanelRightOpen size={14} aria-hidden="true" /> : <PanelLeftOpen size={14} aria-hidden="true" />) : (side === 'left' ? <PanelLeftOpen size={14} aria-hidden="true" /> : <PanelRightOpen size={14} aria-hidden="true" />)}
      </button>
      <div className={clsx('h-full overflow-hidden', collapsed && 'opacity-0')}>{children}</div>
      {!collapsed && (
        <div
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize focus:outline-none focus:ring-2 focus:ring-violet-500"
          onMouseDown={handleResizeMouseDown}
          onKeyDown={handleKeyDown}
          role="slider"
          aria-label={`Resize ${side} panel`}
          tabIndex={0}
        />
      )}
    </div>
  )
}