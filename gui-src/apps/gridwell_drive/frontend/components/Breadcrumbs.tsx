import type { Breadcrumb } from './types'

interface BreadcrumbsProps {
  breadcrumbs: Breadcrumb[]
  onNavigate: (index: number) => void
}

export function Breadcrumbs({ breadcrumbs, onNavigate }: BreadcrumbsProps) {
  if (breadcrumbs.length === 0) return null
  return (
    <div className="mb-4 flex items-center space-x-2 text-sm">
      {breadcrumbs.map((crumb, index) => (
        <div key={index} className="flex items-center">
          {index > 0 && (
            <svg className="w-4 h-4 text-[#5f6368] mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <button
            onClick={() => onNavigate(index)}
            className={`px-2 py-1 rounded hover:bg-[#F0FDFA] transition-colors ${
              index === breadcrumbs.length - 1
                ? 'text-[#202124] font-medium'
                : 'text-[#5f6368] hover:text-[#202124]'
            }`}
          >
            {crumb.name}
          </button>
        </div>
      ))}
    </div>
  )
}
