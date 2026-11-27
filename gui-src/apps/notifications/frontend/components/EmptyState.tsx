import { Bell } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-24 h-24 bg-[var(--accent-color)]/10 rounded-full flex items-center justify-center mb-6">
        <Bell className="w-12 h-12 text-[var(--accent-color)]/60" />
      </div>
      <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
        All Caught Up!
      </h2>
      <p className="text-[var(--text-secondary)] text-center max-w-sm">
        You have no new notifications. We'll let you know when something arrives.
      </p>
    </div>
  )
}
