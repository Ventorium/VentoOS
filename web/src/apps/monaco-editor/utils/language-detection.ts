/**
 * Language detection utilities for the code editor.
 * Maps file extensions and special filenames to Monaco language IDs.
 */

const EXT_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  rs: 'rust',
  go: 'go',
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  php: 'php',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ksh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  xml: 'xml',
  xsl: 'xml',
  svg: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'html',
  svelte: 'html',
  txt: 'plaintext',
  log: 'plaintext',
  conf: 'ini',
  cfg: 'ini',
  ini: 'ini',
  env: 'ini',
  properties: 'ini',
  tf: 'hcl',
  hcl: 'hcl',
  tfvars: 'hcl',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  dart: 'dart',
  lua: 'lua',
  ex: 'elixir',
  exs: 'elixir',
  hs: 'haskell',
  elm: 'elm',
  clj: 'clojure',
  cljs: 'clojure',
  proto: 'proto3',
  nix: 'plaintext',
  zig: 'plaintext'
}

const DISPLAY_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  csharp: 'C#',
  cpp: 'C++',
  c: 'C',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  xml: 'XML',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  sql: 'SQL',
  graphql: 'GraphQL',
  shell: 'Shell Script',
  powershell: 'PowerShell',
  bat: 'Batch',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  dart: 'Dart',
  lua: 'Lua',
  hcl: 'HCL',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  plaintext: 'Plain Text',
  ini: 'INI',
  elixir: 'Elixir',
  haskell: 'Haskell',
  elm: 'Elm',
  clojure: 'Clojure',
  proto3: 'Protocol Buffers',
  less: 'Less'
}

/** Special filename → language mappings (case-insensitive check) */
const SPECIAL_FILES: [string, string][] = [
  ['dockerfile', 'dockerfile'],
  ['makefile', 'makefile'],
  ['gnumakefile', 'makefile']
]

/**
 * Detect Monaco language ID from a filename.
 */
export function getLanguageFromFilename(name: string): string {
  const lower = name.toLowerCase()

  // Check special filenames first
  for (const [pattern, lang] of SPECIAL_FILES) {
    if (lower === pattern || lower.startsWith(`${pattern}.`)) return lang
  }

  const dot = lower.lastIndexOf('.')
  if (dot < 0) return 'plaintext'
  const ext = lower.slice(dot + 1)
  return EXT_MAP[ext] ?? 'plaintext'
}

/**
 * Get a human-readable display name for a language ID.
 */
export function displayLanguage(lang: string): string {
  return DISPLAY_NAMES[lang] ?? lang
}
