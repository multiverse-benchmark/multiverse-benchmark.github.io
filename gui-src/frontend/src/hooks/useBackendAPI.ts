import { useState, useCallback } from 'react'

async function parseJsonSafely(res: Response) {
  const text = await res.text();
  if (!text) return {} as any;
  try {
    return JSON.parse(text);
  } catch {
    const ct = res.headers.get('content-type') || '';
    const preview = text.slice(0, 400);
    throw new Error(`API returned invalid JSON (status ${res.status}, content-type ${ct}). Body: ${preview}`);
  }
}


const API_BASE_URL = './api'

// Custom event for notifying when backend state may have changed
export const BACKEND_STATE_CHANGED_EVENT = 'backend-state-changed'

export function dispatchBackendStateChanged(toolName?: string) {
  window.dispatchEvent(new CustomEvent(BACKEND_STATE_CHANGED_EVENT, { detail: { toolName } }))
}

interface BatchCall {
  tool_name: string
  arguments: Record<string, unknown>
}

interface BatchResult<T = unknown> {
  success: boolean
  result?: T
  error?: string
}

interface UseBackendAPIReturn {
  callTool: <T = unknown>(toolName: string, params: Record<string, unknown>) => Promise<T>
  batchCallTool: <T = unknown>(calls: BatchCall[]) => Promise<BatchResult<T>[]>
  loading: boolean
  error: string | null
}

export function useBackendAPI(serviceName: string): UseBackendAPIReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callTool = useCallback(async <T = unknown>(toolName: string, params: Record<string, unknown>): Promise<T> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${API_BASE_URL}/services/${serviceName}/tools/${toolName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ params }),
        }
      )

      if (!response.ok) {
        const errorData = await parseJsonSafely(response).catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || `HTTP error: ${response.status}`)
      }

      const data = await parseJsonSafely(response)

      // Notify that backend state may have changed
      // Static snapshots never mutate; read calls must not trigger refresh loops.

      return data.result
    } catch (err) {
      const message = err instanceof Error ? err?.message : 'Unknown error'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [serviceName])

  const batchCallTool = useCallback(async <T = unknown>(calls: BatchCall[]): Promise<BatchResult<T>[]> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${API_BASE_URL}/services/${serviceName}/batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ calls }),
        }
      )

      if (!response.ok) {
        const errorData = await parseJsonSafely(response).catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || `HTTP error: ${response.status}`)
      }

      const data = await parseJsonSafely(response)

      // Static snapshots never mutate; read calls must not trigger refresh loops.

      return data.results
    } catch (err) {
      const message = err instanceof Error ? err?.message : 'Unknown error'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [serviceName])

  return { callTool, batchCallTool, loading, error }
}
