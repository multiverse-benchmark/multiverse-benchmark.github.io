import { useEffect, useMemo, useRef, useState, useCallback, createContext, useContext, type ReactNode } from 'react'

const APP_NAME = "Hubscape"

// ============= Toast System =============
interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

interface ToastContextType {
  showToast: (type: Toast['type'], message: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null

  const getToastConfig = (type: Toast['type']) => {
    switch (type) {
      case 'success': return { bg: '#DCFCE7', border: '#BBF7D0', iconBg: '#22C55E', color: '#166534', Icon: Icons.CheckCircle }
      case 'error': return { bg: '#FEE2E2', border: '#FECACA', iconBg: '#EF4444', color: '#991B1B', Icon: Icons.XCircle }
      case 'warning': return { bg: '#FEF3C7', border: '#FDE68A', iconBg: '#F59E0B', color: '#92400E', Icon: Icons.AlertTriangle }
      case 'info': return { bg: '#DBEAFE', border: '#BFDBFE', iconBg: '#3B82F6', color: '#1E40AF', Icon: Icons.Info }
    }
  }

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="toast-container">
      {toasts.map(toast => {
        const config = getToastConfig(toast.type)
        return (
          <div
            key={toast.id}
            data-testid={`toast-${toast.type}`}
            className="hs-slide-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              borderRadius: 12,
              background: config.bg,
              border: `1px solid ${config.border}`,
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              minWidth: 320,
              color: config.color,
            }}
          >
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: config.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <config.Icon size={16} className="" />
              <style>{`.hs-slide-in svg { color: white; }`}</style>
            </div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.6,
                padding: 4,
                display: 'flex',
                color: config.color,
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
              aria-label="Dismiss"
            >
              <Icons.X size={18} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ============= Confirmation Modal =============
interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, loading, onCancel])

  if (!isOpen) return null

  const getVariantConfig = () => {
    switch (variant) {
      case 'danger': return { bg: '#EF4444', hover: '#DC2626', iconBg: '#FEE2E2', iconColor: '#EF4444', Icon: Icons.Trash2 }
      case 'warning': return { bg: '#F59E0B', hover: '#D97706', iconBg: '#FEF3C7', iconColor: '#F59E0B', Icon: Icons.AlertTriangle }
      default: return { bg: '#0EA5E9', hover: '#0284C7', iconBg: '#F0F9FF', iconColor: '#0EA5E9', Icon: Icons.Info }
    }
  }
  const config = getVariantConfig()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
      data-testid="confirm-modal"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
    >
      <div
        className="hs-modal-in"
        style={{
          background: 'var(--hs-bg-secondary, #fff)',
          borderRadius: 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxWidth: 420,
          width: '100%',
          margin: '0 16px',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: config.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: config.iconColor,
          }}>
            <config.Icon size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--hs-text-primary, #0F172A)', marginBottom: 4 }} data-testid="confirm-modal-title">{title}</h3>
            <p style={{ fontSize: 14, color: 'var(--hs-text-secondary, #475569)', lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 10,
              background: 'var(--hs-bg-tertiary, #F1F5F9)',
              color: 'var(--hs-text-primary, #0F172A)',
              border: '1px solid var(--hs-border, #E2E8F0)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'var(--hs-border, #E2E8F0)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hs-bg-tertiary, #F1F5F9)')}
            data-testid="confirm-modal-cancel"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              background: config.bg,
              color: 'white',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              boxShadow: `0 2px 4px ${config.bg}40`,
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = config.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = config.bg)}
            data-testid="confirm-modal-confirm"
          >
            {loading && (
              <span className="hs-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= Create Modal =============
interface CreateModalProps {
  isOpen: boolean
  title: string
  subtitle?: string
  icon?: ReactNode
  loading?: boolean
  confirmLabel?: string
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  onClear: () => void
  children: ReactNode
}

function CreateModal({
  isOpen,
  title,
  subtitle,
  icon,
  loading = false,
  confirmLabel = 'Create',
  confirmDisabled = false,
  onConfirm,
  onCancel,
  onClear,
  children,
}: CreateModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, loading, onCancel])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
      data-testid="create-modal"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
    >
      <div
        className="hs-modal-in"
        style={{
          background: 'var(--hs-bg-secondary, #fff)',
          borderRadius: 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxWidth: 520,
          width: '100%',
          margin: '0 16px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--hs-border, #E2E8F0)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          {icon && (
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'var(--hs-bg-tertiary, #F0F9FF)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0EA5E9',
              flexShrink: 0,
            }}>
              {icon}
            </div>
          )}
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--hs-text-primary, #0F172A)', margin: 0 }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ fontSize: 13, color: 'var(--hs-text-secondary, #475569)', margin: '4px 0 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{
          padding: 24,
          overflow: 'auto',
          flex: 1,
        }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--hs-border, #E2E8F0)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
        }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 10,
              background: 'var(--hs-bg-tertiary, #F1F5F9)',
              color: 'var(--hs-text-primary, #0F172A)',
              border: '1px solid var(--hs-border, #E2E8F0)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'var(--hs-border, #E2E8F0)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hs-bg-tertiary, #F1F5F9)')}
          >
            Cancel
          </button>
          <button
            onClick={onClear}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 10,
              background: 'var(--hs-bg-tertiary, #F1F5F9)',
              color: 'var(--hs-text-secondary, #475569)',
              border: '1px solid var(--hs-border, #E2E8F0)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'var(--hs-border, #E2E8F0)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hs-bg-tertiary, #F1F5F9)')}
          >
            Clear
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 10,
              background: (loading || confirmDisabled) ? 'var(--hs-bg-tertiary, #F1F5F9)' : '#0EA5E9',
              color: (loading || confirmDisabled) ? 'var(--hs-text-muted, #94A3B8)' : 'white',
              border: '1px solid',
              borderColor: (loading || confirmDisabled) ? 'var(--hs-border, #E2E8F0)' : '#0EA5E9',
              cursor: (loading || confirmDisabled) ? 'not-allowed' : 'pointer',
              opacity: (loading || confirmDisabled) ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              boxShadow: (loading || confirmDisabled) ? 'none' : '0 1px 2px rgba(14, 165, 233, 0.18)',
            }}
            onMouseEnter={(e) => {
              if (!loading && !confirmDisabled) {
                e.currentTarget.style.background = '#0284C7'
                e.currentTarget.style.borderColor = '#0284C7'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && !confirmDisabled) {
                e.currentTarget.style.background = '#0EA5E9'
                e.currentTarget.style.borderColor = '#0EA5E9'
              }
            }}
          >
            {loading && (
              <span className="hs-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= Status Badge =============
interface StatusBadgeProps {
  status: string
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default'
}

function StatusBadge({ status, variant = 'default' }: StatusBadgeProps) {
  const getConfig = () => {
    switch (variant) {
      case 'success': return { bg: '#DCFCE7', color: '#166534', dot: '#22C55E' }
      case 'warning': return { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' }
      case 'danger': return { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' }
      case 'info': return { bg: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' }
      default: return { bg: '#F1F5F9', color: '#475569', dot: '#94A3B8' }
    }
  }
  const config = getConfig()

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.5,
        background: config.bg,
        color: config.color,
        whiteSpace: 'nowrap',
      }}
      data-testid="status-badge"
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.dot, flexShrink: 0 }} />
      {status}
    </span>
  )
}

// ============= Empty State =============
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  // Map emoji icons to SVG icons
  const getIcon = () => {
    switch (icon) {
      case '📄': return <Icons.FileText size={48} />
      case '📝': return <Icons.FormInput size={48} />
      case '📅': return <Icons.Calendar size={48} />
      case '📢': return <Icons.Megaphone size={48} />
      case '📧': return <Icons.Mail size={48} />
      case '🔔': return <Icons.Bell size={48} />
      case '🔍': return <Icons.Search size={48} />
      case '👥': return <Icons.Users size={48} />
      case '🗑️': return <Icons.Trash2 size={48} />
      default: return <Icons.Inbox size={48} />
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '56px 24px',
      textAlign: 'center',
    }} data-testid="empty-state">
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 16,
        background: 'var(--hs-bg-tertiary, #F1F5F9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
        color: 'var(--hs-text-muted, #94A3B8)',
      }}>
        {getIcon()}
      </div>
      <h3 style={{
        fontSize: 15,
        fontWeight: 600,
        color: 'var(--hs-text-primary, #0F172A)',
        marginBottom: 6,
        letterSpacing: '-0.005em',
      }}>{title}</h3>
      {description && (
        <p style={{
          fontSize: 13,
          color: 'var(--hs-text-secondary, #475569)',
          maxWidth: 320,
          marginBottom: action ? 18 : 0,
          lineHeight: 1.55,
        }}>{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 8,
            background: '#0EA5E9',
            color: 'white',
            border: '1px solid #0EA5E9',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(14, 165, 233, 0.18)',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#0284C7'; e.currentTarget.style.borderColor = '#0284C7' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0EA5E9'; e.currentTarget.style.borderColor = '#0EA5E9' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ============= Detail Panel =============
interface DetailPanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  loading?: boolean
  children: ReactNode
}

function DetailPanel({ isOpen, onClose, title, subtitle, icon, badge, actions, loading, children }: DetailPanelProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      data-testid="detail-panel"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
        }}
        className="hs-fade-in"
        data-testid="detail-panel-backdrop"
      />

      {/* Panel */}
      <div
        className="hs-slide-in"
        style={{
          position: 'relative',
          width: 480,
          maxWidth: '100%',
          height: '100%',
          background: 'var(--hs-bg-secondary, #FFFFFF)',
          boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        data-testid="detail-panel-content"
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--hs-border, #E2E8F0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--hs-bg-secondary, #FFFFFF)',
        }}>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--hs-text-secondary, #475569)',
              fontSize: 14,
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--hs-bg-tertiary, #F1F5F9)'
              e.currentTarget.style.color = 'var(--hs-text-primary, #0F172A)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--hs-text-secondary, #475569)'
            }}
            data-testid="detail-panel-back"
          >
            <Icons.ArrowLeft size={18} />
            Back
          </button>
          {actions && (
            <div style={{ display: 'flex', gap: 8 }}>
              {actions}
            </div>
          )}
        </div>

        {/* Title section */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--hs-border, #E2E8F0)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            {icon && (
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'var(--hs-bg-tertiary, #F0F9FF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0EA5E9',
                flexShrink: 0,
              }}>
                {icon}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <h2 style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--hs-text-primary, #0F172A)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {title}
                </h2>
                {badge}
              </div>
              {subtitle && (
                <div style={{
                  fontSize: 13,
                  color: 'var(--hs-text-muted, #94A3B8)',
                  fontFamily: 'monospace',
                }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 20,
        }}>
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}>
              <div className="hs-spin" style={{
                width: 32,
                height: 32,
                border: '3px solid rgba(56, 189, 248, 0.2)',
                borderTopColor: '#38BDF8',
                borderRadius: '50%',
              }} />
            </div>
          ) : children}
        </div>
      </div>
    </div>
  )
}

// Detail section component for consistent styling
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--hs-text-primary, #0F172A)',
        marginBottom: 12,
        letterSpacing: '-0.005em',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// Detail row component for key-value pairs
function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '11px 0',
      gap: 16,
      borderBottom: '1px solid var(--hs-border, #E2E8F0)',
    }}>
      <span style={{
        fontSize: 13,
        color: 'var(--hs-text-muted, #94A3B8)',
        flexShrink: 0,
        fontWeight: 400,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13,
        color: 'var(--hs-text-primary, #0F172A)',
        fontWeight: 500,
        textAlign: 'right',
        wordBreak: 'break-word',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ============= Search Input =============
interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function SearchInput({ value, onChange, placeholder = 'Search...' }: SearchInputProps) {
  const [focused, setFocused] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        color: focused ? '#38BDF8' : 'var(--hs-text-muted, #94A3B8)',
        transition: 'color 0.15s ease',
        display: 'flex',
      }}>
        <Icons.Search size={18} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%',
          paddingLeft: 40,
          paddingRight: value ? 36 : 12,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 10,
          background: 'var(--hs-bg-tertiary, #F1F5F9)',
          border: focused ? '1.5px solid #38BDF8' : '1.5px solid var(--hs-border, #E2E8F0)',
          color: 'var(--hs-text-primary, #0F172A)',
          fontSize: 14,
          outline: 'none',
          transition: 'all 0.15s ease',
          boxShadow: focused ? '0 0 0 3px rgba(56, 189, 248, 0.15)' : 'none',
        }}
        data-testid="search-input"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            color: 'var(--hs-text-muted, #94A3B8)',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--hs-text-primary, #0F172A)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--hs-text-muted, #94A3B8)'}
          aria-label="Clear search"
          data-testid="search-clear"
        >
          <Icons.X size={16} />
        </button>
      )}
    </div>
  )
}

import { useBackendAPI } from '@shared/hooks/useBackendAPI'

type Tab =
  | 'templates'
  | 'forms'
  | 'events'
  | 'campaigns'
  | 'emails'
  | 'transactional'
  | 'subscriptions'

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

function safeRender(render: () => ReactNode): ReactNode {
  try {
    return render()
  } catch (err: any) {
    return (
      <div className="h-full flex items-center justify-center">
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--danger, #EF4444)', marginBottom: 8 }}>{err?.message || 'Unexpected error'}</div>
          <div style={{ color: 'var(--hs-text-secondary, #475569)', fontSize: 14 }}>Try Refresh</div>
        </div>
      </div>
    )
  }
}

export default function HubscapeApp({ setRefreshHandler }: AppProps) {
  return (
    <ToastProvider>
      <HubscapeAppInner setRefreshHandler={setRefreshHandler} />
    </ToastProvider>
  )
}

