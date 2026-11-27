import { useState, useRef, useCallback, useEffect, type ReactNode, type MouseEvent } from 'react'

interface WindowProps {
  appId?: string
  title: string
  children: ReactNode
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
  onClose: () => void
  onFocus: () => void
  onMove: (position: { x: number; y: number }) => void
  onResize: (size: { width: number; height: number }) => void
  onRefreshClick?: () => void  // Optional refresh button callback
  onAdminClick?: () => void  // Optional admin button callback
}

export function Window({
  appId,
  title,
  children,
  position,
  size,
  zIndex,
  onClose,
  onFocus,
  onMove,
  onResize,
  onRefreshClick,
  onAdminClick,
}: WindowProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isHoveringClose, setIsHoveringClose] = useState(false)
  const [isAnimating, setIsAnimating] = useState(true)
  const dragOffset = useRef({ x: 0, y: 0 })
  const windowRef = useRef<HTMLDivElement>(null)

  // Professional window opening animation - from icon to window
  useEffect(() => {
    // Trigger animation on mount
    const timer = setTimeout(() => {
      setIsAnimating(false)
    }, 50) // Small delay to ensure initial state is rendered

    return () => clearTimeout(timer)
  }, [])

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.window-titlebar')) {
      onFocus()
      setIsDragging(true)
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      }

      const handleMouseMove = (e: globalThis.MouseEvent) => {
        const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.current.x))
        const newY = Math.max(0, Math.min(window.innerHeight - size.height - 64, e.clientY - dragOffset.current.y))
        onMove({ x: newX, y: newY })
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
  }, [position, size, onFocus, onMove])

  const handleResizeMouseDown = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    onFocus()
    setIsResizing(true)

    const startX = e.clientX
    const startY = e.clientY
    const startWidth = size.width
    const startHeight = size.height

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const maxWidth = window.innerWidth - position.x
      const maxHeight = window.innerHeight - position.y
      const newWidth = Math.min(maxWidth, Math.max(300, startWidth + (e.clientX - startX)))
      const newHeight = Math.min(maxHeight, Math.max(200, startHeight + (e.clientY - startY)))
      onResize({ width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [size, onFocus, onResize])

  return (
    <div
      ref={windowRef}
      data-app-window={appId}
      className={`absolute bg-mac-window backdrop-blur-xl rounded-xl shadow-mac overflow-hidden flex flex-col border border-mac ${
        isDragging || isResizing ? 'select-none' : ''
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
        transform: isAnimating ? 'scale(0.8) translateY(20px)' : 'scale(1) translateY(0)',
        opacity: isAnimating ? 0 : 1,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
      }}
      onMouseDown={(e) => {
        if (!isDragging && !isResizing) {
          onFocus()
        }
      }}
    >
      {/* Title bar - macOS style */}
      <div
        className="window-titlebar flex items-center h-10 px-3 bg-mac-tertiary/50 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        {/* Close button on the left (macOS style) */}
        <button
          aria-label={`Close ${title}`}
          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 transition-all flex items-center justify-center z-10 flex-shrink-0"
          onMouseEnter={() => setIsHoveringClose(true)}
          onMouseLeave={() => setIsHoveringClose(false)}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          {isHoveringClose && (
            <svg className="w-2 h-2 text-[#4d0000] opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          )}
        </button>

        {/* Title centered */}
        <span className="flex-1 text-center text-sm font-medium text-mac-primary">
          {title}
        </span>

        {/* Refresh and Admin buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/*
          {onRefreshClick && (
            <button
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onRefreshClick()
              }}
              title="Refresh Data"
            >
              <svg className="w-3.5 h-3.5 text-mac-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          */}
          {onAdminClick && (
            <button
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onAdminClick()
              }}
              title="View State (Admin)"
            >
              <svg className="w-3.5 h-3.5 text-mac-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          {!onRefreshClick && !onAdminClick && <div className="w-3" />}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-mac-secondary">
        {children}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeMouseDown}
      >
        <svg
          className="w-full h-full text-mac-tertiary opacity-50"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
        </svg>
      </div>
    </div>
  )
}
