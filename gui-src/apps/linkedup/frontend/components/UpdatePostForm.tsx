import { useState } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

interface Post {
  id: string
  author: string
  commentary: string
  visibility: string
  lifecycleState?: string
  created?: { time: number }
}

interface UpdatePostFormProps {
  post: Post
  onUpdated: (post: Post) => void
  onCancel: () => void
}

export function UpdatePostForm({ post, onUpdated, onCancel }: UpdatePostFormProps) {
  const [commentary, setCommentary] = useState(post.commentary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useBackendAPI('linkedup')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentary.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Extract raw numeric ID from URN format for API compatibility
      const rawId = post.id.startsWith('urn:li:ugcPost:') ? post.id.replace('urn:li:ugcPost:', '') : post.id
      const result = await api.callTool('update_post', {
        post_id: rawId,
        post_data: {
          commentary: commentary.trim(),
          lifecycleState: 'PUBLISHED'
        }
      })

      if (result?.data) {
        onUpdated(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update post')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-6 bg-stone-50 ring-1 ring-stone-200/60">
      <h2 className="text-lg font-semibold text-gray-900 mb-5 tracking-tight">Edit Post</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Post ID</label>
          <p className="text-gray-900 font-mono text-sm bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60">
            {post.id}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Author</label>
          <p className="text-gray-900 font-mono text-sm bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60">
            {post.author}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Commentary</label>
          <textarea
            value={commentary}
            onChange={(e) => setCommentary(e.target.value)}
            className="w-full bg-white border border-stone-200/70 rounded-xl px-3.5 py-3 text-gray-900 resize-none transition-all focus:outline-none focus:border-[#B91C1C]/40 focus:ring-2 focus:ring-[#B91C1C]/20 min-h-[120px] leading-relaxed"
            rows={5}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Visibility (read-only)</label>
            <p className="text-gray-900 font-medium bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60 capitalize">
              {post.visibility?.toLowerCase()}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">State</label>
            <p className="text-gray-900 font-medium bg-white rounded-lg px-3.5 py-2.5 ring-1 ring-stone-200/60">
              {post.lifecycleState || 'N/A'}
            </p>
          </div>
        </div>

        {error && (
          <div className="text-red-700 text-sm bg-red-50 rounded-lg px-3.5 py-2.5 ring-1 ring-red-200/60">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-3">
          <button
            type="submit"
            disabled={loading || !commentary.trim()}
            className="px-5 py-2 bg-[#B91C1C] text-white rounded-full text-sm font-semibold hover:bg-[#7F1D1D] transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 bg-white hover:bg-stone-100 text-gray-700 rounded-full text-sm font-medium transition-colors ring-1 ring-stone-200/60"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
