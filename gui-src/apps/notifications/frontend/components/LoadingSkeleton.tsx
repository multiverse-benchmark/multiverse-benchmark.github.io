export function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm border border-[var(--border-color)]">
          <div className="flex items-start space-x-3">
            <div className="w-12 h-12 bg-[var(--bg-tertiary)] rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[var(--bg-tertiary)] rounded w-1/4" />
              <div className="h-3 bg-[var(--bg-tertiary)] rounded w-3/4" />
              <div className="h-3 bg-[var(--bg-tertiary)] rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
