import { defineConfig, presetUno, presetAttributify } from 'unocss'
import { AppTheme } from './src/theme'

export default defineConfig({
  content: {
    filesystem: ['./src/**/*.{ts,tsx}']
  },
  presets: [presetUno(), presetAttributify()],
  theme: {
    colors: {
      primary: AppTheme.primaryColor
    }
  },
  shortcuts: [
    // ── Layout helpers ──────────────────────────────────────────────────────
    ['vos-flex-center', 'flex items-center justify-center'],
    ['vos-flex-row', 'flex items-center'],
    ['vos-flex-col', 'flex flex-col'],
    ['vos-flex-1', 'flex-1 min-w-0 min-h-0'],
    ['vos-inset', 'absolute inset-0'],

    // ── Common button base ──────────────────────────────────────────────────
    ['vos-btn-reset', 'border-none bg-transparent cursor-pointer p-0'],
    ['vos-btn-base', 'inline-flex items-center justify-center border-none cursor-pointer rounded transition-all duration-100 select-none'],
    ['vos-btn-sm', 'vos-btn-base text-xs px-2.5 py-1.5 rounded-lg'],
    ['vos-btn-ghost', 'vos-btn-base bg-transparent hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-primary)]'],
    ['vos-btn-primary', 'vos-btn-base bg-[var(--vos-accent-primary)] text-white hover:opacity-90'],
    ['vos-btn-danger', 'vos-btn-base bg-[rgba(255,59,48,0.12)] text-[var(--vos-accent-danger)] hover:bg-[rgba(255,59,48,0.2)]'],
    ['vos-btn-icon', 'vos-btn-base vos-flex-center border-none bg-transparent cursor-pointer rounded transition-all'],
    ['vos-icon-btn', 'vos-flex-center w-[26px] h-[22px] rounded border-none bg-transparent cursor-pointer text-[var(--vos-text-primary)] transition-all duration-100 hover:bg-[var(--vos-bg-item-hover)]'],

    // ── Form controls ───────────────────────────────────────────────────────
    ['vos-input', 'w-full text-xs px-2 py-1.5 rounded-lg border-none outline-none bg-[var(--vos-bg-input)] text-[var(--vos-text-primary)]'],
    ['vos-select', 'w-full text-xs px-2 py-1.5 rounded-lg border-none outline-none bg-[var(--vos-bg-input)] text-[var(--vos-text-primary)] cursor-pointer'],
    ['vos-textarea', 'w-full text-xs px-2 py-2 rounded-lg border-none outline-none bg-[var(--vos-bg-input)] text-[var(--vos-text-primary)] resize-y'],

    // ── Typography helpers ──────────────────────────────────────────────────
    ['vos-label', 'block text-[11px] font-semibold text-[var(--vos-text-tertiary)] uppercase tracking-[0.06em] mb-2.5'],
    ['vos-section-title', 'text-xl font-bold text-[var(--vos-text-primary)] mb-5'],
    ['vos-text-secondary', 'text-xs text-[var(--vos-text-secondary)]'],
    ['vos-text-tertiary', 'text-xs text-[var(--vos-text-tertiary)]'],

    // ── Surface / Glass layers ──────────────────────────────────────────────
    ['vos-surface', 'bg-[var(--vos-bg-surface)]'],
    ['vos-surface-hover', 'bg-[var(--vos-bg-surface-hover)]'],
    ['vos-glass', 'backdrop-blur-[36px] saturate-200'],
    ['vos-glass-heavy', 'backdrop-blur-[56px] saturate-[2.2]'],

    // ── Borders ─────────────────────────────────────────────────────────────
    ['vos-border', 'border-[0.5px] border-solid border-[var(--vos-border-default)]'],
    ['vos-border-subtle', 'border-[0.5px] border-solid border-[var(--vos-border-subtle)]'],

    // ── Settings reusable patterns ──────────────────────────────────────────
    ['vos-settings-group', 'mb-6'],
    ['vos-settings-row', 'flex items-center justify-between py-2 text-[13px] text-[var(--vos-text-primary)]'],
    ['vos-settings-toggle-row', 'flex items-center justify-between gap-4'],
    ['vos-chip', 'text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer text-[var(--vos-text-primary)] bg-[var(--vos-bg-input)] transition-all duration-100'],

    // ── Sidebar UIKit (VSCode-style activity bar) ───────────────────────────
    ['vos-activity-bar', 'flex flex-col items-center py-2 gap-0.5 flex-shrink-0 border-r-[0.5px] border-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] select-none'],
    ['vos-activity-item', 'vos-flex-center w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent text-[var(--vos-text-tertiary)] transition-all duration-100 hover:text-[var(--vos-text-primary)] hover:bg-[var(--vos-bg-item-hover)]'],
    ['vos-activity-item-active', 'text-[var(--vos-text-primary)] bg-[var(--vos-bg-item-hover)]'],

    // ── Panel sidebar (content area sidebar) ────────────────────────────────
    ['vos-panel-sidebar', 'flex flex-col flex-shrink-0 overflow-y-auto border-r-[0.5px] border-[var(--vos-border-subtle)]'],
    ['vos-panel-header', 'flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-[var(--vos-text-tertiary)] uppercase tracking-wider flex-shrink-0'],
    ['vos-tree-item', 'flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded-[3px] mx-1 text-xs text-[var(--vos-text-primary)] hover:bg-[var(--vos-bg-item-hover)] transition-colors duration-80'],
    ['vos-tree-item-active', 'bg-[var(--vos-accent-primary)] text-white hover:bg-[var(--vos-accent-primary)]'],

    // ── Modal / Dialog ──────────────────────────────────────────────────────
    ['vos-modal-overlay', 'vos-inset vos-flex-center z-50 bg-[rgba(0,0,0,0.4)]'],
    ['vos-modal-panel', 'rounded-xl p-5 flex flex-col gap-4 bg-[var(--vos-bg-surface)] shadow-[0_8px_32px_rgba(0,0,0,.28)] border-[0.5px] border-[var(--vos-border-default)]'],
    ['vos-modal-title', 'text-sm font-semibold text-[var(--vos-text-primary)]'],
    ['vos-modal-footer', 'flex justify-end gap-2 mt-1'],
  ]
})
