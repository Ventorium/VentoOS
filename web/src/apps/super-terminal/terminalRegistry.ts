/**
 * Terminal registry — shared clear/write actions indexed by pane ID.
 * WebShell instances register their clear function here on mount.
 */
export interface TerminalActions {
  clear: () => void
  write: (text: string) => void
}

export const terminalRegistry = new Map<string, TerminalActions>()
