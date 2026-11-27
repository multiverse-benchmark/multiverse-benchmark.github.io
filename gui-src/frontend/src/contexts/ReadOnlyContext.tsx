import { createContext, useContext } from 'react'

// Only an explicit backend opt-out enables editing controls.
export const ReadOnlyContext = createContext(true)

export function useReadOnly() {
  return useContext(ReadOnlyContext)
}
