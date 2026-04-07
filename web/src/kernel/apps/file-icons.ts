/**
 * File Icon Mapping
 *
 * Maps file extensions to meaningful icons and colors.
 * Uses Lucide React icons for consistent visual style.
 */

import {
  Archive,
  Code,
  Database,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Film,
  Image,
  Music,
  Presentation,
  Table,
  Terminal,
  Type
} from 'lucide-react'
import type { ComponentType } from 'react'

interface FileIconInfo {
  icon: ComponentType<{ size?: number; style?: React.CSSProperties }>
  color: string
}

const iconMap: Record<string, FileIconInfo> = {}

function register(exts: string[], icon: FileIconInfo['icon'], color: string) {
  for (const ext of exts) {
    iconMap[ext] = { icon, color }
  }
}

// ── Images ──
register(
  ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif', 'heic', 'heif'],
  Image,
  '#e879a0'
)

// ── Videos ──
register(['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ogv', '3gp'], Film, '#a78bfa')

// ── Audio ──
register(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus', 'aiff'], Music, '#f97316')

// ── Documents ──
register(['doc', 'docx', 'odt', 'rtf'], FileText, '#4a90d9')
register(['pdf'], FileText, '#ef4444')

// ── Spreadsheets ──
register(['xls', 'xlsx', 'ods', 'csv', 'tsv'], Table, '#22c55e')

// ── Presentations ──
register(['ppt', 'pptx', 'odp'], Presentation, '#f59e0b')

// ── Code files ──
register(
  [
    'js',
    'jsx',
    'ts',
    'tsx',
    'mjs',
    'cjs',
    'vue',
    'svelte',
    'astro',
    'rs',
    'go',
    'py',
    'rb',
    'java',
    'kt',
    'swift',
    'c',
    'cpp',
    'h',
    'hpp',
    'cs',
    'php',
    'dart',
    'lua',
    'r',
    'scala',
    'clj',
    'ex',
    'exs',
    'zig',
    'nim',
    'v',
    'hx'
  ],
  FileCode,
  '#60a5fa'
)

// ── Config / Data files ──
register(['json', 'jsonc', 'json5'], FileJson, '#fbbf24')
register(['yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'properties'], Code, '#94a3b8')
register(['xml', 'xsl', 'xslt', 'xsd', 'dtd', 'wsdl', 'svg'], Code, '#fb923c')

// ── Shell / Scripts ──
register(
  ['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'csh', 'ksh'],
  Terminal,
  '#a3e635'
)

// ── Markup / Text ──
register(['md', 'markdown', 'mdx', 'rst', 'adoc', 'tex', 'latex'], FileText, '#818cf8')
register(['html', 'htm', 'xhtml', 'ejs', 'hbs', 'pug', 'jade'], FileCode, '#f472b6')
register(['css', 'scss', 'sass', 'less', 'styl', 'pcss'], FileCode, '#38bdf8')
register(['txt', 'log', 'readme', 'changelog', 'license', 'authors'], FileText, '#a1a1aa')

// ── Database ──
register(['db', 'sqlite', 'sqlite3', 'sql', 'mdb', 'accdb'], Database, '#8b5cf6')

// ── Archives ──
register(
  ['zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz', 'zst', 'tgz', 'tbz2', 'txz', 'tzst', 'lz', 'lzma', 'cab', 'iso', 'dmg'],
  Archive,
  '#f97316'
)

// ── Fonts ──
register(['ttf', 'otf', 'woff', 'woff2', 'eot'], Type, '#ec4899')

// ── Executables / Binary ──
register(['exe', 'msi', 'app', 'apk', 'deb', 'rpm', 'snap', 'flatpak', 'appimage'], File, '#6b7280')
register(['dll', 'so', 'dylib', 'o', 'a', 'lib', 'wasm'], File, '#6b7280')

// ── Misc ──
register(['graphql', 'gql', 'proto', 'thrift'], Code, '#e879f9')
register(['dockerfile', 'makefile', 'cmake', 'gradle', 'rakefile'], Terminal, '#a3e635')
register(['diff', 'patch'], Code, '#fb923c')
register(['gitignore', 'gitattributes', 'editorconfig', 'eslintrc', 'prettierrc'], Code, '#94a3b8')

/** Default icon for unknown file types */
const defaultIcon: FileIconInfo = { icon: File, color: 'var(--vos-text-tertiary)' }

/**
 * Get the icon and color for a file extension.
 * @param ext - File extension without dot, e.g. 'png'
 * @returns Icon component and color string
 */
export function getFileIcon(ext: string): FileIconInfo {
  if (!ext) return defaultIcon
  return iconMap[ext.toLowerCase()] ?? defaultIcon
}

/**
 * Get the icon info from a filename (extracts extension automatically).
 */
export function getFileIconByName(name: string): FileIconInfo {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return defaultIcon
  return getFileIcon(name.slice(dot + 1))
}
