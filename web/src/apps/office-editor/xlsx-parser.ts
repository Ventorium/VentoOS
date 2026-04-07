/**
 * Simple XLSX parser
 *
 * Parses XLSX files (which are ZIP archives containing XML)
 * to extract cell data for display in tables.
 *
 * For full editing, the OnlyOffice integration via .repos/document is recommended.
 */

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
  // XLSX is a ZIP file - use the browser's decompression via Response
  const blob = new Blob([buffer], { type: 'application/zip' })

  // We need to read the ZIP entries - use a minimal approach
  // The key files in XLSX are:
  //   xl/sharedStrings.xml — shared string table
  //   xl/worksheets/sheet1.xml — first sheet data

  try {
    // Try using the JSZip-like approach via browser APIs
    const entries = await readZipEntries(buffer)
    const sharedStringsXml = entries['xl/sharedStrings.xml'] ?? ''
    const sheet1Xml = entries['xl/worksheets/sheet1.xml'] ?? ''

    const sharedStrings = parseSharedStrings(sharedStringsXml)
    return parseSheet(sheet1Xml, sharedStrings)
  } catch {
    return { headers: [], rows: [], sheetName: 'Sheet1' }
  }
}

/**
 * Synchronous version that takes pre-parsed text
 */
export function parseXlsx(buffer: ArrayBuffer): SheetData {
  // For synchronous use, return empty and let the async version handle it
  return { headers: [], rows: [], sheetName: 'Sheet1' }
}

async function readZipEntries(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const view = new DataView(buffer)

  // Find End of Central Directory
  let eocdOffset = -1
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) throw new Error('Not a valid ZIP')

  const cdOffset = view.getUint32(eocdOffset + 16, true)
  const cdEntries = view.getUint16(eocdOffset + 10, true)

  let offset = cdOffset
  const decoder = new TextDecoder()

  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break

    const compMethod = view.getUint16(offset + 10, true)
    const compSize = view.getUint32(offset + 20, true)
    const uncompSize = view.getUint32(offset + 24, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)

    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLen))
    offset += 46 + nameLen + extraLen + commentLen

    // Only parse XML files we need
    if (!name.endsWith('.xml')) continue
    if (!name.includes('sharedStrings') && !name.includes('sheet1')) continue

    // Read from local file header
    const localNameLen = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true)
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen

    let text: string
    if (compMethod === 0) {
      // Stored (no compression)
      text = decoder.decode(new Uint8Array(buffer, dataOffset, uncompSize))
    } else if (compMethod === 8) {
      // Deflated
      const compressed = new Uint8Array(buffer, dataOffset, compSize)
      const ds = new DecompressionStream('deflate-raw')
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()

      writer.write(compressed)
      writer.close()

      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
      const merged = new Uint8Array(totalLen)
      let pos = 0
      for (const chunk of chunks) {
        merged.set(chunk, pos)
        pos += chunk.length
      }
      text = decoder.decode(merged)
    } else {
      continue // Skip unsupported compression methods
    }

    result[name] = text
  }

  return result
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return []
  const strings: string[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const siElements = doc.getElementsByTagName('si')
  for (let i = 0; i < siElements.length; i++) {
    const si = siElements[i]
    // Get all text content (handles both <t> and <r><t> patterns)
    strings.push(si.textContent ?? '')
  }
  return strings
}

function parseSheet(xml: string, sharedStrings: string[]): SheetData {
  if (!xml) return { headers: [], rows: [], sheetName: 'Sheet1' }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const rowElements = doc.getElementsByTagName('row')

  const allRows: string[][] = []
  let maxCols = 0

  for (let r = 0; r < rowElements.length; r++) {
    const row = rowElements[r]
    const cells = row.getElementsByTagName('c')
    const rowData: string[] = []

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      const ref = cell.getAttribute('r') ?? ''
      const type = cell.getAttribute('t')
      const vEl = cell.getElementsByTagName('v')[0]
      const value = vEl?.textContent ?? ''

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
    }

    if (rowData.length > maxCols) maxCols = rowData.length

    allRows.push(rowData)
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
