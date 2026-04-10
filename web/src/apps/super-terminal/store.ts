/**
 * Super Terminal — Zustand store
 */
import { create } from 'zustand'
import type { CustomCommand, NavTab, PortMapping, SessionTab, SshServer, TerminalSettings } from './types'
import { defaultTerminalSettings } from './types'

interface SuperTerminalState {
  // Navigation
  activeNavTab: NavTab
  setActiveNavTab: (tab: NavTab) => void

  // Session tabs (SSH connections)
  sessionTabs: SessionTab[]
  activeSessionTabId: string | null
  addSessionTab: (tab: SessionTab) => void
  removeSessionTab: (id: string) => void
  setActiveSessionTab: (id: string | null) => void

  // SSH Servers
  servers: SshServer[]
  setServers: (servers: SshServer[]) => void
  updateServer: (id: string, updates: Partial<SshServer>) => void
  removeServer: (id: string) => void

  // Port Mappings
  portMappings: PortMapping[]
  setPortMappings: (mappings: PortMapping[]) => void

  // Left panel
  leftPanelTab: 'commands' | 'settings' | null
  setLeftPanelTab: (tab: 'commands' | 'settings' | null) => void

  // Custom Commands
  commands: CustomCommand[]
  setCommands: (commands: CustomCommand[]) => void
  addCommand: (cmd: CustomCommand) => void
  updateCommand: (id: string, updates: Partial<CustomCommand>) => void
  removeCommand: (id: string) => void

  // Terminal Settings
  terminalSettings: TerminalSettings
  setTerminalSettings: (settings: Partial<TerminalSettings>) => void

  // Server groups
  groups: string[]
  setGroups: (groups: string[]) => void
  selectedGroup: string | null
  setSelectedGroup: (group: string | null) => void
}

export const useSuperTerminalStore = create<SuperTerminalState>(set => ({
  // Navigation
  activeNavTab: 'local-terminal',
  setActiveNavTab: tab => set({ activeNavTab: tab, activeSessionTabId: null }),

  // Session tabs
  sessionTabs: [],
  activeSessionTabId: null,
  addSessionTab: tab =>
    set(s => ({
      sessionTabs: [...s.sessionTabs, tab],
      activeSessionTabId: tab.id,
      activeNavTab: 'ssh-servers' // stay on ssh-servers, session renders in content area
    })),
  removeSessionTab: id =>
    set(s => {
      const tabs = s.sessionTabs.filter(t => t.id !== id)
      const newActive =
        s.activeSessionTabId === id ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : s.activeSessionTabId
      return { sessionTabs: tabs, activeSessionTabId: newActive }
    }),
  setActiveSessionTab: id => set({ activeSessionTabId: id }),

  // SSH Servers
  servers: [],
  setServers: servers =>
    set(() => {
      // Extract unique groups
      const groupSet = new Set<string>()
      for (const s of servers) {
        if (s.group) groupSet.add(s.group)
      }
      return { servers, groups: Array.from(groupSet).sort() }
    }),
  updateServer: (id, updates) =>
    set(s => ({
      servers: s.servers.map(srv => (srv.id === id ? { ...srv, ...updates } : srv))
    })),
  removeServer: id =>
    set(s => ({
      servers: s.servers.filter(srv => srv.id !== id)
    })),

  // Port Mappings
  portMappings: [],
  setPortMappings: mappings => set({ portMappings: mappings }),

  // Left panel
  leftPanelTab: null,
  setLeftPanelTab: tab => set(s => ({ leftPanelTab: s.leftPanelTab === tab ? null : tab })),

  // Custom Commands
  commands: [],
  setCommands: commands => set({ commands }),
  addCommand: cmd => set(s => ({ commands: [...s.commands, cmd] })),
  updateCommand: (id, updates) =>
    set(s => ({
      commands: s.commands.map(c => (c.id === id ? { ...c, ...updates } : c))
    })),
  removeCommand: id => set(s => ({ commands: s.commands.filter(c => c.id !== id) })),

  // Terminal Settings
  terminalSettings: defaultTerminalSettings,
  setTerminalSettings: settings =>
    set(s => ({
      terminalSettings: { ...s.terminalSettings, ...settings }
    })),

  // Server groups
  groups: [],
  setGroups: groups => set({ groups }),
  selectedGroup: null,
  setSelectedGroup: group => set({ selectedGroup: group })
}))
