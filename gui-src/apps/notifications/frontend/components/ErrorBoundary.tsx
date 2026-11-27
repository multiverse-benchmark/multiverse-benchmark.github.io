import { Component, ReactNode } from 'react'
import { Bell } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-[var(--bg-primary)] p-6">
          <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-[var(--border-color)]">
            <div className="w-16 h-16 bg-[var(--danger-color)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-[var(--danger-color)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              Something went wrong
            </h2>
            <p className="text-[var(--text-secondary)] mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[var(--accent-color)] text-white rounded-xl hover:bg-[var(--accent-hover)] transition-colors font-medium shadow-sm"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
