/**
 * Monaco Editor theme definitions that sync with VentoOS CSS Variables.
 */
import type { editor as MonacoEditorNS } from 'monaco-editor'

/** VS Code Dark+ inspired theme using VentoOS tokens */
export const vosDarkTheme: MonacoEditorNS.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955' },
    { token: 'keyword', foreground: '569CD6' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'constant', foreground: '4FC1FF' },
    { token: 'regexp', foreground: 'D16969' },
    { token: 'tag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' }
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editor.selectionBackground': '#264f78',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editorIndentGuide.background1': '#404040',
    'editorIndentGuide.activeBackground1': '#707070',
    'editor.lineHighlightBackground': '#2a2d2e',
    'editorCursor.foreground': '#aeafad',
    'editorWhitespace.foreground': '#3b3b3b',
    'editorBracketMatch.background': '#0064001a',
    'editorBracketMatch.border': '#888888',
    'editor.findMatchBackground': '#515c6a',
    'editor.findMatchHighlightBackground': '#ea5c0055'
  }
}

/** VS Code Light+ inspired theme using VentoOS tokens */
export const vosLightTheme: MonacoEditorNS.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '008000' },
    { token: 'keyword', foreground: '0000FF' },
    { token: 'string', foreground: 'A31515' },
    { token: 'number', foreground: '098658' },
    { token: 'type', foreground: '267F99' },
    { token: 'function', foreground: '795E26' },
    { token: 'variable', foreground: '001080' },
    { token: 'constant', foreground: '0070C1' },
    { token: 'regexp', foreground: '811F3F' },
    { token: 'tag', foreground: '800000' },
    { token: 'attribute.name', foreground: 'FF0000' },
    { token: 'attribute.value', foreground: '0451A5' }
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#000000',
    'editorLineNumber.foreground': '#237893',
    'editorLineNumber.activeForeground': '#0B216F',
    'editor.selectionBackground': '#add6ff',
    'editor.inactiveSelectionBackground': '#e5ebf1',
    'editorIndentGuide.background1': '#d3d3d3',
    'editorIndentGuide.activeBackground1': '#939393',
    'editor.lineHighlightBackground': '#f5f5f5',
    'editorCursor.foreground': '#000000',
    'editorWhitespace.foreground': '#d3d3d3',
    'editorBracketMatch.background': '#0064001a',
    'editorBracketMatch.border': '#B9B9B9',
    'editor.findMatchBackground': '#A8AC94',
    'editor.findMatchHighlightBackground': '#EA5C0055'
  }
}

/**
 * Define both VentoOS themes in a Monaco instance.
 * Call this once on first editor mount.
 */
let _themesRegistered = false
export function registerVosThemes(monaco: { editor: typeof MonacoEditorNS }) {
  if (_themesRegistered) return
  monaco.editor.defineTheme('vos-dark', vosDarkTheme)
  monaco.editor.defineTheme('vos-light', vosLightTheme)
  _themesRegistered = true
}