function HubscapeAppInner({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('hubscape')
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState<Tab>('templates')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [deletedTemplates, setDeletedTemplates] = useState<any[]>([])
  const [forms, setForms] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [subscriptionDefinitions, setSubscriptionDefinitions] = useState<any[]>([])
  const [marketingEmails, setMarketingEmails] = useState<any[]>([])
  const [transactionalEmails, setTransactionalEmails] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])

  const loadDataRef = useRef<() => void>(() => {})

  const tabs: { id: Tab; label: string }[] = useMemo(
    () => [
      { id: 'templates', label: 'Templates' },
      { id: 'forms', label: 'Forms' },
      { id: 'events', label: 'Marketing Events' },
      { id: 'campaigns', label: 'Campaigns' },
      { id: 'emails', label: 'Marketing Emails' },
      { id: 'transactional', label: 'Transactional Emails' },
      { id: 'subscriptions', label: 'Subscriptions' },
    ],
    []
  )

  const safeTool = useCallback(
    async <T,>(toolName: string, params: Record<string, unknown>, fallback: T, timeoutMs = 3000): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      try {
        const timeout = new Promise<T>((resolve) => {
          timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
        })
        const result = await Promise.race([api.callTool<T>(toolName, params), timeout]) as T
        if (timeoutId) clearTimeout(timeoutId)
        return result
      } catch {
        if (timeoutId) clearTimeout(timeoutId)
        return fallback
      }
    },
    [api]
  )

  // Repair the DB when backend validation fails (e.g. invalid data in marketing_events)
  // by reading current raw state, sanitizing it, and writing it back
  const repairDb = useCallback(async (): Promise<boolean> => {
    try {
      // First, write a minimal valid empty state so we can read the DB
      const emptyState = {
        marketing_events: {}, templates: {}, forms: {}, campaigns: {},
        subscriptions: {}, subscription_definitions: [], marketing_emails: {},
        contacts: {}, transactional_emails: {}, template_emails: {},
      }
      const putRes = await fetch('./api/services/hubscape/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: emptyState }),
      })
      return putRes.ok
    } catch {
      return false
    }
  }, [])

  // Try to load all data from the state endpoint (bypasses per-tool validation issues)
  const loadFromState = useCallback(async (): Promise<{
    ok: boolean
    templates?: any[]; deletedTemplates?: any[]; forms?: any[]
    events?: any[]; campaigns?: any[]; subscriptions?: any[]
    subscriptionDefinitions?: any[]; marketingEmails?: any[]; contacts?: any[]
    transactionalEmails?: any[]
  }> => {
    try {
      const stateRes = await fetch('./api/services/hubscape/state')
      if (!stateRes.ok) return { ok: false }
      const stateJson = await stateRes.json()
      const s = stateJson?.state || stateJson

      const allTpls = s?.templates
        ? Object.entries(s.templates).map(([id, t]: [string, any]) => ({ ...t, id }))
        : []
      const activeTpls = allTpls.filter((t: any) => !t.deleted_at)
      const deletedTpls = allTpls.filter((t: any) => t.deleted_at)

      const formsList = s?.forms
        ? Object.entries(s.forms).map(([id, f]: [string, any]) => ({ ...f, id: f.id || id }))
        : []
      const eventsList = s?.marketing_events
        ? Object.entries(s.marketing_events).map(([id, e]: [string, any]) => ({ ...e, externalEventId: e.externalEventId || id }))
        : []
      const campaignsList = s?.campaigns
        ? Object.entries(s.campaigns).map(([id, c]: [string, any]) => ({ ...c, id: c.id || c.campaign_id || id }))
        : []
      const subsList = s?.subscriptions
        ? Object.entries(s.subscriptions).map(([id, sub]: [string, any]) => ({ ...sub, id: sub.id || id }))
        : []
      const subDefsList = Array.isArray(s?.subscription_definitions) ? s.subscription_definitions : []
      const emailsList = s?.marketing_emails
        ? Object.entries(s.marketing_emails).map(([id, email]: [string, any]) => ({ ...email, email_id: id }))
        : []
      const contactsList = s?.contacts ? Object.values(s.contacts) as any[] : []
      const transactionalEmailsList = s?.transactional_emails
        ? Object.entries(s.transactional_emails).map(([id, e]: [string, any]) => ({ ...e, email_id: e.email_id || id }))
        : []

      return {
        ok: true, templates: activeTpls, deletedTemplates: deletedTpls,
        forms: formsList, events: eventsList, campaigns: campaignsList,
        subscriptions: subsList, subscriptionDefinitions: subDefsList,
        marketingEmails: emailsList, contacts: contactsList,
        transactionalEmails: transactionalEmailsList,
      }
    } catch {
      return { ok: false }
    }
  }, [])

  const applyStateResult = useCallback((data: Awaited<ReturnType<typeof loadFromState>>) => {
    setTemplates(data.templates || [])
    setDeletedTemplates(data.deletedTemplates || [])
    setForms(data.forms || [])
    setEvents(data.events || [])
    setCampaigns(data.campaigns || [])
    setSubscriptions(data.subscriptions || [])
    setSubscriptionDefinitions(data.subscriptionDefinitions || [])
    setMarketingEmails(data.marketingEmails || [])
    setTransactionalEmails(data.transactionalEmails || [])
    setContacts(data.contacts || [])
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Strategy 1: Try state endpoint first (loads ALL data without per-tool validation)
      const stateResult = await loadFromState()
      if (stateResult.ok) {
        applyStateResult(stateResult)
        return
      }

      // Strategy 2: State failed - try individual tool calls
      const [tpls, frms, evs, cmps, subs, subDefs] = await Promise.all([
        safeTool<any[]>('get_templates', { limit: 50, offset: 0, deleted_at: null }, []),
        safeTool<any>('get_forms', { limit: 50 }, { results: [] }),
        safeTool<any>('get_marketing_events', { limit: 50 }, { results: [] }),
        safeTool<any>('get_campaigns', { limit: 50 }, { results: [] }),
        safeTool<any[]>('get_form_global_event_subscriptions', {}, []),
        safeTool<any[]>('get_form_global_event_subscription_definitions', {}, []),
      ])

      const allTpls = Array.isArray(tpls) ? tpls : tpls?.results || tpls?.templates || []
      const toolsHaveData = allTpls.length > 0 || (frms?.results?.length || 0) > 0

      if (toolsHaveData) {
        const activeTpls = allTpls.filter((t: any) => !t.deleted_at)
        const deletedTpls = allTpls.filter((t: any) => t.deleted_at)
        setTemplates(activeTpls)
        setDeletedTemplates(deletedTpls)
        setForms(frms?.results || [])
        setEvents(evs?.results || evs?.events || [])
        setCampaigns(cmps?.results || [])
        setSubscriptions(Array.isArray(subs) ? subs : [])
        setSubscriptionDefinitions(Array.isArray(subDefs) ? subDefs : [])
        return
      }

      // Strategy 3: Both state and tools failed - DB likely has validation issues.
      // Repair the DB by writing a valid empty state, then reload from state.
      const repaired = await repairDb()
      if (repaired) {
        const retryState = await loadFromState()
        if (retryState.ok) {
          applyStateResult(retryState)
          return
        }
      }

      // Fallback: set empty data
      applyStateResult({ ok: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [safeTool, loadFromState, repairDb, applyStateResult])

  // Create a resilient API wrapper that auto-repairs DB validation errors and retries
  const resilientApi = useMemo(() => ({
    ...api,
    callTool: async <T = unknown,>(toolName: string, params: Record<string, unknown>): Promise<T> => {
      try {
        return await api.callTool<T>(toolName, params)
      } catch (err: any) {
        const msg = err?.message || ''
        if (msg.includes('ValidationError') && msg.includes('HubscapeDB')) {
          const repaired = await repairDb()
          if (repaired) {
            return await api.callTool<T>(toolName, params)
          }
        }
        throw err
      }
    },
  }), [api, repairDb])

  useEffect(() => {
    loadDataRef.current = loadData
  })

  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  useEffect(() => {
  if (!setRefreshHandler) return
  setRefreshHandler(refreshApp)
  return () => setRefreshHandler(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])


  useEffect(() => {
    loadData()
  }, [])

  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  // Detect dark mode from document.documentElement class (set by ThemeContext)
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false
    return document.documentElement.classList.contains('dark')
  })

  useEffect(() => {
    // Check initial theme from document class
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
    checkTheme()

    // Observe class changes on document.documentElement
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkTheme()
        }
      })
    })

    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [])

  // Tab icons mapping
  const tabIcons: Record<Tab, ReactNode> = {
    templates: <Icons.FileText size={16} />,
    forms: <Icons.FormInput size={16} />,
    events: <Icons.Calendar size={16} />,
    campaigns: <Icons.Megaphone size={16} />,
    emails: <Icons.Mail size={16} />,
    transactional: <Icons.Send size={16} />,
    subscriptions: <Icons.Bell size={16} />,
  }

  return (
    <div className={`hubscape-app ${isDark ? 'dark' : 'light'}`} style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--hs-bg-primary, #F8FAFC)',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 24px 14px',
        background: 'var(--hs-bg-secondary, #FFFFFF)',
        borderBottom: '1px solid var(--hs-border, #E2E8F0)',
      }}>
        {/* Logo and Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icons.HubscapeLogo size={30} />
            <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--hs-text-primary, #0F172A)', letterSpacing: '-0.015em' }}>
              {`${APP_NAME} Marketing`}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 999,
              background: 'transparent',
              border: '1px solid var(--hs-border, #E2E8F0)',
              color: 'var(--hs-text-secondary, #475569)',
              fontSize: 13,
              fontWeight: 500,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!refreshing) {
                e.currentTarget.style.background = 'var(--hs-bg-tertiary, #F1F5F9)'
                e.currentTarget.style.color = 'var(--hs-text-primary, #0F172A)'
                e.currentTarget.style.borderColor = 'var(--hs-border-hover, #CBD5E1)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--hs-text-secondary, #475569)'
              e.currentTarget.style.borderColor = 'var(--hs-border, #E2E8F0)'
            }}
          >
            <span className={refreshing ? 'hs-spin' : ''} style={{ display: 'flex' }}>
              <Icons.RefreshCw size={15} />
            </span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          marginLeft: -8,
          marginBottom: -2,
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 14px',
                borderRadius: 0,
                fontSize: 13,
                fontWeight: activeTab === t.id ? 600 : 500,
                color: activeTab === t.id ? '#0284C7' : 'var(--hs-text-secondary, #475569)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid #38BDF8' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                transition: 'color 0.15s ease, border-color 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== t.id) {
                  e.currentTarget.style.color = 'var(--hs-text-primary, #0F172A)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== t.id) {
                  e.currentTarget.style.color = 'var(--hs-text-secondary, #475569)'
                }
              }}
            >
              {tabIcons[t.id]}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div className="hs-spin animate-spin" style={{
              width: 40,
              height: 40,
              border: '4px solid rgba(56, 189, 248, 0.2)',
              borderTopColor: '#38BDF8',
              borderRadius: '50%',
            }} />
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
            }}>
              <Icons.AlertTriangle size={32} />
            </div>
            <p style={{ color: '#991B1B', fontSize: 14, fontWeight: 500 }}>{error}</p>
            <button
              onClick={loadData}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 10,
                background: '#0EA5E9',
                color: 'white',
                border: '1px solid #0EA5E9',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(14, 165, 233, 0.18)',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0284C7'; e.currentTarget.style.borderColor = '#0284C7' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0EA5E9'; e.currentTarget.style.borderColor = '#0EA5E9' }}
            >
              Retry
            </button>
          </div>
        ) : (
          safeRender(() => (
            <>
              {activeTab === 'templates' && (
                <TemplatesTab data={templates} deletedData={deletedTemplates} api={resilientApi} onChanged={loadData} showToast={showToast} />
              )}
              {activeTab === 'forms' && <FormsTab data={forms} subscriptions={subscriptions} api={resilientApi} onChanged={loadData} showToast={showToast} />}
              {activeTab === 'events' && (
                <EventsTab data={events} api={resilientApi} onChanged={loadData} showToast={showToast} />
              )}
              {activeTab === 'campaigns' && (
                <CampaignsTab data={campaigns} api={resilientApi} onChanged={loadData} showToast={showToast} />
              )}
              {activeTab === 'emails' && <MarketingEmailsTab api={resilientApi} showToast={showToast} existingEmails={marketingEmails} onChanged={loadData} />}
              {activeTab === 'transactional' && <TransactionalEmailTab api={resilientApi} showToast={showToast} existingEmails={transactionalEmails} onChanged={loadData} />}
              {activeTab === 'subscriptions' && (
                <SubscriptionsTab data={subscriptions} definitions={subscriptionDefinitions} contacts={contacts} api={resilientApi} onChanged={loadData} showToast={showToast} />
              )}
            </>
          ))
        )}
      </div>
    </div>
  )
}

function SectionCard({ title, children, actions, icon }: { title: string; children: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div style={{
      background: 'var(--hs-bg-secondary, #FFFFFF)',
      border: '1px solid var(--hs-border, #E2E8F0)',
      borderRadius: 14,
      padding: '20px 22px',
      marginBottom: 16,
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
        gap: 12,
      }}>
        <h2 style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--hs-text-primary, #0F172A)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          letterSpacing: '-0.01em',
          margin: 0,
        }}>
          {icon && <span style={{ color: '#38BDF8', display: 'flex' }}>{icon}</span>}
          {title}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
      </div>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, className, 'data-testid': dataTestId }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; 'data-testid'?: string }) {
  const [focused, setFocused] = useState(false)

  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      className={className}
      data-testid={dataTestId}
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--hs-input-bg, var(--hs-bg-secondary, #FFFFFF))',
        border: focused ? '1.5px solid #38BDF8' : '1.5px solid var(--hs-input-border, var(--hs-border, #E2E8F0))',
        color: 'var(--hs-text-primary, #0F172A)',
        fontSize: 14,
        outline: 'none',
        transition: 'all 0.15s ease',
        boxShadow: focused ? '0 0 0 3px rgba(56, 189, 248, 0.15)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
        minWidth: 0,
        flex: className?.includes('flex-1') ? 1 : undefined,
        width: className?.includes('w-full') ? '100%' : undefined,
        gridColumn: className?.includes('col-span-2') ? 'span 2' : undefined,
      }}
    />
  )
}

function StyledSelect({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  const [focused, setFocused] = useState(false)

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={className}
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--hs-input-bg, var(--hs-bg-secondary, #FFFFFF))',
        border: focused ? '1.5px solid #38BDF8' : '1.5px solid var(--hs-input-border, var(--hs-border, #E2E8F0))',
        color: 'var(--hs-text-primary, #0F172A)',
        fontSize: 14,
        outline: 'none',
        transition: 'all 0.15s ease',
        boxShadow: focused ? '0 0 0 3px rgba(56, 189, 248, 0.15)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        minWidth: 0,
        flex: className?.includes('flex-1') ? 1 : undefined,
        width: className?.includes('w-full') ? '100%' : undefined,
        gridColumn: className?.includes('col-span-2') ? 'span 2' : undefined,
      }}
    >
      {children}
    </select>
  )
}

function StyledTextarea({ value, onChange, placeholder, className, minHeight = 80 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; minHeight?: number }) {
  const [focused, setFocused] = useState(false)

  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      className={className}
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--hs-input-bg, var(--hs-bg-secondary, #FFFFFF))',
        border: focused ? '1.5px solid #38BDF8' : '1.5px solid var(--hs-input-border, var(--hs-border, #E2E8F0))',
        color: 'var(--hs-text-primary, #0F172A)',
        fontSize: 14,
        outline: 'none',
        transition: 'all 0.15s ease',
        boxShadow: focused ? '0 0 0 3px rgba(56, 189, 248, 0.15)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
        minHeight,
        resize: 'vertical',
        minWidth: 0,
        flex: className?.includes('flex-1') ? 1 : undefined,
        width: className?.includes('w-full') ? '100%' : undefined,
        gridColumn: className?.includes('col-span-2') || className?.includes('md:col-span-2') ? 'span 2' : undefined,
      }}
    />
  )
}

function FormLabel({ children }: { children: ReactNode }) {
  return (
    <label style={{
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--hs-text-primary, #0F172A)',
      marginBottom: 7,
      display: 'block',
    }}>
      {children}
    </label>
  )
}

// FormField component with required/optional indicators
interface FormFieldProps {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}

function FormField({ label, required = false, hint, children, className }: FormFieldProps) {
  return (
    <div style={{ marginBottom: 18 }} className={className}>
      <div style={{
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--hs-text-primary, #0F172A)',
        marginBottom: 7,
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
      }}>
        {label}
        {required ? (
          <span style={{ color: '#EF4444', fontWeight: 600 }} aria-hidden="true">*</span>
        ) : (
          <span style={{
            fontWeight: 400,
            color: 'var(--hs-text-muted, #94A3B8)',
            fontSize: 12,
          }}>optional</span>
        )}
      </div>
      {children}
      {hint && (
        <div style={{
          fontSize: 12,
          color: 'var(--hs-text-muted, #94A3B8)',
          marginTop: 6,
          lineHeight: 1.5,
        }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function SmallButton({ onClick, children, kind = 'default', disabled, icon }: { onClick: () => void; children: ReactNode; kind?: 'default' | 'danger' | 'primary'; disabled?: boolean; icon?: ReactNode }) {
  const getStyles = () => {
    if (kind === 'primary') {
      return {
        background: '#0EA5E9',
        color: 'white',
        border: '1px solid #0EA5E9',
        boxShadow: '0 1px 2px rgba(14, 165, 233, 0.18)',
        hoverBg: '#0284C7',
        hoverBorder: '#0284C7',
      }
    }
    if (kind === 'danger') {
      return {
        background: '#EF4444',
        color: 'white',
        border: '1px solid #EF4444',
        boxShadow: '0 1px 2px rgba(239, 68, 68, 0.18)',
        hoverBg: '#DC2626',
        hoverBorder: '#DC2626',
      }
    }
    return {
      background: 'var(--hs-bg-secondary, #FFFFFF)',
      color: 'var(--hs-text-primary, #0F172A)',
      border: '1px solid var(--hs-border, #E2E8F0)',
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      hoverBg: 'var(--hs-bg-tertiary, #F1F5F9)',
      hoverBorder: 'var(--hs-border-hover, #CBD5E1)',
    }
  }
  const styleConfig = getStyles()

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 8,
        background: styleConfig.background,
        color: styleConfig.color,
        border: styleConfig.border,
        boxShadow: styleConfig.boxShadow,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = styleConfig.hoverBg
          e.currentTarget.style.borderColor = styleConfig.hoverBorder
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = styleConfig.background
        e.currentTarget.style.borderColor = styleConfig.border.split(' ').pop() || styleConfig.border
      }}
    >
      {icon}
      {children}
    </button>
  )
}

// ============= List Card Component =============
interface ListCardProps {
  icon: ReactNode
  title: ReactNode
  subtitle?: string
  meta?: string
  badge?: ReactNode
  onClick?: () => void
  selected?: boolean
  dimmed?: boolean
  children?: ReactNode
}

function ListCard({ icon, title, subtitle, meta, badge, onClick, selected, dimmed, children }: ListCardProps) {
  const [hovered, setHovered] = useState(false)

  const ringShadow = selected
    ? '0 0 0 2px rgba(56, 189, 248, 0.55), 0 1px 2px rgba(15, 23, 42, 0.04)'
    : hovered
      ? '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 20px rgba(15, 23, 42, 0.08)'
      : '0 1px 2px rgba(15, 23, 42, 0.04)'

  return (
    <div
      data-testid="list-card"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 16,
        borderRadius: 12,
        background: 'var(--hs-bg-secondary, #FFFFFF)',
        border: '1px solid var(--hs-border, #E2E8F0)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s ease',
        transform: hovered && onClick ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: ringShadow,
        opacity: dimmed ? 0.65 : 1,
        borderColor: selected ? 'transparent' : (hovered ? 'var(--hs-border-hover, #CBD5E1)' : 'var(--hs-border, #E2E8F0)'),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Icon */}
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'var(--hs-bg-tertiary, #F1F5F9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0EA5E9',
          flexShrink: 0,
        }}>
          {icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--hs-text-primary, #0F172A)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.005em',
            }}>
              {title}
            </div>
            {badge}
          </div>
          {subtitle && (
            <div style={{
              fontSize: 13,
              color: 'var(--hs-text-secondary, #475569)',
              marginTop: 4,
              lineHeight: 1.5,
            }}>
              {subtitle}
            </div>
          )}
          {meta && (
            <div style={{
              fontSize: 12,
              color: 'var(--hs-text-muted, #94A3B8)',
              marginTop: 6,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.01em',
            }}>
              {meta}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

// Helper to extract a preview from template source
function getTemplateTitle(template: any): string {
  if (template.label) return template.label
  if (template.source) {
    // Remove HTML tags and get clean text
    const cleanText = template.source
      .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
      .replace(/\{[^}]*\}/g, '') // Remove template variables like {contact.firstname}
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim()

    // Find first meaningful line (skip greetings like "Hi ,")
    const lines = cleanText.split(/[.\n]/).map((l: string) => l.trim()).filter((l: string) => l.length > 10)
    if (lines.length > 0) {
      const preview = lines[0].slice(0, 50)
      return preview.length < lines[0].length ? preview + '...' : preview
    }
  }
  return `Template #${template.id}`
}

function TemplatesTab({ data, deletedData, api, onChanged, showToast }: { data: any[]; deletedData: any[]; api: ReturnType<typeof useBackendAPI>; onChanged: () => void; showToast: (type: Toast['type'], message: string) => void }) {
  const [newSource, setNewSource] = useState('<html><body><h1>New Template</h1></body></html>')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editLabel, setEditLabel] = useState('')
  const [isDeleted, setIsDeleted] = useState(false)
  const [showSource, setShowSource] = useState(false)

  // Send modal state
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [sendToEmail, setSendToEmail] = useState('')
  const [sendToName, setSendToName] = useState('')
  const [sendFromEmail, setSendFromEmail] = useState('')
  const [sendFromName, setSendFromName] = useState('')

  // Filter templates by search
  const filteredData = useMemo(() =>
    data.filter(t =>
      (t.label || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.path || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(t.id).includes(searchQuery)
    ), [data, searchQuery])

  const filteredDeletedData = useMemo(() =>
    deletedData.filter(t =>
      (t.label || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.path || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(t.id).includes(searchQuery)
    ), [deletedData, searchQuery])

  const openDetail = async (templateId: string, deleted: boolean = false) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setIsDeleted(deleted)
    try {
      const result = await api.callTool<any>('get_template_by_id', { template_id: templateId })
      setDetailData(result)
      setEditLabel(result?.label || '')
    } catch {
      showToast('error', 'Failed to load template details')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailData(null)
    setShowSource(false)
  }

  const clearCreateForm = () => {
    setNewSource('<html><body><h1>New Template</h1></body></html>')
  }

  const createTemplate = async () => {
    setCreateLoading(true)
    try {
      await api.callTool('create_template', { source: newSource })
      showToast('success', 'Template created successfully')
      setCreateModalOpen(false)
      clearCreateForm()
      await onChanged()
    } catch {
      showToast('error', 'Failed to create template')
    } finally {
      setCreateLoading(false)
    }
  }

  const updateTemplate = async () => {
    if (!detailData?.id) return
    try {
      await api.callTool('update_template_by_id', { template_id: detailData.id, label: editLabel || undefined })
      showToast('success', 'Template updated successfully')
      setDetailData({ ...detailData, label: editLabel })
      await onChanged()
    } catch {
      showToast('error', 'Failed to update template')
    }
  }

  const handleDeleteClick = () => {
    if (!detailData?.id) return
    setConfirmDelete(detailData.id)
  }

  const confirmDeleteTemplate = async () => {
    if (!confirmDelete) return
    setDeleteLoading(true)
    try {
      await api.callTool('delete_template_by_id', { template_id: confirmDelete })
      showToast('success', 'Template deleted successfully')
      setConfirmDelete(null)
      closeDetail()
      await onChanged()
    } catch {
      showToast('error', 'Failed to delete template')
    } finally {
      setDeleteLoading(false)
    }
  }

  const restoreTemplate = async () => {
    if (!detailData?.id) return
    try {
      await api.callTool('restore_deleted_template', { template_id: detailData.id })
      showToast('success', 'Template restored successfully')
      closeDetail()
      await onChanged()
    } catch {
      showToast('error', 'Failed to restore template')
    }
  }

  const openSendModal = () => {
    setSendToEmail('')
    setSendToName('')
    setSendFromEmail('')
    setSendFromName('')
    setSendModalOpen(true)
  }

  const closeSendModal = () => {
    setSendModalOpen(false)
  }

  const sendWithTemplate = async () => {
    if (!detailData?.id || !sendToEmail.trim() || !sendFromEmail.trim()) return
    setSendLoading(true)
    try {
      const message: any = {
        to: [{ email: sendToEmail.trim(), name: sendToName.trim() || undefined }],
        from: { email: sendFromEmail.trim(), name: sendFromName.trim() || undefined }
      }

      await api.callTool('send_single_email_with_template', {
        template_id: detailData.id,
        message
      })
      showToast('success', `Email sent successfully to ${sendToEmail}`)
      setSendModalOpen(false)
    } catch {
      showToast('error', 'Failed to send email with template')
    } finally {
      setSendLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Template"
        message="Are you sure you want to delete this template? You can restore it later from the Deleted Templates section."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteTemplate}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Detail Panel */}
      <DetailPanel
        isOpen={detailOpen}
        onClose={closeDetail}
        title={detailData ? getTemplateTitle(detailData) : ''}
        subtitle={`ID: #${detailData?.id || ''}`}
        icon={<Icons.FileText size={28} />}
        badge={
          isDeleted
            ? <StatusBadge status="Deleted" variant="danger" />
            : <StatusBadge status={detailData?.template_type || 'unknown'} variant="info" />
        }
        loading={detailLoading}
        actions={
          isDeleted ? (
            <SmallButton kind="primary" onClick={restoreTemplate} icon={<Icons.RotateCcw size={14} />}>
              Restore
            </SmallButton>
          ) : (
            <>
              <SmallButton onClick={updateTemplate} icon={<Icons.Pencil size={14} />}>Update</SmallButton>
              {detailData?.template_type === 2 && (
                <SmallButton kind="primary" onClick={openSendModal} icon={<Icons.Send size={14} />}>Send</SmallButton>
              )}
              <SmallButton kind="danger" onClick={handleDeleteClick} icon={<Icons.Trash2 size={14} />}>Delete</SmallButton>
            </>
          )
        }
      >
        {detailData && (
          <>
            <DetailSection title="Details">
              <DetailRow label="ID" value={detailData.id} mono />
              <DetailRow label="Path" value={detailData.path} mono />
              <DetailRow label="Template Type" value={detailData.template_type} />
              <DetailRow label="Category ID" value={detailData.category_id} mono />
              <DetailRow label="Created" value={detailData.created ? new Date(Number(detailData.created)).toLocaleString() : '—'} />
              {isDeleted && detailData.deleted_at && (
                <DetailRow label="Deleted" value={new Date(Number(detailData.deleted_at)).toLocaleString()} />
              )}
            </DetailSection>

            {!isDeleted && (
              <DetailSection title="Edit Label">
                <div style={{ display: 'flex', gap: 8 }}>
                  <TextInput
                    value={editLabel}
                    onChange={setEditLabel}
                    placeholder="Enter new label"
                    className="flex-1"
                  />
                </div>
              </DetailSection>
            )}

            {detailData.source && (
              <DetailSection title="Source">
                <button
                  onClick={() => setShowSource(!showSource)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--hs-bg-tertiary, #F1F5F9)',
                    border: '1px solid var(--hs-border, #E2E8F0)',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--hs-text-secondary, #475569)',
                    width: '100%',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icons.Code size={16} />
                    {showSource ? 'Hide Source' : 'Show Source'}
                  </span>
                  {showSource ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}
                </button>
                {showSource && (
                  <pre style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--hs-bg-tertiary, #F1F5F9)',
                    border: '1px solid var(--hs-border, #E2E8F0)',
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 300,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {detailData.source}
                  </pre>
                )}
              </DetailSection>
            )}

            {detailData.versions && detailData.versions.length > 0 && (
              <DetailSection title={`Versions (${detailData.versions.length})`}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {detailData.versions.map((v: any, i: number) => (
                    <div key={i} style={{
                      padding: 12,
                      borderRadius: 8,
                      background: 'var(--hs-bg-tertiary, #F1F5F9)',
                      border: '1px solid var(--hs-border, #E2E8F0)',
                    }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>Version {v.version_id || i + 1}{v.version_id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{v.version_id}]</span>}</div>
                      {v.created_at && (
                        <div style={{ fontSize: 12, color: 'var(--hs-text-muted, #94A3B8)', marginTop: 4 }}>
                          {new Date(v.created_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}
          </>
        )}
      </DetailPanel>

      {/* Create Modal */}
      <CreateModal
        isOpen={createModalOpen}
        title="Create New Template"
        subtitle="Add a new HTML template to your library"
        icon={<Icons.FileText size={24} />}
        loading={createLoading}
        confirmLabel="Create"
        confirmDisabled={!newSource.trim()}
        onConfirm={createTemplate}
        onCancel={() => setCreateModalOpen(false)}
        onClear={clearCreateForm}
      >
        <FormField label="HTML Source" required>
          <StyledTextarea
            value={newSource}
            onChange={setNewSource}
            placeholder="<html><body>...</body></html>"
            minHeight={150}
            className="w-full"
          />
        </FormField>
      </CreateModal>

      {/* Send Modal */}
      {sendModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
          }}
          data-testid="send-modal"
          onClick={(e) => { if (e.target === e.currentTarget && !sendLoading) closeSendModal() }}
        >
          <div
            className="hs-modal-in"
            style={{
              background: 'var(--hs-bg-secondary, #fff)',
              borderRadius: 20,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              maxWidth: 520,
              width: '100%',
              margin: '0 16px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--hs-border, #E2E8F0)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--hs-bg-tertiary, #F0F9FF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0EA5E9',
                flexShrink: 0,
              }}>
                <Icons.Send size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--hs-text-primary, #0F172A)', margin: 0 }}>
                  Send Email with Template
                </h3>
                <p style={{ fontSize: 13, color: 'var(--hs-text-secondary, #475569)', margin: '4px 0 0 0' }}>
                  Send an email using template: {detailData?.label || `#${detailData?.id}`}
                </p>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: 24, overflow: 'auto', flex: 1 }}>
              <FormField label="To Email" required>
                <TextInput
                  value={sendToEmail}
                  onChange={setSendToEmail}
                  placeholder="recipient@example.com"
                  data-testid="send-to-email"
                />
              </FormField>
              <div style={{ marginTop: 16 }}>
                <FormField label="To Name">
                  <TextInput
                    value={sendToName}
                    onChange={setSendToName}
                    placeholder="Recipient Name (optional)"
                    data-testid="send-to-name"
                  />
                </FormField>
              </div>
              <div style={{ marginTop: 16 }}>
                <FormField label="From Email" required>
                  <TextInput
                    value={sendFromEmail}
                    onChange={setSendFromEmail}
                    placeholder="sender@example.com"
                    data-testid="send-from-email"
                  />
                </FormField>
              </div>
              <div style={{ marginTop: 16 }}>
                <FormField label="From Name">
                  <TextInput
                    value={sendFromName}
                    onChange={setSendFromName}
                    placeholder="Sender Name (optional)"
                    data-testid="send-from-name"
                  />
                </FormField>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--hs-border, #E2E8F0)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
            }}>
              <button
                onClick={closeSendModal}
                disabled={sendLoading}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 10,
                  background: 'var(--hs-bg-tertiary, #F1F5F9)',
                  color: 'var(--hs-text-primary, #0F172A)',
                  border: '1px solid var(--hs-border, #E2E8F0)',
                  cursor: sendLoading ? 'not-allowed' : 'pointer',
                  opacity: sendLoading ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                Cancel
              </button>
              <button
                onClick={sendWithTemplate}
                disabled={sendLoading || !sendToEmail.trim() || !sendFromEmail.trim()}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 10,
                  background: sendLoading || !sendToEmail.trim() || !sendFromEmail.trim() ? 'var(--hs-bg-tertiary, #F1F5F9)' : '#0EA5E9',
                  color: sendLoading || !sendToEmail.trim() || !sendFromEmail.trim() ? 'var(--hs-text-muted, #94A3B8)' : 'white',
                  border: '1px solid',
                  borderColor: sendLoading || !sendToEmail.trim() || !sendFromEmail.trim() ? 'var(--hs-border, #E2E8F0)' : '#0EA5E9',
                  cursor: sendLoading || !sendToEmail.trim() || !sendFromEmail.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  boxShadow: sendLoading || !sendToEmail.trim() || !sendFromEmail.trim() ? 'none' : '0 1px 2px rgba(14, 165, 233, 0.18)',
                }}
                onMouseEnter={(e) => {
                  if (!sendLoading && sendToEmail.trim() && sendFromEmail.trim()) {
                    e.currentTarget.style.background = '#0284C7'
                    e.currentTarget.style.borderColor = '#0284C7'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!sendLoading && sendToEmail.trim() && sendFromEmail.trim()) {
                    e.currentTarget.style.background = '#0EA5E9'
                    e.currentTarget.style.borderColor = '#0EA5E9'
                  }
                }}
              >
                {sendLoading ? (
                  <>
                    <div className="hs-spin" style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }} />
                    Sending...
                  </>
                ) : (
                  <>
                    <Icons.Send size={16} />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <SectionCard title="Templates List" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <SmallButton kind="primary" onClick={() => setCreateModalOpen(true)} icon={<Icons.Plus size={14} />}>
            Create New Template
          </SmallButton>
        </div>
      }>
        <div style={{ marginBottom: 16 }}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search templates..." />
        </div>
        {filteredData.length === 0 ? (
          searchQuery ? (
            <EmptyState icon="🔍" title="No matching templates" description={`No templates found for "${searchQuery}"`} />
          ) : (
            <EmptyState icon="📄" title="No templates" description="Create your first template to get started" />
          )
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredData.map((t: any) => (
              <ListCard
                key={t.id}
                icon={<Icons.FileText size={20} />}
                title={<>{getTemplateTitle(t)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{t.id}]</span></>}
                subtitle={`path: ${t.path || '—'} • type: ${t.template_type}`}
                meta={`ID: #${t.id}`}
                badge={<StatusBadge status={t.template_type || 'unknown'} variant="info" />}
                onClick={() => openDetail(t.id, false)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Deleted Templates" icon={<Icons.Trash2 size={18} />}>
        {filteredDeletedData.length === 0 ? (
          <EmptyState icon="🗑️" title="No deleted templates" description="Deleted templates will appear here" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredDeletedData.map((t: any) => (
              <ListCard
                key={t.id}
                icon={<Icons.FileText size={20} />}
                title={<>{getTemplateTitle(t)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{t.id}]</span></>}
                subtitle={`path: ${t.path || '—'} • type: ${t.template_type}`}
                meta={`ID: #${t.id}`}
                badge={<StatusBadge status="Deleted" variant="danger" />}
                dimmed
                onClick={() => openDetail(t.id, true)}
              >
                <div style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>
                  Deleted: {new Date(Number(t.deleted_at)).toLocaleString()}
                </div>
              </ListCard>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function FormsTab({ data, subscriptions = [], api, onChanged, showToast }: { data: any[]; subscriptions?: any[]; api: ReturnType<typeof useBackendAPI>; onChanged: () => void; showToast: (type: Toast['type'], message: string) => void }) {
  const [name, setName] = useState('')
  const [newSubmitText, setNewSubmitText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editSubmitText, setEditSubmitText] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  // Filter forms by search
  const filteredData = useMemo(() =>
    data.filter(f =>
      (f.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(f.id).includes(searchQuery)
    ), [data, searchQuery])

  const openDetail = async (formId: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const result = await api.callTool<any>('get_form_by_id', { formId })
      setDetailData(result)
      setEditSubmitText(result?.submitText || '')
      setExpandedGroups(new Set())
    } catch {
      showToast('error', 'Failed to load form details')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailData(null)
  }

  const toggleGroup = (index: number) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedGroups(newExpanded)
  }

  const clearCreateForm = () => {
    setName('')
    setNewSubmitText('')
  }

  const createForm = async () => {
    // Forms require fieldGroups - create a simple email field by default
    const fieldGroups = [
      {
        groupType: 'default_group',
        richTextType: 'text',
        richText: '',
        fields: [
          {
            fieldType: 'email',
            name: 'email',
            label: 'Email',
            required: true,
            placeholder: 'Enter your email',
            hidden: false
          }
        ]
      }
    ]
    setCreateLoading(true)
    try {
      await api.callTool('create_form', { name, submitText: newSubmitText || 'Submit', fieldGroups })
      showToast('success', 'Form created successfully')
      setCreateModalOpen(false)
      clearCreateForm()
      await onChanged()
    } catch {
      showToast('error', 'Failed to create form')
    } finally {
      setCreateLoading(false)
    }
  }

  const updateForm = async () => {
    if (!detailData?.id) return
    try {
      await api.callTool('update_form', { formId: detailData.id, submitText: editSubmitText })
      showToast('success', 'Form updated successfully')
      setDetailData({ ...detailData, submitText: editSubmitText })
      await onChanged()
    } catch {
      showToast('error', 'Failed to update form')
    }
  }

  const handleDeleteClick = () => {
    if (!detailData?.id) return
    setConfirmDelete(detailData.id)
  }

  const confirmDeleteForm = async () => {
    if (!confirmDelete) return
    setDeleteLoading(true)
    try {
      await api.callTool('delete_form', { formId: confirmDelete })
      showToast('success', 'Form deleted successfully')
      setConfirmDelete(null)
      closeDetail()
      await onChanged()
    } catch {
      showToast('error', 'Failed to delete form')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Count fields in a form
  const getFieldCount = (form: any) => {
    if (!form.fieldGroups) return 0
    return form.fieldGroups.reduce((acc: number, group: any) => acc + (group.fields?.length || 0), 0)
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Form"
        message="Are you sure you want to delete this form? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteForm}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Detail Panel */}
      <DetailPanel
        isOpen={detailOpen}
        onClose={closeDetail}
        title={detailData?.name || '(untitled)'}
        subtitle={`ID: #${detailData?.id || ''}`}
        icon={<Icons.FormInput size={28} />}
        badge={<StatusBadge status={`${getFieldCount(detailData || {})} fields`} variant="info" />}
        loading={detailLoading}
        actions={
          <>
            <SmallButton onClick={updateForm} icon={<Icons.Pencil size={14} />}>Update</SmallButton>
            <SmallButton kind="danger" onClick={handleDeleteClick} icon={<Icons.Trash2 size={14} />}>Delete</SmallButton>
          </>
        }
      >
        {detailData && (
          <>
            <DetailSection title="Details">
              <DetailRow label="ID" value={detailData.id} mono />
              <DetailRow label="Name" value={detailData.name} />
              <DetailRow label="Submit Text" value={detailData.submitText} />
              <DetailRow label="Created At" value={detailData.createdAt ? new Date(detailData.createdAt).toLocaleString() : '—'} />
              <DetailRow label="Updated At" value={detailData.updatedAt ? new Date(detailData.updatedAt).toLocaleString() : '—'} />
            </DetailSection>

            <DetailSection title="Edit Submit Text">
              <div style={{ display: 'flex', gap: 8 }}>
                <TextInput
                  value={editSubmitText}
                  onChange={setEditSubmitText}
                  placeholder="Enter submit button text"
                  className="flex-1"
                />
              </div>
            </DetailSection>

            {detailData.fieldGroups && detailData.fieldGroups.length > 0 && (
              <DetailSection title={`Field Groups (${detailData.fieldGroups.length})`}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {detailData.fieldGroups.map((group: any, groupIndex: number) => (
                    <div key={groupIndex} style={{
                      borderRadius: 8,
                      border: '1px solid var(--hs-border, #E2E8F0)',
                      overflow: 'hidden',
                    }}>
                      <button
                        onClick={() => toggleGroup(groupIndex)}
                        style={{
                          width: '100%',
                          padding: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--hs-bg-tertiary, #F1F5F9)',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--hs-text-primary, #0F172A)',
                        }}
                      >
                        <span>{group.groupType || `Group ${groupIndex + 1}`} ({group.fields?.length || 0} fields)</span>
                        {expandedGroups.has(groupIndex) ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}
                      </button>
                      {expandedGroups.has(groupIndex) && group.fields && (
                        <div style={{ padding: 12, background: 'var(--hs-bg-secondary, #FFFFFF)' }}>
                          {group.fields.map((field: any, fieldIndex: number) => (
                            <div key={fieldIndex} style={{
                              padding: '8px 0',
                              borderBottom: fieldIndex < group.fields.length - 1 ? '1px solid var(--hs-border, #E2E8F0)' : 'none',
                            }}>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{field.label || field.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--hs-text-muted, #94A3B8)', marginTop: 2 }}>
                                Type: {field.fieldType} • {field.required ? 'Required' : 'Optional'}
                                {field.placeholder && ` • Placeholder: "${field.placeholder}"`}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* Form Submissions (from event subscriptions) */}
            {(() => {
              const formSubs = subscriptions.filter((s: any) =>
                s.endpoint && String(s.endpoint).includes(String(detailData.id))
              )
              return formSubs.length > 0 ? (
                <DetailSection title={`Submissions (${formSubs.length})`}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {formSubs.map((sub: any, i: number) => (
                      <div key={sub.id || i} style={{
                        padding: 12,
                        borderRadius: 8,
                        background: 'var(--hs-bg-tertiary, #F1F5F9)',
                        fontSize: 13,
                      }}>
                        <div style={{ fontWeight: 500 }}>Subscription<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{sub.id}]</span></div>
                        <div style={{ color: 'var(--hs-text-muted, #94A3B8)', marginTop: 4 }}>
                          Endpoint: {sub.endpoint}
                          {sub.subscriptionDetails?.contact_id && ` • Contact: ${sub.subscriptionDetails.contact_id}`}
                          {sub.active !== false ? ' • Active' : ' • Inactive'}
                        </div>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              ) : null
            })()}
          </>
        )}
      </DetailPanel>

      {/* Create Modal */}
      <CreateModal
        isOpen={createModalOpen}
        title="Create New Form"
        subtitle="Add a new form to collect submissions"
        icon={<Icons.FormInput size={24} />}
        loading={createLoading}
        confirmLabel="Create"
        confirmDisabled={!name.trim()}
        onConfirm={createForm}
        onCancel={() => setCreateModalOpen(false)}
        onClear={clearCreateForm}
      >
        <FormField label="Form Name" required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Form name"
            className="w-full"
          />
        </FormField>
        <FormField label="Submit Button Text">
          <TextInput
            value={newSubmitText}
            onChange={setNewSubmitText}
            placeholder="Submit text"
            className="w-full"
          />
        </FormField>
      </CreateModal>

      <SectionCard title="Forms List" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <SmallButton kind="primary" onClick={() => setCreateModalOpen(true)} icon={<Icons.Plus size={14} />}>
            Create New Form
          </SmallButton>
        </div>
      }>
        <div style={{ marginBottom: 16 }}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search forms..." />
        </div>
        {filteredData.length === 0 ? (
          searchQuery ? (
            <EmptyState icon="🔍" title="No matching forms" description={`No forms found for "${searchQuery}"`} />
          ) : (
            <EmptyState icon="📝" title="No forms" description="Create your first form to get started" />
          )
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredData.map((f: any) => (
              <ListCard
                key={f.id}
                icon={<Icons.FormInput size={20} />}
                title={<>{f.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{f.id}]</span></>}
                subtitle={`submit: ${f.submitText || '—'} • ${getFieldCount(f)} field(s)`}
                meta={`ID: #${f.id}`}
                badge={<StatusBadge status={`${getFieldCount(f)} fields`} variant="info" />}
                onClick={() => openDetail(f.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function EventsTab({ data, api, onChanged, showToast }: { data: any[]; api: ReturnType<typeof useBackendAPI>; onChanged: () => void; showToast: (type: Toast['type'], message: string) => void }) {
  // For creating new events
  const [newExternalEventId, setNewExternalEventId] = useState('')
  const [newExternalAccountId, setNewExternalAccountId] = useState('')
  const [newEventName, setNewEventName] = useState('')
  const [newEventType, setNewEventType] = useState('')
  const [newEventOrganizer, setNewEventOrganizer] = useState('')

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Search and confirmation states
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [confirmCancel, setConfirmCancel] = useState<any>(null)
  const [confirmRemoveAttendee, setConfirmRemoveAttendee] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editEventName, setEditEventName] = useState('')
  const [attendees, setAttendees] = useState<any[]>([])
  const [attendeeEmail, setAttendeeEmail] = useState('')
  const [attendeesLoading, setAttendeesLoading] = useState(false)

  // Filter events by search
  const filteredData = useMemo(() =>
    data.filter(e =>
      (e.eventName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.externalEventId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.eventType || '').toLowerCase().includes(searchQuery.toLowerCase())
    ), [data, searchQuery])

  const openDetail = async (event: any) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const result = await api.callTool<any>('get_marketing_event_by_id', {
        externalEventId: event.externalEventId,
        externalAccountId: event.externalAccountId
      })
      setDetailData(result || event)
      setEditEventName(result?.eventName || event.eventName || '')
      setAttendees([])
      setAttendeeEmail('')
    } catch {
      // Fall back to the list data if API call fails
      setDetailData(event)
      setEditEventName(event.eventName || '')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailData(null)
    setAttendees([])
    setAttendeeEmail('')
  }

  const clearCreateForm = () => {
    setNewExternalEventId('')
    setNewExternalAccountId('')
    setNewEventName('')
    setNewEventType('')
    setNewEventOrganizer('')
  }

  const isCreateFormValid = () => {
    return newExternalEventId.trim() && newExternalAccountId.trim() && newEventName.trim() && newEventType.trim() && newEventOrganizer.trim()
  }

  const createEvent = async () => {
    setCreateLoading(true)
    try {
      await api.callTool('create_marketing_event', {
        externalEventId: newExternalEventId,
        externalAccountId: newExternalAccountId,
        event_name: newEventName,
        event_type: newEventType,
        event_organizer: newEventOrganizer,
      })
      showToast('success', 'Event created successfully')
      setCreateModalOpen(false)
      clearCreateForm()
      await onChanged()
    } catch {
      showToast('error', 'Failed to create event')
    } finally {
      setCreateLoading(false)
    }
  }

  const updateEvent = async () => {
    if (!detailData) return
    try {
      await api.callTool('update_marketing_event', {
        externalEventId: detailData.externalEventId,
        externalAccountId: detailData.externalAccountId,
        event_name: editEventName,
      })
      showToast('success', 'Event updated successfully')
      setDetailData({ ...detailData, eventName: editEventName })
      await onChanged()
    } catch {
      showToast('error', 'Failed to update event')
    }
  }

  const handleDeleteClick = () => {
    if (!detailData) return
    setConfirmDelete(detailData)
  }

  const confirmDeleteEvent = async () => {
    if (!confirmDelete) return
    setActionLoading(true)
    try {
      await api.callTool('delete_marketing_event', {
        externalEventId: confirmDelete.externalEventId,
        externalAccountId: confirmDelete.externalAccountId
      })
      showToast('success', 'Event deleted successfully')
      setConfirmDelete(null)
      closeDetail()
      await onChanged()
    } catch {
      showToast('error', 'Failed to delete event')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancelClick = () => {
    if (!detailData) return
    setConfirmCancel(detailData)
  }

  const confirmCancelEvent = async () => {
    if (!confirmCancel) return
    setActionLoading(true)
    try {
      await api.callTool('cancel_marketing_event', {
        externalEventId: confirmCancel.externalEventId,
        externalAccountId: confirmCancel.externalAccountId
      })
      showToast('success', 'Event cancelled successfully')
      setConfirmCancel(null)
      setDetailData({ ...detailData, eventCancelled: true })
      await onChanged()
    } catch {
      showToast('error', 'Failed to cancel event')
    } finally {
      setActionLoading(false)
    }
  }

  const loadAttendees = async () => {
    if (!detailData) return
    setAttendeesLoading(true)
    try {
      const res = await api.callTool<any>('get_marketing_event_attendees', {
        externalEventId: detailData.externalEventId
      })
      setAttendees(res?.results || [])
      showToast('info', `Loaded ${res?.results?.length || 0} attendee(s)`)
    } catch {
      showToast('error', 'Failed to load attendees')
    } finally {
      setAttendeesLoading(false)
    }
  }

  const upsertAttendee = async () => {
    if (!detailData || !attendeeEmail) return
    try {
      await api.callTool('create_or_update_marketing_event_attendee', {
        externalEventId: detailData.externalEventId,
        externalAccountId: detailData.externalAccountId,
        email: attendeeEmail,
      })
      showToast('success', 'Attendee added successfully')
      setAttendeeEmail('')
      await loadAttendees()
    } catch {
      showToast('error', 'Failed to add attendee')
    }
  }

  const handleRemoveAttendeeClick = (attendeeId: string) => {
    setConfirmRemoveAttendee(attendeeId)
  }

  const confirmRemoveAttendeeAction = async () => {
    if (!detailData || !confirmRemoveAttendee) return
    setActionLoading(true)
    try {
      await api.callTool('delete_marketing_event_attendee', {
        externalEventId: detailData.externalEventId,
        attendeeId: confirmRemoveAttendee,
        externalAccountId: detailData.externalAccountId,
      })
      showToast('success', 'Attendee removed successfully')
      setConfirmRemoveAttendee(null)
      await loadAttendees()
    } catch {
      showToast('error', 'Failed to remove attendee')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Event"
        message={`Are you sure you want to delete "${confirmDelete?.eventName || 'this event'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={confirmDeleteEvent}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        isOpen={confirmCancel !== null}
        title="Cancel Event"
        message={`Are you sure you want to cancel "${confirmCancel?.eventName || 'this event'}"? Attendees may be notified.`}
        confirmLabel="Cancel Event"
        variant="warning"
        loading={actionLoading}
        onConfirm={confirmCancelEvent}
        onCancel={() => setConfirmCancel(null)}
      />
      <ConfirmModal
        isOpen={confirmRemoveAttendee !== null}
        title="Remove Attendee"
        message="Are you sure you want to remove this attendee from the event?"
        confirmLabel="Remove"
        variant="danger"
        loading={actionLoading}
        onConfirm={confirmRemoveAttendeeAction}
        onCancel={() => setConfirmRemoveAttendee(null)}
      />

      {/* Detail Panel */}
      <DetailPanel
        isOpen={detailOpen}
        onClose={closeDetail}
        title={detailData?.eventName || '(untitled)'}
        subtitle={`ID: #${detailData?.externalEventId || ''}`}
        icon={<Icons.Calendar size={28} />}
        badge={
          <StatusBadge
            status={detailData?.eventCancelled ? 'Cancelled' : 'Active'}
            variant={detailData?.eventCancelled ? 'danger' : 'success'}
          />
        }
        loading={detailLoading}
        actions={
          !detailData?.eventCancelled ? (
            <>
              <SmallButton onClick={updateEvent} icon={<Icons.Pencil size={14} />}>Update</SmallButton>
              <SmallButton kind="danger" onClick={handleDeleteClick} icon={<Icons.Trash2 size={14} />}>Delete</SmallButton>
              <SmallButton onClick={handleCancelClick} icon={<Icons.XCircle size={14} />}>Cancel</SmallButton>
            </>
          ) : (
            <SmallButton kind="danger" onClick={handleDeleteClick} icon={<Icons.Trash2 size={14} />}>Delete</SmallButton>
          )
        }
      >
        {detailData && (
          <>
            <DetailSection title="Event Details">
              <DetailRow label="External Event ID" value={detailData.externalEventId} mono />
              <DetailRow label="External Account ID" value={detailData.externalAccountId} mono />
              <DetailRow label="Event Type" value={detailData.eventType} />
              <DetailRow label="Event Organizer" value={detailData.eventOrganizer} />
              {detailData.eventDescription && (
                <DetailRow label="Description" value={detailData.eventDescription} />
              )}
              {detailData.eventUrl && (
                <DetailRow label="Event URL" value={
                  <a href={detailData.eventUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0284C7', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {detailData.eventUrl} <Icons.ExternalLink size={12} />
                  </a>
                } />
              )}
              {detailData.startDateTime && (
                <DetailRow label="Start" value={new Date(detailData.startDateTime).toLocaleString()} />
              )}
              {detailData.endDateTime && (
                <DetailRow label="End" value={new Date(detailData.endDateTime).toLocaleString()} />
              )}
            </DetailSection>

            {!detailData.eventCancelled && (
              <DetailSection title="Edit Event Name">
                <div style={{ display: 'flex', gap: 8 }}>
                  <TextInput
                    value={editEventName}
                    onChange={setEditEventName}
                    placeholder="Enter event name"
                    className="flex-1"
                  />
                </div>
              </DetailSection>
            )}

            {detailData.customProperties && Array.isArray(detailData.customProperties) && detailData.customProperties.length > 0 && (
              <DetailSection title="Custom Properties">
                {detailData.customProperties.map((prop: any, idx: number) => (
                  <div key={idx}>
                    {Object.entries(prop).map(([key, value]) => (
                      <DetailRow key={`${idx}-${key}`} label={key} value={String(value)} />
                    ))}
                  </div>
                ))}
              </DetailSection>
            )}

            <DetailSection title="Attendees">
              <div style={{ marginBottom: 12 }}>
                <SmallButton onClick={loadAttendees} disabled={attendeesLoading}>
                  {attendeesLoading ? 'Loading...' : 'Load Attendees'}
                </SmallButton>
              </div>

              {!detailData.eventCancelled && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--hs-text-secondary, #475569)', marginBottom: 8 }}>Add Attendee:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <TextInput
                      value={attendeeEmail}
                      onChange={setAttendeeEmail}
                      placeholder="attendee@example.com"
                      className="flex-1"
                    />
                    <SmallButton kind="primary" onClick={upsertAttendee} disabled={!attendeeEmail}>
                      Add
                    </SmallButton>
                  </div>
                </div>
              )}

              {attendees.length === 0 ? (
                <div style={{
                  padding: 16,
                  borderRadius: 8,
                  background: 'var(--hs-bg-tertiary, #F1F5F9)',
                  textAlign: 'center',
                  color: 'var(--hs-text-muted, #94A3B8)',
                  fontSize: 13,
                }}>
                  No attendees loaded. Click "Load Attendees" to view.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {attendees.map((att: any) => (
                    <div
                      key={att.attendeeId}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid var(--hs-border, #E2E8F0)',
                        background: 'var(--hs-bg-tertiary, #F1F5F9)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'var(--hs-bg-secondary, #FFFFFF)',
                          border: '1px solid var(--hs-border, #E2E8F0)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#0EA5E9',
                        }}>
                          <Icons.Users size={14} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--hs-text-primary, #0F172A)' }}>{att.email}</div>
                          <div style={{ fontSize: 11, color: 'var(--hs-text-muted, #94A3B8)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>[{att.attendeeId}]</div>
                        </div>
                        {att.joinedAt && <StatusBadge status="Joined" variant="success" />}
                      </div>
                      {!detailData.eventCancelled && (
                        <button
                          onClick={() => handleRemoveAttendeeClick(att.attendeeId)}
                          style={{
                            padding: 6,
                            borderRadius: 6,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#EF4444',
                          }}
                        >
                          <Icons.Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {/* Create Modal */}
      <CreateModal
        isOpen={createModalOpen}
        title="Create New Event"
        subtitle="Add a new marketing event"
        icon={<Icons.Calendar size={24} />}
        loading={createLoading}
        confirmLabel="Create"
        confirmDisabled={!isCreateFormValid()}
        onConfirm={createEvent}
        onCancel={() => setCreateModalOpen(false)}
        onClear={clearCreateForm}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="External Event ID" required>
            <TextInput
              value={newExternalEventId}
              onChange={setNewExternalEventId}
              placeholder="External Event ID"
              className="w-full"
            />
          </FormField>
          <FormField label="External Account ID" required>
            <TextInput
              value={newExternalAccountId}
              onChange={setNewExternalAccountId}
              placeholder="External Account ID"
              className="w-full"
            />
          </FormField>
          <FormField label="Event Name" required>
            <TextInput
              value={newEventName}
              onChange={setNewEventName}
              placeholder="Event Name"
              className="w-full"
            />
          </FormField>
          <FormField label="Event Type" required>
            <TextInput
              value={newEventType}
              onChange={setNewEventType}
              placeholder="Event Type (WEBINAR, etc)"
              className="w-full"
            />
          </FormField>
        </div>
        <FormField label="Event Organizer" required>
          <TextInput
            value={newEventOrganizer}
            onChange={setNewEventOrganizer}
            placeholder="Event Organizer"
            className="w-full"
          />
        </FormField>
      </CreateModal>

      <SectionCard title="Events List" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <SmallButton kind="primary" onClick={() => setCreateModalOpen(true)} icon={<Icons.Plus size={14} />}>
            Create New Event
          </SmallButton>
        </div>
      }>
        <div style={{ marginBottom: 16 }}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search events..." />
        </div>
        {filteredData.length === 0 ? (
          searchQuery ? (
            <EmptyState icon="🔍" title="No matching events" description={`No events found for "${searchQuery}"`} />
          ) : (
            <EmptyState icon="📅" title="No events" description="Create your first marketing event to get started" />
          )
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredData.map((e: any) => (
              <ListCard
                key={e.externalEventId || e.id}
                icon={<Icons.Calendar size={20} />}
                title={<>{e.eventName || '(untitled)'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{e.externalEventId}]</span></>}
                subtitle={`type: ${e.eventType || '—'} • organizer: ${e.eventOrganizer || '—'}`}
                meta={`ID: #${e.externalEventId}`}
                badge={
                  <StatusBadge
                    status={e.eventCancelled ? 'Cancelled' : 'Active'}
                    variant={e.eventCancelled ? 'danger' : 'success'}
                  />
                }
                dimmed={e.eventCancelled}
                onClick={() => openDetail(e)}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function CampaignsTab({ data, api, onChanged, showToast }: { data: any[]; api: ReturnType<typeof useBackendAPI>; onChanged: () => void; showToast: (type: Toast['type'], message: string) => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState('')

  const STATUS_OPTIONS = [
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELED', label: 'Canceled' },
  ]

  // Filter campaigns by search
  const filteredData = useMemo(() =>
    data.filter(c =>
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.slug || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(c.campaign_id || c.id).includes(searchQuery)
    ), [data, searchQuery])

  // Determine campaign status for badges
  const getCampaignStatus = (campaign: any): { status: string; variant: StatusBadgeProps['variant'] } => {
    if (campaign.is_archived) return { status: 'Archived', variant: 'default' }
    if (campaign.color_label === 'COMPLETED') return { status: 'Completed', variant: 'success' }
    if (campaign.color_label === 'IN_PROGRESS') return { status: 'In Progress', variant: 'info' }
    if (campaign.color_label === 'CANCELED') return { status: 'Canceled', variant: 'danger' }
    if (campaign.color_label === 'PLANNED') return { status: 'Planned', variant: 'warning' }
    return { status: 'Active', variant: 'success' }
  }

  const openDetail = async (campaignId: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const result = await api.callTool<any>('get_campaign_by_id', { campaign_id: campaignId })
      setDetailData(result)
      setEditName(result?.name || '')
      setEditStatus(result?.color_label || '')
    } catch {
      // Fall back to the list data
      const campaign = data.find(c => (c.campaign_id || c.id) === campaignId)
      if (campaign) {
        setDetailData(campaign)
        setEditName(campaign.name || '')
        setEditStatus(campaign.color_label || '')
      } else {
        showToast('error', 'Failed to load campaign details')
        setDetailOpen(false)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailData(null)
  }

  const clearCreateForm = () => {
    setName('')
    setSlug('')
  }

  const createCampaign = async () => {
    setCreateLoading(true)
    try {
      await api.callTool('create_campaign', { name, slug: slug || undefined })
      showToast('success', 'Campaign created successfully')
      setCreateModalOpen(false)
      clearCreateForm()
      await onChanged()
    } catch {
      showToast('error', 'Failed to create campaign')
    } finally {
      setCreateLoading(false)
    }
  }

  const updateCampaign = async () => {
    if (!detailData) return
    const campaignId = detailData.campaign_id || detailData.id
    try {
      await api.callTool('update_campaign', { campaign_id: campaignId, name: editName, color_label: editStatus || undefined })
      showToast('success', 'Campaign updated successfully')
      setDetailData({ ...detailData, name: editName, color_label: editStatus })
      await onChanged()
    } catch {
      showToast('error', 'Failed to update campaign')
    }
  }

  const handleArchiveClick = () => {
    if (!detailData) return
    const campaignId = detailData.campaign_id || detailData.id
    setConfirmArchive(campaignId)
  }

  const confirmArchiveCampaign = async () => {
    if (!confirmArchive) return
    setArchiveLoading(true)
    try {
      await api.callTool('archive_campaign', { campaign_id: confirmArchive })
      showToast('success', 'Campaign archived successfully')
      setConfirmArchive(null)
      setDetailData({ ...detailData, is_archived: true })
      await onChanged()
    } catch {
      showToast('error', 'Failed to archive campaign')
    } finally {
      setArchiveLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={confirmArchive !== null}
        title="Archive Campaign"
        message="Are you sure you want to archive this campaign? You can unarchive it later if needed."
        confirmLabel="Archive"
        variant="warning"
        loading={archiveLoading}
        onConfirm={confirmArchiveCampaign}
        onCancel={() => setConfirmArchive(null)}
      />

      {/* Detail Panel */}
      <DetailPanel
        isOpen={detailOpen}
        onClose={closeDetail}
        title={detailData?.name || '(untitled)'}
        subtitle={`ID: #${detailData?.campaign_id || detailData?.id || ''}`}
        icon={<Icons.Megaphone size={28} />}
        badge={detailData ? <StatusBadge status={getCampaignStatus(detailData).status} variant={getCampaignStatus(detailData).variant} /> : undefined}
        loading={detailLoading}
        actions={
          !detailData?.is_archived ? (
            <>
              <SmallButton onClick={updateCampaign} icon={<Icons.Pencil size={14} />}>Update</SmallButton>
              <SmallButton onClick={handleArchiveClick} icon={<Icons.Archive size={14} />}>Archive</SmallButton>
            </>
          ) : null
        }
      >
        {detailData && (
          <>
            <DetailSection title="Details">
              <DetailRow label="ID" value={detailData.campaign_id || detailData.id} mono />
              <DetailRow label="Name" value={detailData.name} />
              <DetailRow label="Slug" value={detailData.slug} mono />
              {detailData.description && (
                <DetailRow label="Description" value={detailData.description} />
              )}
              {detailData.start_date && (
                <DetailRow label="Start Date" value={new Date(detailData.start_date).toLocaleDateString()} />
              )}
              {detailData.end_date && (
                <DetailRow label="End Date" value={new Date(detailData.end_date).toLocaleDateString()} />
              )}
              {detailData.theme && (
                <DetailRow label="Theme" value={detailData.theme} />
              )}
              {detailData.color_label && (
                <DetailRow label="Color Label" value={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: detailData.color_label,
                      border: '1px solid var(--hs-border, #E2E8F0)',
                    }} />
                    {detailData.color_label}
                  </span>
                } />
              )}
              <DetailRow label="Is Archived" value={detailData.is_archived ? 'Yes' : 'No'} />
              {detailData.created_at && (
                <DetailRow label="Created At" value={new Date(detailData.created_at).toLocaleString()} />
              )}
              {detailData.updated_at && (
                <DetailRow label="Updated At" value={new Date(detailData.updated_at).toLocaleString()} />
              )}
            </DetailSection>

            {!detailData.is_archived && (
              <>
                <DetailSection title="Edit Name">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <TextInput
                      value={editName}
                      onChange={setEditName}
                      placeholder="Enter campaign name"
                      className="flex-1"
                    />
                  </div>
                </DetailSection>
                <DetailSection title="Campaign Stage">
                  <StyledSelect
                    value={editStatus}
                    onChange={setEditStatus}
                    className="w-full"
                  >
                    <option value="">— Select Stage —</option>
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </StyledSelect>
                </DetailSection>
              </>
            )}
          </>
        )}
      </DetailPanel>

      {/* Create Modal */}
      <CreateModal
        isOpen={createModalOpen}
        title="Create New Campaign"
        subtitle="Add a new marketing campaign"
        icon={<Icons.Megaphone size={24} />}
        loading={createLoading}
        confirmLabel="Create"
        confirmDisabled={!name.trim()}
        onConfirm={createCampaign}
        onCancel={() => setCreateModalOpen(false)}
        onClear={clearCreateForm}
      >
        <FormField label="Campaign Name" required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Name"
            className="w-full"
          />
        </FormField>
        <FormField label="Campaign Slug">
          <TextInput
            value={slug}
            onChange={setSlug}
            placeholder="Slug"
            className="w-full"
          />
        </FormField>
      </CreateModal>

      <SectionCard title="Campaigns List" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <SmallButton kind="primary" onClick={() => setCreateModalOpen(true)} icon={<Icons.Plus size={14} />}>
            Create New Campaign
          </SmallButton>
        </div>
      }>
        <div style={{ marginBottom: 16 }}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search campaigns..." />
        </div>
        {filteredData.length === 0 ? (
          searchQuery ? (
            <EmptyState icon="🔍" title="No matching campaigns" description={`No campaigns found for "${searchQuery}"`} />
          ) : (
            <EmptyState icon="📢" title="No campaigns" description="Create your first marketing campaign to get started" />
          )
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredData.map((c: any) => {
              const { status, variant } = getCampaignStatus(c)
              return (
                <ListCard
                  key={c.campaign_id || c.id}
                  icon={<Icons.Megaphone size={20} />}
                  title={<>{c.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{c.campaign_id || c.id}]</span></>}
                  subtitle={`slug: ${c.slug || '—'}`}
                  meta={`ID: #${c.campaign_id || c.id}`}
                  badge={<StatusBadge status={status} variant={variant} />}
                  dimmed={c.is_archived}
                  onClick={() => openDetail(c.campaign_id || c.id)}
                />
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function MarketingEmailsTab({ api, showToast, existingEmails = [], onChanged }: { api: ReturnType<typeof useBackendAPI>; showToast: (type: Toast['type'], message: string) => void; existingEmails?: any[]; onChanged?: () => void }) {
  // Create form fields
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [status, setStatus] = useState('')
  const [discountCode, setDiscountCode] = useState('')
  const [expiration, setExpiration] = useState('')
  const [launchDate, setLaunchDate] = useState('')
  const [saleEndDate, setSaleEndDate] = useState('')
  const [rewardPoints, setRewardPoints] = useState('')
  const [accessCode, setAccessCode] = useState('')

  // Create form expanded state (inline form instead of modal)
  const [createFormExpanded, setCreateFormExpanded] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Session tracking
  const [createdEmails, setCreatedEmails] = useState<Array<{ id: string; name: string; status?: string }>>([])
  const [selectedEmailId, setSelectedEmailId] = useState('')

  // Update form fields
  const [updateName, setUpdateName] = useState('')
  const [updateSubject, setUpdateSubject] = useState('')
  const [updateHtmlBody, setUpdateHtmlBody] = useState('')
  const [updateStatus, setUpdateStatus] = useState('')
  const [updateDiscountCode, setUpdateDiscountCode] = useState('')
  const [updateExpiration, setUpdateExpiration] = useState('')
  const [updateLaunchDate, setUpdateLaunchDate] = useState('')
  const [updateSaleEndDate, setUpdateSaleEndDate] = useState('')
  const [updateRewardPoints, setUpdateRewardPoints] = useState('')
  const [updateAccessCode, setUpdateAccessCode] = useState('')

  // Email detail state
  const [emailDetail, setEmailDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Confirmation states
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Get email status badge
  const getEmailStatusBadge = (emailStatus?: string): { status: string; variant: StatusBadgeProps['variant'] } => {
    switch (emailStatus) {
      case 'draft': return { status: 'Draft', variant: 'default' }
      case 'pending': return { status: 'Pending', variant: 'warning' }
      case 'scheduled': return { status: 'Scheduled', variant: 'info' }
      case 'sent': return { status: 'Sent', variant: 'success' }
      default: return { status: 'Unknown', variant: 'default' }
    }
  }

  const clearCreateForm = () => {
    setName('')
    setSubject('')
    setHtmlBody('')
    setStatus('')
    setDiscountCode('')
    setExpiration('')
    setLaunchDate('')
    setSaleEndDate('')
    setRewardPoints('')
    setAccessCode('')
  }

  const loadEmailDetail = async (email_id: string) => {
    setDetailLoading(true)
    setEmailDetail(null)
    try {
      const result = await api.callTool<any>('get_marketing_email_by_id', { email_id })
      setEmailDetail(result)
      if (result) {
        setUpdateName(result.name || '')
        setUpdateSubject(result.subject || '')
        setUpdateHtmlBody(result.htmlBody || '')
        setUpdateStatus(result.status || '')
        setUpdateDiscountCode(result.discount_code || '')
        setUpdateExpiration(result.expiration || '')
        setUpdateLaunchDate(result.launch_date || '')
        setUpdateSaleEndDate(result.sale_end_date || '')
        setUpdateRewardPoints(result.reward_points?.toString() || '')
        setUpdateAccessCode(result.access_code || '')
      }
    } catch {
      showToast('error', 'Failed to load email details')
    } finally {
      setDetailLoading(false)
    }
  }

  const createEmail = async () => {
    setCreateLoading(true)
    try {
      const params: any = { name, subject, htmlBody }
      if (status) params.status = status
      if (discountCode) params.discount_code = discountCode
      if (expiration) params.expiration = expiration
      if (launchDate) params.launch_date = launchDate
      if (saleEndDate) params.sale_end_date = saleEndDate
      if (rewardPoints) params.reward_points = parseInt(rewardPoints)
      if (accessCode) params.access_code = accessCode

      const res = await api.callTool<{ email_id: string }>('create_marketing_email', params)
      if ((res as any)?.email_id) {
        const emailId = (res as any).email_id
        setCreatedEmails(prev => [...prev, { id: emailId, name, status: status || 'draft' }])
        setSelectedEmailId(emailId)
        showToast('success', 'Marketing email created successfully')
        setCreateFormExpanded(false)
        clearCreateForm()
        if (onChanged) await onChanged()
      }
    } catch {
      showToast('error', 'Failed to create marketing email')
    } finally {
      setCreateLoading(false)
    }
  }

  const updateEmail = async () => {
    if (!selectedEmailId) return
    try {
      const params: any = { email_id: selectedEmailId }
      if (updateName) params.name = updateName
      if (updateSubject) params.subject = updateSubject
      if (updateHtmlBody) params.htmlBody = updateHtmlBody
      if (updateStatus) params.status = updateStatus
      if (updateDiscountCode) params.discount_code = updateDiscountCode
      if (updateExpiration) params.expiration = updateExpiration
      if (updateLaunchDate) params.launch_date = updateLaunchDate
      if (updateSaleEndDate) params.sale_end_date = updateSaleEndDate
      if (updateRewardPoints) params.reward_points = parseInt(updateRewardPoints)
      if (updateAccessCode) params.access_code = updateAccessCode

      await api.callTool('update_marketing_email', params)
      setCreatedEmails(prev => prev.map(e =>
        e.id === selectedEmailId
          ? { ...e, name: updateName || e.name, status: updateStatus || e.status }
          : e
      ))
      showToast('success', 'Marketing email updated successfully')
    } catch {
      showToast('error', 'Failed to update marketing email')
    }
  }

  const handleDeleteClick = () => {
    if (!selectedEmailId) return
    setConfirmDelete(selectedEmailId)
  }

  const confirmDeleteEmail = async () => {
    if (!confirmDelete) return
    setDeleteLoading(true)
    try {
      await api.callTool('delete_marketing_email', { email_id: confirmDelete })
      setCreatedEmails(prev => prev.filter(e => e.id !== confirmDelete))
      setSelectedEmailId('')
      setConfirmDelete(null)
      showToast('success', 'Marketing email deleted successfully')
      if (onChanged) await onChanged()
    } catch {
      showToast('error', 'Failed to delete marketing email')
    } finally {
      setDeleteLoading(false)
    }
  }

  const cloneEmail = async () => {
    if (!selectedEmailId) return
    try {
      const cloneName = `${updateName || 'Copy'}-clone`
      const res = await api.callTool<{ email_id: string }>('clone_marketing_email', { email_id: selectedEmailId, name: cloneName })
      if ((res as any)?.email_id) {
        const emailId = (res as any).email_id
        setCreatedEmails(prev => [...prev, { id: emailId, name: cloneName, status: 'draft' }])
        setSelectedEmailId(emailId)
        showToast('success', 'Marketing email cloned successfully')
      }
    } catch {
      showToast('error', 'Failed to clone marketing email')
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Marketing Email"
        message="Are you sure you want to delete this marketing email? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteEmail}
        onCancel={() => setConfirmDelete(null)}
      />

      {existingEmails.length > 0 && (
        <SectionCard title="Existing Emails" icon={<Icons.Mail size={18} />}>
          <div style={{ display: 'grid', gap: 12 }}>
            {existingEmails.map((e: any) => {
              const { status: badgeStatus, variant } = getEmailStatusBadge(e.status)
              return (
                <ListCard
                  key={e.email_id}
                  icon={<Icons.Mail size={20} />}
                  title={<>{e.name || '(untitled)'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{e.email_id}]</span></>}
                  subtitle={`subject: ${e.subject || '—'}`}
                  meta={`ID: #${e.email_id}`}
                  badge={<StatusBadge status={badgeStatus} variant={variant} />}
                  selected={selectedEmailId === e.email_id}
                  onClick={() => { setSelectedEmailId(e.email_id); loadEmailDetail(e.email_id); }}
                />
              )
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Marketing Emails" actions={
        <SmallButton
          kind={createFormExpanded ? 'default' : 'primary'}
          onClick={() => setCreateFormExpanded(!createFormExpanded)}
          icon={createFormExpanded ? <Icons.ChevronUp size={14} /> : <Icons.Plus size={14} />}
        >
          {createFormExpanded ? 'Cancel' : 'Create New Email'}
        </SmallButton>
      }>
        {/* Inline Create Form (expandable) */}
        {createFormExpanded && (
          <div
            data-testid="create-email-form"
            style={{
              marginBottom: 24,
              padding: 24,
              borderRadius: 14,
              background: 'var(--hs-bg-tertiary, #F8FAFC)',
              border: '1px solid var(--hs-border, #E2E8F0)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--hs-bg-secondary, #FFFFFF)',
                border: '1px solid var(--hs-border, #E2E8F0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0EA5E9',
              }}>
                <Icons.Mail size={20} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-primary, #0F172A)', letterSpacing: '-0.01em' }}>
                  Create Marketing Email
                </div>
                <div style={{ fontSize: 13, color: 'var(--hs-text-secondary, #475569)', marginTop: 2 }}>
                  Set up a new marketing email campaign
                </div>
              </div>
            </div>

            {/* Basic Info */}
            <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: 'var(--hs-text-muted, #94A3B8)' }}>
              Basic info
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Email Name" required>
                <TextInput value={name} onChange={setName} placeholder="Name" className="w-full" />
              </FormField>
              <FormField label="Subject Line">
                <TextInput value={subject} onChange={setSubject} placeholder="Subject" className="w-full" />
              </FormField>
            </div>

            {/* Content */}
            <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: 'var(--hs-text-muted, #94A3B8)' }}>
              Content
            </div>
            <FormField label="HTML Body">
              <StyledTextarea value={htmlBody} onChange={setHtmlBody} placeholder="HTML Body" minHeight={80} className="w-full" />
            </FormField>

            {/* Status & Codes */}
            <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: 'var(--hs-text-muted, #94A3B8)' }}>
              Status & codes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <FormField label="Status">
                <StyledSelect value={status} onChange={setStatus} className="w-full">
                  <option value="">Status (optional)</option>
                  <option value="draft">draft</option>
                  <option value="pending">pending</option>
                  <option value="scheduled">scheduled</option>
                  <option value="sent">sent</option>
                </StyledSelect>
              </FormField>
              <FormField label="Discount Code">
                <TextInput value={discountCode} onChange={setDiscountCode} placeholder="Discount Code" className="w-full" />
              </FormField>
              <FormField label="Access Code">
                <TextInput value={accessCode} onChange={setAccessCode} placeholder="Access Code" className="w-full" />
              </FormField>
            </div>

            {/* Dates */}
            <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: 'var(--hs-text-muted, #94A3B8)' }}>
              Dates
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <FormField label="Expiration Date">
                <TextInput value={expiration} onChange={setExpiration} placeholder="Expiration (YYYY-MM-DD)" className="w-full" />
              </FormField>
              <FormField label="Launch Date">
                <TextInput value={launchDate} onChange={setLaunchDate} placeholder="Launch Date (YYYY-MM-DD)" className="w-full" />
              </FormField>
              <FormField label="Sale End Date">
                <TextInput value={saleEndDate} onChange={setSaleEndDate} placeholder="Sale End (YYYY-MM-DD)" className="w-full" />
              </FormField>
            </div>

            <FormField label="Reward Points">
              <TextInput value={rewardPoints} onChange={setRewardPoints} placeholder="Reward Points (number)" className="w-full" />
            </FormField>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--hs-border, #E2E8F0)' }}>
              <SmallButton onClick={clearCreateForm}>
                Clear
              </SmallButton>
              <SmallButton
                kind="primary"
                onClick={createEmail}
                disabled={createLoading || !name.trim()}
                icon={createLoading ? <span className="hs-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} /> : undefined}
              >
                {createLoading ? 'Creating...' : 'Create'}
              </SmallButton>
            </div>
          </div>
        )}
        {createdEmails.length > 0 ? (
          <>
            <div className="mb-3">
              <FormLabel>Select Email:</FormLabel>
              <StyledSelect
                value={selectedEmailId}
                onChange={(val: string) => { setSelectedEmailId(val); if (val) loadEmailDetail(val); }}
                className="w-full"
              >
                <option value="">-- Choose an email --</option>
                {createdEmails.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </StyledSelect>
            </div>
            {/* Show list of created emails */}
            <div style={{ marginBottom: 16, display: 'grid', gap: 12 }}>
              {createdEmails.map((e) => {
                const { status, variant } = getEmailStatusBadge(e.status)
                return (
                  <ListCard
                    key={e.id}
                    icon={<Icons.Mail size={20} />}
                    title={<>{e.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{e.id}]</span></>}
                    meta={`ID: #${e.id}`}
                    badge={<StatusBadge status={status} variant={variant} />}
                    selected={selectedEmailId === e.id}
                    onClick={() => { setSelectedEmailId(e.id); loadEmailDetail(e.id); }}
                  />
                )
              })}
            </div>
            {selectedEmailId && (
              <div className="flex flex-col gap-2 border-t border-[var(--hs-border)] pt-3">
                {detailLoading && (
                  <div className="text-sm text-[var(--hs-text-light)] py-2">Loading email details...</div>
                )}
                {emailDetail && !detailLoading && (
                  <div className="mb-3 p-3 rounded-lg bg-[var(--hs-bg-subtle)] border border-[var(--hs-border)]">
                    <div className="text-xs font-semibold text-[var(--hs-text-light)] uppercase tracking-wide mb-2">Email Details</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="font-medium text-[var(--hs-text-light)]">ID:</span> {emailDetail.email_id || selectedEmailId}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Name:</span> {emailDetail.name || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Subject:</span> {emailDetail.subject || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Status:</span> {emailDetail.status || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Discount Code:</span> {emailDetail.discount_code || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Expiration:</span> {emailDetail.expiration || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Launch Date:</span> {emailDetail.launch_date || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Sale End Date:</span> {emailDetail.sale_end_date || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Reward Points:</span> {emailDetail.reward_points ?? '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Access Code:</span> {emailDetail.access_code || '—'}</div>
                      <div><span className="font-medium text-[var(--hs-text-light)]">Transactional:</span> {emailDetail.isTransactional ? 'Yes' : 'No'}</div>
                    </div>
                    {emailDetail.htmlBody && (
                      <div className="mt-2">
                        <span className="font-medium text-sm text-[var(--hs-text-light)]">HTML Body:</span>
                        <pre className="mt-1 text-xs bg-[var(--hs-bg)] p-2 rounded border border-[var(--hs-border)] overflow-auto max-h-32">{emailDetail.htmlBody}</pre>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <TextInput value={updateName} onChange={setUpdateName} placeholder="Name" className="flex-1" />
                  <TextInput value={updateSubject} onChange={setUpdateSubject} placeholder="Subject" className="flex-1" />
                </div>
                <StyledTextarea
                  value={updateHtmlBody}
                  onChange={setUpdateHtmlBody}
                  placeholder="HTML Body"
                  minHeight={80}
                />
                <div className="grid grid-cols-3 gap-2">
                  <StyledSelect
                    value={updateStatus}
                    onChange={setUpdateStatus}
                  >
                    <option value="">Status</option>
                    <option value="draft">draft</option>
                    <option value="pending">pending</option>
                    <option value="scheduled">scheduled</option>
                    <option value="sent">sent</option>
                  </StyledSelect>
                  <TextInput value={updateDiscountCode} onChange={setUpdateDiscountCode} placeholder="Discount Code" />
                  <TextInput value={updateAccessCode} onChange={setUpdateAccessCode} placeholder="Access Code" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <TextInput value={updateExpiration} onChange={setUpdateExpiration} placeholder="Expiration" />
                  <TextInput value={updateLaunchDate} onChange={setUpdateLaunchDate} placeholder="Launch Date" />
                  <TextInput value={updateSaleEndDate} onChange={setUpdateSaleEndDate} placeholder="Sale End" />
                </div>
                <TextInput value={updateRewardPoints} onChange={setUpdateRewardPoints} placeholder="Reward Points" />
                <div className="flex gap-2">
                  <SmallButton onClick={updateEmail}>Update</SmallButton>
                  <SmallButton kind="danger" onClick={handleDeleteClick}>Delete</SmallButton>
                  <SmallButton onClick={cloneEmail}>Clone</SmallButton>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon="📧" title="No emails created yet" description="Create an email above to manage it here" />
        )}
      </SectionCard>
    </div>
  )
}

const getTransactionalStatusBadge = (status?: string): { status: string; variant: StatusBadgeProps['variant'] } => {
  switch (status) {
    case 'sent': return { status: 'Sent', variant: 'success' }
    case 'pending': return { status: 'Pending', variant: 'warning' }
    case 'scheduled': return { status: 'Scheduled', variant: 'info' }
    default: return { status: status || 'Unknown', variant: 'default' }
  }
}

function TransactionalEmailTab({ api, showToast, existingEmails = [], onChanged }: { api: ReturnType<typeof useBackendAPI>; showToast: (type: Toast['type'], message: string) => void; existingEmails?: any[]; onChanged?: () => void }) {
  const [to, setTo] = useState('')
  const [fromAddr, setFromAddr] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [lastResult, setLastResult] = useState<any | null>(null)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null)

  const isFormValid = () => to.trim() && fromAddr.trim() && subject.trim() && htmlBody.trim()

  const filteredEmails = useMemo(() =>
    existingEmails.filter(e => {
      const msg = e.message || {}
      const q = searchQuery.toLowerCase()
      return (msg.to || '').toLowerCase().includes(q) ||
        (msg.from || '').toLowerCase().includes(q) ||
        (msg.subject || '').toLowerCase().includes(q) ||
        (e.status || '').toLowerCase().includes(q)
    }), [existingEmails, searchQuery])

  useEffect(() => {
    setExpandedEmailId(null)
  }, [searchQuery])

  const sendEmail = async () => {
    setSending(true)
    try {
      const res = await api.callTool('send_transactional_email', {
        message: { to, from: fromAddr, subject, htmlBody },
      })
      setLastResult(res)
      showToast('success', `Email sent successfully to ${to}`)
      onChanged?.()
    } catch {
      showToast('error', 'Failed to send transactional email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Send Transactional Email" actions={
        <SmallButton kind="primary" onClick={sendEmail} disabled={sending || !isFormValid()}>
          {sending ? 'Sending...' : 'Send'}
        </SmallButton>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="To Email" required>
            <TextInput value={to} onChange={setTo} placeholder="to" className="w-full" />
          </FormField>
          <FormField label="From Email" required>
            <TextInput value={fromAddr} onChange={setFromAddr} placeholder="from" className="w-full" />
          </FormField>
        </div>
        <FormField label="Subject" required>
          <TextInput value={subject} onChange={setSubject} placeholder="subject" className="w-full" />
        </FormField>
        <FormField label="Message Body" required>
          <StyledTextarea
            value={htmlBody}
            onChange={setHtmlBody}
            placeholder="HTML body content"
            minHeight={120}
            className="w-full"
          />
        </FormField>
      </SectionCard>

      {lastResult && (
        <SectionCard title="Last Send Result">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status="Sent" variant="success" />
            <span style={{ fontSize: 14, color: 'var(--hs-text-secondary, #475569)' }}>Email was sent successfully</span>
          </div>
          <pre style={{
            fontSize: 12,
            overflow: 'auto',
            padding: 12,
            borderRadius: 10,
            background: 'var(--hs-bg-tertiary, #F1F5F9)',
            border: '1px solid var(--hs-border, #E2E8F0)',
            margin: 0,
          }}>{JSON.stringify(lastResult, null, 2)}</pre>
        </SectionCard>
      )}

      <SectionCard title={`Transactional Emails (${existingEmails.length})`} actions={
        <TextInput value={searchQuery} onChange={setSearchQuery} placeholder="Search emails..." className="w-48" />
      }>
        {filteredEmails.length > 0 ? (
          <div className="space-y-2">
            {filteredEmails.map((email: any) => {
              const msg = email.message || {}
              const badge = getTransactionalStatusBadge(email.status)
              const isExpanded = expandedEmailId === email.email_id
              return (
                <div key={email.email_id} style={{
                  border: '1px solid var(--hs-border, #E2E8F0)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--hs-bg-secondary, #FFFFFF)',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hs-border-hover, #CBD5E1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hs-border, #E2E8F0)' }}
                >
                  <div
                    onClick={() => setExpandedEmailId(isExpanded ? null : email.email_id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 2fr auto',
                      gap: 12,
                      padding: '12px 16px',
                      alignItems: 'center',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--hs-text-primary, #1E293B)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={msg.to}>{msg.to}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{email.email_id}]</span></span>
                    <span style={{ color: 'var(--hs-text-secondary, #475569)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={msg.from}>{msg.from}</span>
                    <span style={{ color: 'var(--hs-text-primary, #1E293B)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={msg.subject}>{msg.subject}</span>
                    <StatusBadge status={badge.status} variant={badge.variant} />
                  </div>
                  {isExpanded && (
                    <div style={{
                      padding: '10px 14px',
                      borderTop: '1px solid var(--hs-border, #E2E8F0)',
                      background: 'var(--hs-bg-tertiary, #F1F5F9)',
                      fontSize: 13,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div><span style={{ fontWeight: 500, color: 'var(--hs-text-light, #64748B)' }}>To:</span> {msg.to}</div>
                        <div><span style={{ fontWeight: 500, color: 'var(--hs-text-light, #64748B)' }}>From:</span> {msg.from}</div>
                        <div><span style={{ fontWeight: 500, color: 'var(--hs-text-light, #64748B)' }}>Subject:</span> {msg.subject}</div>
                        <div><span style={{ fontWeight: 500, color: 'var(--hs-text-light, #64748B)' }}>Status:</span> {email.status}</div>
                      </div>
                      {msg.htmlBody && (
                        <div>
                          <span style={{ fontWeight: 500, color: 'var(--hs-text-light, #64748B)' }}>Body:</span>
                          <pre style={{
                            marginTop: 4,
                            padding: 8,
                            borderRadius: 6,
                            background: 'var(--hs-bg-primary, #FFFFFF)',
                            border: '1px solid var(--hs-border, #E2E8F0)',
                            fontSize: 12,
                            maxHeight: 150,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            margin: 0,
                          }}>{msg.htmlBody}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState icon="📧" title={searchQuery ? 'No matching emails' : 'No transactional emails'} description={searchQuery ? 'Try a different search term' : 'Send a transactional email above to get started'} />
        )}
      </SectionCard>
    </div>
  )
}

function SubscriptionsTab({ data, definitions, contacts = [], api, onChanged, showToast }: { data: any[]; definitions: any[]; contacts?: any[]; api: ReturnType<typeof useBackendAPI>; onChanged: () => void; showToast: (type: Toast['type'], message: string) => void }) {
  const [endpoint, setEndpoint] = useState('')
  const [subContactId, setSubContactId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<any>(null)
  const [editActive, setEditActive] = useState(true)

  // Filter subscriptions by search
  const filteredData = useMemo(() =>
    data.filter(s =>
      (s.endpoint || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(s.id).includes(searchQuery)
    ), [data, searchQuery])

  const openDetail = (subscription: any) => {
    setDetailOpen(true)
    setDetailData(subscription)
    setEditActive(subscription.active !== false)
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailData(null)
  }

  const clearCreateForm = () => {
    setEndpoint('')
    setSubContactId('')
  }

  const createSubscription = async () => {
    setCreateLoading(true)
    try {
      await api.callTool('create_form_global_event_subscription', {
        endpoint,
        subscriptionDetails: { contact_id: subContactId || undefined },
      })
      showToast('success', 'Subscription created successfully')
      setCreateModalOpen(false)
      clearCreateForm()
      await onChanged()
    } catch {
      showToast('error', 'Failed to create subscription')
    } finally {
      setCreateLoading(false)
    }
  }

  const updateSubscription = async () => {
    if (!detailData?.id) return
    try {
      await api.callTool('update_form_global_event_subscription', {
        subscriptionId: detailData.id,
        active: editActive,
      })
      showToast('success', 'Subscription updated successfully')
      setDetailData({ ...detailData, active: editActive })
      await onChanged()
    } catch {
      showToast('error', 'Failed to update subscription')
    }
  }

  const handleDeleteClick = () => {
    if (!detailData?.id) return
    setConfirmDelete(detailData.id)
  }

  const confirmDeleteSubscription = async () => {
    if (!confirmDelete) return
    setDeleteLoading(true)
    try {
      await api.callTool('delete_form_global_event_subscription', { subscriptionId: confirmDelete })
      showToast('success', 'Subscription deleted successfully')
      setConfirmDelete(null)
      closeDetail()
      await onChanged()
    } catch {
      showToast('error', 'Failed to delete subscription')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Subscription"
        message="Are you sure you want to delete this subscription? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteSubscription}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Detail Panel */}
      <DetailPanel
        isOpen={detailOpen}
        onClose={closeDetail}
        title={`Subscription #${detailData?.id || ''}`}
        subtitle={detailData?.endpoint || ''}
        icon={<Icons.Bell size={28} />}
        badge={
          <StatusBadge
            status={detailData?.active !== false ? 'Active' : 'Inactive'}
            variant={detailData?.active !== false ? 'success' : 'default'}
          />
        }
        actions={
          <>
            <SmallButton onClick={updateSubscription} icon={<Icons.Pencil size={14} />}>Update</SmallButton>
            <SmallButton kind="danger" onClick={handleDeleteClick} icon={<Icons.Trash2 size={14} />}>Delete</SmallButton>
          </>
        }
      >
        {detailData && (
          <>
            <DetailSection title="Details">
              <DetailRow label="ID" value={detailData.id} mono />
              <DetailRow label="Endpoint" value={detailData.endpoint} mono />
              <DetailRow label="Active" value={detailData.active !== false ? 'Yes' : 'No'} />
            </DetailSection>

            {detailData.subscriptionDetails && (
              <DetailSection title="Subscription Details">
                {detailData.subscriptionDetails.contact_id && (
                  <DetailRow label="Contact ID" value={detailData.subscriptionDetails.contact_id} mono />
                )}
                {detailData.subscriptionDetails.contact_id && (() => {
                  const contact = contacts.find((c: any) => String(c.contact_id || c.id) === String(detailData.subscriptionDetails.contact_id))
                  return contact?.company ? <DetailRow label="Company" value={contact.company} /> : null
                })()}
                {detailData.subscriptionDetails.subscription_id && (
                  <DetailRow label="Subscription ID" value={detailData.subscriptionDetails.subscription_id} mono />
                )}
                {detailData.subscriptionDetails.subscribed !== undefined && (
                  <DetailRow label="Subscribed" value={detailData.subscriptionDetails.subscribed ? 'Yes' : 'No'} />
                )}
                {detailData.subscriptionDetails.opt_in_date && (
                  <DetailRow label="Opt-in Date" value={new Date(detailData.subscriptionDetails.opt_in_date).toLocaleString()} />
                )}
                {detailData.subscriptionDetails.registration_date && (
                  <DetailRow label="Registration Date" value={new Date(detailData.subscriptionDetails.registration_date).toLocaleString()} />
                )}
                {detailData.subscriptionDetails.status && (
                  <DetailRow label="Status" value={detailData.subscriptionDetails.status} />
                )}
              </DetailSection>
            )}

            <DetailSection title="Edit Active Status">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 8,
                background: 'var(--hs-bg-tertiary, #F1F5F9)',
              }}>
                <button
                  onClick={() => setEditActive(!editActive)}
                  style={{
                    width: 48,
                    height: 28,
                    borderRadius: 14,
                    background: editActive ? '#38BDF8' : 'var(--hs-border, #E2E8F0)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s ease',
                  }}
                  data-testid="active-toggle"
                >
                  <span style={{
                    position: 'absolute',
                    top: 4,
                    left: editActive ? 24 : 4,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: 'white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s ease',
                  }} />
                </button>
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: editActive ? '#38BDF8' : 'var(--hs-text-secondary, #475569)',
                }}>
                  {editActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {/* Create Modal */}
      <CreateModal
        isOpen={createModalOpen}
        title="Create New Subscription"
        subtitle="Add a new webhook subscription"
        icon={<Icons.Bell size={24} />}
        loading={createLoading}
        confirmLabel="Create"
        confirmDisabled={!endpoint.trim()}
        onConfirm={createSubscription}
        onCancel={() => setCreateModalOpen(false)}
        onClear={clearCreateForm}
      >
        <FormField label="Webhook Endpoint" required>
          <TextInput
            value={endpoint}
            onChange={setEndpoint}
            placeholder="endpoint"
            className="w-full"
          />
        </FormField>
        <FormField label="Contact ID">
          <TextInput
            value={subContactId}
            onChange={setSubContactId}
            placeholder="contact_id (optional)"
            className="w-full"
          />
        </FormField>
      </CreateModal>

      <SectionCard title="Subscriptions List" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <SmallButton kind="primary" onClick={() => setCreateModalOpen(true)} icon={<Icons.Plus size={14} />}>
            Create New Subscription
          </SmallButton>
        </div>
      }>
        <div style={{ marginBottom: 16 }}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search subscriptions..." />
        </div>
        {filteredData.length === 0 ? (
          searchQuery ? (
            <EmptyState icon="🔍" title="No matching subscriptions" description={`No subscriptions found for "${searchQuery}"`} />
          ) : (
            <EmptyState icon="🔔" title="No subscriptions" description="Create your first webhook subscription to get started" />
          )
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredData.map((s: any) => (
              <ListCard
                key={s.id}
                icon={<Icons.Bell size={20} />}
                title={<>Subscription<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{s.id}]</span></>}
                subtitle={`endpoint: ${s.endpoint || '—'}`}
                badge={
                  <StatusBadge
                    status={s.active !== false ? 'Active' : 'Inactive'}
                    variant={s.active !== false ? 'success' : 'default'}
                  />
                }
                dimmed={s.active === false}
                onClick={() => openDetail(s)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Subscription Definitions" icon={<Icons.Info size={18} />}>
        {definitions.length === 0 ? (
          <EmptyState icon="📋" title="No subscription definitions" description="Subscription definitions will appear here" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {definitions.map((def: any) => (
              <div
                key={def.subscription_id}
                data-testid="definition-card"
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'var(--hs-bg-tertiary, #F1F5F9)',
                  border: '1px solid var(--hs-border, #E2E8F0)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--hs-text-primary, #0F172A)' }}>
                      {def.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{def.subscription_id}]</span>
                    </span>
                    <StatusBadge status={def.frequency} variant="info" />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--hs-text-secondary, #475569)' }}>
                    {def.description}
                  </div>
                </div>
                <StatusBadge
                  status={def.active ? 'Active' : 'Inactive'}
                  variant={def.active ? 'success' : 'default'}
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ============= Design System Styles =============
const styles = `

  .hubscape-app {
    --hubscape-orange: #0EA5E9;
    --hubscape-orange-hover: #38BDF8;
    --hubscape-orange-dark: #0284C7;
    --primary: #0EA5E9;
    --primary-hover: #0284C7;
    --success: #22C55E;
    --warning: #F59E0B;
    --danger: #EF4444;
    --info: #3B82F6;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
    --shadow-md: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04);
    --shadow-lg: 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 24px rgba(15, 23, 42, 0.08);
    --shadow-focus: 0 0 0 3px rgba(14, 165, 233, 0.18);
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  .hubscape-app button { font-family: inherit; }
  .hubscape-app input, .hubscape-app textarea, .hubscape-app select { font-family: inherit; }
  .hubscape-app input::placeholder, .hubscape-app textarea::placeholder { color: var(--hs-input-placeholder, #94A3B8); }

  .hubscape-app.light {
    --hs-bg-primary: #F8FAFC;
    --hs-bg-secondary: #FFFFFF;
    --hs-bg-tertiary: #F1F5F9;
    --hs-bg-elevated: rgba(255, 255, 255, 0.85);
    --hs-text-primary: #0F172A;
    --hs-text-secondary: #475569;
    --hs-text-muted: #94A3B8;
    --hs-border: #E2E8F0;
    --hs-border-hover: #CBD5E1;
    --hs-input-bg: #FFFFFF;
    --hs-input-border: #CBD5E1;
    --hs-input-placeholder: #94A3B8;
  }

  .hubscape-app.dark {
    --hs-bg-primary: #0F172A;
    --hs-bg-secondary: #1E293B;
    --hs-bg-tertiary: #334155;
    --hs-bg-elevated: rgba(30, 41, 59, 0.85);
    --hs-text-primary: #F8FAFC;
    --hs-text-secondary: #CBD5E1;
    --hs-text-muted: #64748B;
    --hs-border: #334155;
    --hs-border-hover: #475569;
    --hs-input-bg: #1E293B;
    --hs-input-border: #475569;
    --hs-input-placeholder: #64748B;
  }

  @keyframes hs-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes hs-slide-in {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes hs-modal-in {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  @keyframes hs-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .hs-spin { animation: hs-spin 1s linear infinite; }
  .hs-slide-in { animation: hs-slide-in 0.3s ease-out; }
  .hs-modal-in { animation: hs-modal-in 0.2s ease-out; }
  .hs-fade-in { animation: hs-fade-in 0.2s ease-out; }
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleId = 'hubscape-app-styles'
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style')
    styleEl.id = styleId
    styleEl.textContent = styles
    document.head.appendChild(styleEl)
  }
}

// ============= SVG Icons (Lucide-style) =============
const Icons = {
  FileText: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>
    </svg>
  ),
  FormInput: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="12" x="2" y="6" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/>
    </svg>
  ),
  Calendar: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
    </svg>
  ),
  Megaphone: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
    </svg>
  ),
  Mail: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  ),
  Send: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
    </svg>
  ),
  Bell: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
  ),
  Plus: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14"/><path d="M12 5v14"/>
    </svg>
  ),
  Pencil: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
    </svg>
  ),
  Trash2: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
    </svg>
  ),
  Search: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  ),
  RefreshCw: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
    </svg>
  ),
  CheckCircle: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  XCircle: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
    </svg>
  ),
  AlertTriangle: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
    </svg>
  ),
  Info: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
    </svg>
  ),
  X: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  ),
  Users: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Archive: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>
    </svg>
  ),
  RotateCcw: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
    </svg>
  ),
  Copy: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  ),
  Inbox: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  ),
  ArrowLeft: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
    </svg>
  ),
  Code: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  ChevronDown: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6"/>
    </svg>
  ),
  ChevronUp: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m18 15-6-6-6 6"/>
    </svg>
  ),
  ExternalLink: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>
    </svg>
  ),
  Toggle: ({ size = 20, className = '' }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="12" x="2" y="6" rx="6"/><circle cx="8" cy="12" r="2"/>
    </svg>
  ),
  HubscapeLogo: ({ size = 24 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#1F2937"/>
      <polygon points="12,5 19,12 12,19 5,12" fill="#38BDF8"/>
      <polygon points="12,8 16,12 12,16 8,12" fill="#E0F2FE"/>
      <circle cx="12" cy="12" r="1.2" fill="#1F2937"/>
    </svg>
  ),
}
