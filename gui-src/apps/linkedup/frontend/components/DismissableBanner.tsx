import React, { useState, useEffect } from 'react'

interface DismissableBannerProps {
  message: string
  type?: 'error' | 'warning' | 'info' | 'success'
  onDismiss?: () => void
  autoDismissMs?: number
}

export function DismissableBanner({
  message,
  type = 'error',
  onDismiss,
  autoDismissMs
}: DismissableBannerProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (autoDismissMs && autoDismissMs > 0) {
      const timer = setTimeout(() => {
        handleDismiss()
      }, autoDismissMs)
      return () => clearTimeout(timer)
    }
  }, [autoDismissMs])

  const handleDismiss = () => {
    setIsVisible(false)
    onDismiss?.()
  }

  if (!isVisible) return null

  const styles = {
    error: {
      bg: 'bg-red-50',
      border: 'ring-red-200/70',
      text: 'text-red-800',
      icon: 'text-red-500',
      button: 'text-red-500 hover:bg-red-100'
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'ring-amber-200/70',
      text: 'text-amber-900',
      icon: 'text-amber-500',
      button: 'text-amber-600 hover:bg-amber-100'
    },
    info: {
      bg: 'bg-stone-50',
      border: 'ring-stone-200/70',
      text: 'text-stone-800',
      icon: 'text-stone-500',
      button: 'text-stone-500 hover:bg-stone-100'
    },
    success: {
      bg: 'bg-emerald-50',
      border: 'ring-emerald-200/70',
      text: 'text-emerald-800',
      icon: 'text-emerald-500',
      button: 'text-emerald-600 hover:bg-emerald-100'
    }
  }

  const s = styles[type]

  const icons = {
    error: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    warning: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    ),
    info: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    success: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    )
  }

  return (
    <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full mx-4 ${s.bg} ${s.border} ring-1 rounded-xl shadow-[0_10px_30px_rgba(15,23,42,0.10),0_4px_12px_rgba(15,23,42,0.06)] p-4 animate-in fade-in slide-in-from-top-2`}>
      <div className="flex items-start gap-3">
        <svg className={`w-5 h-5 ${s.icon} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {icons[type]}
        </svg>
        <p className={`${s.text} text-sm flex-1 leading-relaxed`}>{message}</p>
        <button
          onClick={handleDismiss}
          className={`${s.button} p-1 rounded-md transition-colors flex-shrink-0`}
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
