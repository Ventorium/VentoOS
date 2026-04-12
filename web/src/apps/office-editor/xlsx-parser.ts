/**
 * Simple XLSX parser
 *
 * Parses XLSX files (which are ZIP archives containing XML)
 * to extract cell data for display in tables.
 *
 * For full editing, the OnlyOffice integration via .repos/document is recommended.
 */

import JSZip from 'jszip'

interface SheetData {
  headers: string[]
  rows: string[][]
  sheetName: string
}

/**
 * Parse an XLSX ArrayBuffer to extract the first sheet's data.
 * Uses the browser's built-in ZIP (via Blob/Response) and DOMParser.
 */
export async function parseXlsxAsync(buffer: ArrayBuffer): Promise<SheetData> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
    const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string')

    const firstSheetPath = resolveFirstSheetPath(workbookXml ?? '', relsXml ?? '')
    if (!firstSheetPath) throw new Error('XLSX workbook has no worksheet entries')

    const sheet1Xml = await zip.file(firstSheetPath)?.async('string')
    if (!sheet1Xml) throw new Error(`XLSX worksheet not found: ${firstSheetPath}`)

    const sharedStrings = parseSharedStrings(sharedStringsXml ?? '')
    return parseSheet(sheet1Xml, sharedStrings)
  } catch (err) {
    throw new Error(`Unable to parse XLSX: ${err instanceof Error ? err.message : 'unknown error'}`)
  }
}

/**
 * Backward-compatible alias.
 */
export function parseXlsx(_buffer: ArrayBuffer): SheetData {
  throw new Error('parseXlsx is deprecated, use parseXlsxAsync')
}

function resolveFirstSheetPath(workbookXml: string, relsXml: string): string | null {
  if (!workbookXml || !relsXml) return null
  const sheetMatch = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*>/i)
  const relId = sheetMatch?.[1]
  if (!relId) return null

  const relRe = /<Relationship\b([^>]*)\/?\s*>/gi
  let relMatch = relRe.exec(relsXml)
  while (relMatch) {
    const attrs = relMatch[1] ?? ''
    const id = getAttr(attrs, 'Id')
    if (id === relId) {
      const target = getAttr(attrs, 'Target')
      if (!target) return null
      if (target.startsWith('/')) return target.slice(1)
      if (target.startsWith('xl/')) return target
      return `xl/${target}`
    }
    relMatch = relRe.exec(relsXml)
  }

  return null
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return []
  const strings: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi
  let match = siRe.exec(xml)
  while (match) {
    const content = match[1] ?? ''
    const text = decodeXml(content.replace(/<[^>]+>/g, ''))
    strings.push(text)
    match = siRe.exec(xml)
  }
  return strings
}

function parseSheet(xml: string, sharedStrings: string[]): SheetData {
  if (!xml) return { headers: [], rows: [], sheetName: 'Sheet1' }

  const allRows: string[][] = []
  let maxCols = 0

  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi
  let rowMatch = rowRe.exec(xml)
  while (rowMatch) {
    const rowXml = rowMatch[1] ?? ''
    const rowData: string[] = []

    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi
    let cellMatch = cellRe.exec(rowXml)
    while (cellMatch) {
      const attrs = cellMatch[1] ?? ''
      const body = cellMatch[2] ?? ''
      const ref = getAttr(attrs, 'r') ?? ''
      const type = getAttr(attrs, 't')
      const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)
      const inlineMatch = body.match(/<is\b[^>]*>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/i)
      const rawValue = valueMatch?.[1] ?? inlineMatch?.[1] ?? ''
      const value = decodeXml(rawValue)

      // Calculate column index from cell reference (e.g., "B2" → 1)
      const colMatch = ref.match(/^([A-Z]+)/)
      const colIdx = colMatch ? colLetterToIndex(colMatch[1]) : rowData.length

      // Pad missing columns
      while (rowData.length < colIdx) rowData.push('')

      if (type === 's') {
        // Shared string reference
        const idx = parseInt(value, 10)
        rowData.push(sharedStrings[idx] ?? value)
      } else {
        rowData.push(value)
      }

      cellMatch = cellRe.exec(rowXml)
    }

    if (rowData.length > maxCols) maxCols = rowData.length

    allRows.push(rowData)
    rowMatch = rowRe.exec(xml)
  }

  // Pad all rows to same length
  for (const row of allRows) {
    while (row.length < maxCols) row.push('')
  }

  // First row as headers
  const headers = allRows[0] ?? []
  const rows = allRows.slice(1)

  return { headers, rows, sheetName: 'Sheet1' }
}

function colLetterToIndex(letters: string): number {
  let index = 0
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64)
  }
  return index - 1
}

function getAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
  return m?.[1] ?? null
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
