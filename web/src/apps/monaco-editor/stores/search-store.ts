/**
 * Search Store — content search query, results, and state.
 */
import { create } from 'zustand'
import { vfsApi } from '../../explorer/api'
import type { QuickOpenItem, SearchMatch, SearchResult } from '../types'

interface SearchStore {
  contentQuery: string
  filenameFilter: string
  results: SearchResult[]
  isSearching: boolean

  setContentQuery: (q: string) => void
  setFilenameFilter: (q: string) => void
  doContentSearch: (fileIndex: QuickOpenItem[]) => Promise<void>
  clearResults: () => void
}

export const useSearchStore = create<SearchStore>()((set, get) => ({
  contentQuery: '',
  filenameFilter: '',
  results: [],
  isSearching: false,

  setContentQuery(q) {
    set({ contentQuery: q })
  },

  setFilenameFilter(q) {
    set({ filenameFilter: q })
  },

  async doContentSearch(fileIndex) {
    const query = get().contentQuery.trim()
    if (!query || fileIndex.length === 0) return

    set({ isSearching: true, results: [] })
    const results: SearchResult[] = []
    const MAX_FILES = 150

    for (const file of fileIndex.slice(0, MAX_FILES)) {
      try {
        const r = await vfsApi.readVfsFile(file.mountId, file.path, 512 * 1024)
        if (r.data.is_binary) continue
        const lines = (r.data.content ?? '').split('\n')
        const matches: SearchMatch[] = []
        const q = query.toLowerCase()
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            matches.push({
              line: i + 1,
              col: lines[i].toLowerCase().indexOf(q) + 1,
              preview: lines[i].trim().slice(0, 120)
            })
          }
          if (matches.length >= 10) break
        }
        if (matches.length > 0) results.push({ file, matches })
      } catch {
        /* skip */
      }
      if (results.length >= 30) break
    }

    set({ results, isSearching: false })
  },

  clearResults() {
    set({ results: [] })
  }
}))
