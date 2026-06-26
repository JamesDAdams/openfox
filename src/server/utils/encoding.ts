import { detect } from 'jschardet'
import * as iconv from 'iconv-lite'

export interface EncodingResult {
  encoding: string
  confidence: number
  bomSize: number
}

export function detectEncoding(buffer: Buffer): EncodingResult {
  if (buffer.length === 0) {
    return { encoding: 'utf-8', confidence: 1, bomSize: 0 }
  }

  const bomSize = detectBOM(buffer)
  const bomStripped = bomSize > 0 ? buffer.subarray(bomSize) : buffer

  if (bomSize > 0) {
    const bomEncoding = bomEncodingForSize(buffer)
    return { encoding: bomEncoding, confidence: 1, bomSize }
  }

  if (isValidUtf8(bomStripped)) {
    return { encoding: 'utf-8', confidence: 0.95, bomSize: 0 }
  }

  const detected = detect(bomStripped)
  if (detected && detected.encoding && detected.confidence > 0.2) {
    return { encoding: normalizeEncoding(detected.encoding), confidence: detected.confidence, bomSize: 0 }
  }

  return { encoding: 'ISO-8859-1', confidence: 0.1, bomSize: 0 }
}

function detectBOM(buffer: Buffer): number {
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xfe && buffer[3] === 0xff)
    return 4
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xfe && buffer[2] === 0x00 && buffer[3] === 0x00)
    return 4
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 2
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 2
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return 3
  return 0
}

function bomEncodingForSize(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf-16be'
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      if (buffer.length >= 4 && buffer[2] === 0x00 && buffer[3] === 0x00) return 'utf-32'
      return 'utf-16le'
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return 'utf-8'
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xfe && buffer[3] === 0xff)
    return 'utf-32be'
  return 'utf-8'
}

function isValidUtf8(buffer: Buffer): boolean {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    decoder.decode(buffer)
    return true
  } catch {
    return false
  }
}

function normalizeEncoding(enc: string): string {
  const lower = enc.toLowerCase().replace(/_/g, '-')
  const map: Record<string, string> = {
    'utf-8': 'utf-8',
    utf8: 'utf-8',
    ascii: 'utf-8',
    'iso-8859-1': 'ISO-8859-1',
    'iso8859-1': 'ISO-8859-1',
    latin1: 'ISO-8859-1',
    'windows-1252': 'windows-1252',
    'shift-jis': 'Shift_JIS',
    shift_jis: 'Shift_JIS',
    'euc-jp': 'EUC-JP',
    'euc-kr': 'EUC-KR',
    gb2312: 'GB2312',
    gb18030: 'GB18030',
    big5: 'Big5',
    'utf-16': 'utf-16le',
    'utf-16le': 'utf-16le',
    'utf-16be': 'utf-16be',
    'utf-32': 'utf-32le',
    'utf-32le': 'utf-32le',
    'utf-32be': 'utf-32be',
    'koi8-r': 'KOI8-R',
    'koi8-u': 'KOI8-U',
  }
  return map[lower] ?? enc
}

export function decodeContent(buffer: Buffer, encoding: string): string {
  const bomSize = detectBOM(buffer)
  const contentBuf = bomSize > 0 ? buffer.subarray(bomSize) : buffer

  const normalized = normalizeEncoding(encoding)

  if (normalized === 'utf-8') {
    return contentBuf.toString('utf-8')
  }

  if (normalized === 'utf-16le') {
    return contentBuf.toString('utf-16le')
  }

  if (normalized === 'utf-16be') {
    return swapUtf16Endianness(contentBuf).toString('utf-16le')
  }

  if (normalized === 'utf-32le') {
    return utf32ToString(contentBuf, true)
  }

  if (normalized === 'utf-32be') {
    return utf32ToString(contentBuf, false)
  }

  return iconv.decode(contentBuf, normalized)
}

export function encodeContent(content: string, encoding: string, addBom: boolean = false): Buffer {
  const normalized = normalizeEncoding(encoding)

  let encoded: Buffer

  if (normalized === 'utf-8') {
    encoded = Buffer.from(content, 'utf-8')
  } else if (normalized === 'utf-16le') {
    encoded = Buffer.from(content, 'utf-16le')
  } else if (normalized === 'utf-16be') {
    encoded = swapUtf16Endianness(Buffer.from(content, 'utf-16le'))
  } else if (normalized === 'utf-32le') {
    encoded = stringToUtf32(content, true)
  } else if (normalized === 'utf-32be') {
    encoded = stringToUtf32(content, false)
  } else {
    encoded = iconv.encode(content, normalized)
  }

  if (addBom) {
    const bom = bomForEncoding(normalized)
    if (bom) {
      encoded = Buffer.concat([bom, encoded])
    }
  }

  return encoded
}

function bomForEncoding(encoding: string): Buffer | null {
  switch (encoding) {
    case 'utf-8':
      return Buffer.from([0xef, 0xbb, 0xbf])
    case 'utf-16le':
      return Buffer.from([0xff, 0xfe])
    case 'utf-16be':
      return Buffer.from([0xfe, 0xff])
    case 'utf-32le':
      return Buffer.from([0xff, 0xfe, 0x00, 0x00])
    case 'utf-32be':
      return Buffer.from([0x00, 0x00, 0xfe, 0xff])
    default:
      return null
  }
}

function swapUtf16Endianness(buf: Buffer): Buffer {
  const out = Buffer.alloc(buf.length)
  for (let i = 0; i + 1 < buf.length; i += 2) {
    out[i] = buf[i + 1]!
    out[i + 1] = buf[i]!
  }
  return out
}

function utf32ToString(buffer: Buffer, littleEndian: boolean): string {
  const chars: string[] = []
  for (let i = 0; i + 3 < buffer.length; i += 4) {
    const code = littleEndian ? buffer.readUInt32LE(i) : buffer.readUInt32BE(i)
    if (code > 0x10ffff) continue
    chars.push(String.fromCodePoint(code))
  }
  return chars.join('')
}

function stringToUtf32(str: string, littleEndian: boolean): Buffer {
  const codes: number[] = []
  for (const ch of str) {
    codes.push(ch.codePointAt(0)!)
  }
  const buf = Buffer.alloc(codes.length * 4)
  for (let i = 0; i < codes.length; i++) {
    if (littleEndian) {
      buf.writeUInt32LE(codes[i]!, i * 4)
    } else {
      buf.writeUInt32BE(codes[i]!, i * 4)
    }
  }
  return buf
}
