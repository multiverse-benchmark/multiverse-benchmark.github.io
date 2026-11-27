import { useState } from 'react'
import { getAvatarColor } from '../avatarColor'

interface Post {
  id: string
  author: string
  commentary: string
  visibility: string
  lifecycleState?: string
  created?: { time: number }
}

interface PostCardProps {
  post: Post
  authorName?: string
  showAuthor?: boolean
  onEdit?: (post: Post) => void
  onDelete?: (post: Post) => void
  onAuthorClick?: (authorUrn: string) => void
  isDeleting?: boolean
}

export function PostCard({ post, authorName, showAuthor = false, onEdit, onDelete, onAuthorClick, isDeleting = false }: PostCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const getAuthorInitial = () => {
    if (authorName) return authorName.charAt(0).toUpperCase()
    if (post.author.includes('person')) return 'P'
    if (post.author.includes('organization')) return 'O'
    return '?'
  }

  const getAuthorDisplayName = () => {
    if (authorName) return authorName
    const match = post.author.match(/urn:li:(person|organization):(.+)/)
    if (match) {
      return `${match[1] === 'person' ? 'Person' : 'Organization'} ${match[2]}`
    }
    return post.author
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.06)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.06),0_2px_4px_rgba(15,23,42,0.05)] transition-shadow duration-200">
      {/* Author Header */}
      {showAuthor && (
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={onAuthorClick ? () => onAuthorClick(post.author) : undefined}
            className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold shadow-sm ${onAuthorClick ? 'cursor-pointer hover:scale-105 transition-transform' : 'cursor-default'}`}
            style={{ backgroundColor: getAvatarColor(post.author) }}
            aria-label={onAuthorClick ? `View ${getAuthorDisplayName()}` : undefined}
            disabled={!onAuthorClick}
          >
            {getAuthorInitial()}
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 leading-tight">
              {onAuthorClick ? (
                <button
                  type="button"
                  onClick={() => onAuthorClick(post.author)}
                  className="hover:text-[#B91C1C] transition-colors text-left"
                >
                  {getAuthorDisplayName()}
                </button>
              ) : getAuthorDisplayName()}
              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{post.id}]</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDate(post.created?.time)}
              {post.visibility && (
                <span className="ml-2 capitalize">
                  · {post.visibility.toLowerCase()}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Post Content */}
      <div className="mb-4">
        <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{post.commentary}</p>
      </div>

      {/* Post Meta */}
      <div className="flex items-center justify-between text-sm text-gray-500 mb-1">
        <div className="flex items-center gap-3 flex-wrap">
          {!showAuthor && (
            <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{post.id}]</span>
          )}
          {post.lifecycleState && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${
              post.lifecycleState === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
              post.lifecycleState === 'DRAFT' ? 'bg-stone-200 text-gray-700' :
              'bg-amber-100 text-amber-800'
            }`}>
              {post.lifecycleState}
            </span>
          )}
          <span className="capitalize text-xs">{post.visibility?.toLowerCase()}</span>
        </div>
        {!showAuthor && post.created?.time && (
          <span className="text-xs">{formatDate(post.created.time)}</span>
        )}
      </div>

      {/* Actions */}
      {(onEdit || onDelete) && (
        <div className="pt-4 mt-3 border-t border-stone-100 flex gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(post)}
              className="px-3.5 py-1.5 text-sm text-[#B91C1C] bg-[#B91C1C]/8 hover:bg-[#B91C1C] hover:text-white rounded-full font-semibold transition-all"
              style={{ backgroundColor: 'rgba(185,28,28,0.08)' }}
            >
              Edit
            </button>
          )}
          {onDelete && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3.5 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-full font-semibold transition-colors"
            >
              Delete
            </button>
          )}
          {onDelete && showDeleteConfirm && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Delete this post?</span>
              <button
                onClick={() => onDelete(post)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-sm text-white bg-red-600 rounded-full font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                {isDeleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-1.5 text-sm text-gray-700 bg-stone-100 hover:bg-stone-200 rounded-full font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
