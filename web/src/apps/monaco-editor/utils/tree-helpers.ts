/**
 * Pure utility functions for tree data operations (immutable).
 */
import type { DirEntry } from '../types'

/** Patch one node in the tree by path. */
export function patchNode(nodes: DirEntry[], targetPath: string, patch: Partial<DirEntry>): DirEntry[] {
  return nodes.map(n => {
    if (n.path === targetPath) return { ...n, ...patch }
    if (n.children) return { ...n, children: patchNode(n.children, targetPath, patch) }
    return n
  })
}

/** Remove a node from the tree by path. */
export function removeNode(nodes: DirEntry[], targetPath: string): DirEntry[] {
  return nodes
    .filter(n => n.path !== targetPath)
    .map(n => (n.children ? { ...n, children: removeNode(n.children, targetPath) } : n))
}

/** Insert an entry into a sorted list of entries (dirs first, then alpha). */
export function insertSorted(list: DirEntry[], entry: DirEntry): DirEntry[] {
  return [...list, entry].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/** Insert a new entry under a parent node (or at root if parentPath is null). */
export function insertNodeAt(nodes: DirEntry[], parentPath: string | null, entry: DirEntry): DirEntry[] {
  if (!parentPath) return insertSorted(nodes, entry)
  return nodes.map(n => {
    if (n.path === parentPath) return { ...n, children: insertSorted(n.children ?? [], entry) }
    if (n.children) return { ...n, children: insertNodeAt(n.children, parentPath, entry) }
    return n
  })
}

/** Flatten the tree into a single list of all entries. */
export function flattenTree(nodes: DirEntry[]): DirEntry[] {
  return nodes.flatMap(n => (n.is_dir ? [n, ...flattenTree(n.children ?? [])] : [n]))
}
