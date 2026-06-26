import { describe, it, expect } from 'vitest'
import { detectEncoding, decodeContent, encodeContent } from './encoding.js'
import * as iconv from 'iconv-lite'

describe('detectEncoding', () => {
  it('detects UTF-8 without BOM', () => {
    const buf = Buffer.from('hello world', 'utf-8')
    const result = detectEncoding(buf)
    expect(result.encoding).toBe('utf-8')
    expect(result.confidence).toBeGreaterThan(0.9)
    expect(result.bomSize).toBe(0)
  })

  it('detects UTF-8 with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello', 'utf-8')])
    const result = detectEncoding(buf)
    expect(result.encoding).toBe('utf-8')
    expect(result.bomSize).toBe(3)
  })

  it('detects UTF-16 LE with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello', 'utf-16le')])
    const result = detectEncoding(buf)
    expect(result.encoding).toBe('utf-16le')
    expect(result.bomSize).toBe(2)
  })

  it('detects UTF-16 BE with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('\x00h\x00e\x00l\x00l\x00o', 'binary')])
    const result = detectEncoding(buf)
    expect(result.encoding).toBe('utf-16be')
    expect(result.bomSize).toBe(2)
  })

  it('detects UTF-32 LE with BOM', () => {
    const buf = Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x68, 0x00, 0x00, 0x00])
    const result = detectEncoding(buf)
    expect(result.encoding).toBe('utf-32')
    expect(result.bomSize).toBe(4)
  })

  it('detects non-UTF-8 encoding for invalid UTF-8 byte sequences', () => {
    // Bytes that are valid Latin-1 but not valid UTF-8
    const buf = Buffer.from([0xe9, 0xe0, 0xe7, 0xe8, 0xe9, 0x20, 0xe0, 0x20, 0xe9])
    const result = detectEncoding(buf)
    expect(result.encoding).not.toBe('utf-8')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.bomSize).toBe(0)
  })

  it('detects windows-1252', () => {
    const buf = Buffer.from([0x93, 0x94, 0x96]) // smart quotes in windows-1252
    const result = detectEncoding(buf)
    expect(result.encoding).toBe('windows-1252')
  })

  it('detects Shift-JIS', () => {
    const buf = iconv.encode('日本語のテスト文章です。Shift-JISでエンコードします。', 'Shift_JIS')
    const result = detectEncoding(buf)
    expect(result.encoding).toBe('Shift_JIS')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('returns utf-8 for empty buffer', () => {
    const result = detectEncoding(Buffer.alloc(0))
    expect(result.encoding).toBe('utf-8')
    expect(result.confidence).toBe(1)
    expect(result.bomSize).toBe(0)
  })
})

describe('decodeContent', () => {
  it('decodes UTF-8 content', () => {
    const buf = Buffer.from('héllo wörld', 'utf-8')
    expect(decodeContent(buf, 'utf-8')).toBe('héllo wörld')
  })

  it('strips UTF-8 BOM when decoding', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello', 'utf-8')])
    expect(decodeContent(buf, 'utf-8')).toBe('hello')
  })

  it('decodes ISO-8859-1 content', () => {
    const buf = Buffer.from([0xe9, 0xe0, 0xe7, 0xe8])
    expect(decodeContent(buf, 'ISO-8859-1')).toBe('éàçè')
  })

  it('decodes windows-1252 content', () => {
    const buf = Buffer.from([0x93, 0x94])
    expect(decodeContent(buf, 'windows-1252')).toBe('\u201c\u201d')
  })

  it('decodes UTF-16 LE content', () => {
    const buf = Buffer.from('hello', 'utf-16le')
    expect(decodeContent(buf, 'utf-16le')).toBe('hello')
  })
})

describe('encodeContent', () => {
  it('encodes to UTF-8 by default', () => {
    const result = encodeContent('héllo', 'utf-8')
    expect(Buffer.from('héllo', 'utf-8').equals(result)).toBe(true)
  })

  it('encodes to ISO-8859-1', () => {
    const result = encodeContent('éàçè', 'ISO-8859-1')
    expect(result).toEqual(Buffer.from([0xe9, 0xe0, 0xe7, 0xe8]))
  })

  it('encodes to windows-1252', () => {
    const result = encodeContent('\u201c\u201d', 'windows-1252')
    expect(result).toEqual(Buffer.from([0x93, 0x94]))
  })

  it('encodes to UTF-16 LE', () => {
    const result = encodeContent('hello', 'utf-16le')
    expect(Buffer.from('hello', 'utf-16le').equals(result)).toBe(true)
  })

  it('encodes to UTF-16 BE', () => {
    const result = encodeContent('hello', 'utf-16be')
    const le = Buffer.from('hello', 'utf-16le')
    // BE is byte-swapped LE
    expect(result[0]).toBe(le[1])
    expect(result[1]).toBe(le[0])
  })

  it('replaces characters outside Latin-1 range with ?', () => {
    const result = encodeContent('héllo\u0300', 'ISO-8859-1')
    expect(result[5]).toBe(0x3f) // '?' for the combining grave
  })

  it('adds UTF-8 BOM when addBom is true', () => {
    const result = encodeContent('hello', 'utf-8', true)
    expect(result[0]).toBe(0xef)
    expect(result[1]).toBe(0xbb)
    expect(result[2]).toBe(0xbf)
    expect(result.subarray(3).toString('utf-8')).toBe('hello')
  })

  it('adds UTF-16 LE BOM when addBom is true', () => {
    const result = encodeContent('hello', 'utf-16le', true)
    expect(result[0]).toBe(0xff)
    expect(result[1]).toBe(0xfe)
    expect(result.subarray(2).toString('utf-16le')).toBe('hello')
  })

  it('adds UTF-16 BE BOM when addBom is true', () => {
    const result = encodeContent('hello', 'utf-16be', true)
    expect(result[0]).toBe(0xfe)
    expect(result[1]).toBe(0xff)
  })

  it('does not add BOM when addBom is false', () => {
    const result = encodeContent('hello', 'utf-8', false)
    expect(result[0]).not.toBe(0xef)
    expect(result.toString('utf-8')).toBe('hello')
  })
})

describe('round-trip', () => {
  it('preserves ISO-8859-1 content through encode→decode', () => {
    const original = 'Éléphant naïve ça été'
    const encoded = encodeContent(original, 'ISO-8859-1')
    const decoded = decodeContent(encoded, 'ISO-8859-1')
    expect(decoded).toBe(original)
  })

  it('preserves UTF-8 content through encode→decode', () => {
    const original = 'héllo wörld 🌍'
    const encoded = encodeContent(original, 'utf-8')
    const decoded = decodeContent(encoded, 'utf-8')
    expect(decoded).toBe(original)
  })

  it('preserves windows-1252 content through encode→decode', () => {
    const original = '\u201cHello\u201d \u2014'
    const encoded = encodeContent(original, 'windows-1252')
    const decoded = decodeContent(encoded, 'windows-1252')
    expect(decoded).toBe(original)
  })

  it('preserves UTF-16 LE content through encode→decode', () => {
    const original = 'hello world'
    const encoded = encodeContent(original, 'utf-16le')
    const decoded = decodeContent(encoded, 'utf-16le')
    expect(decoded).toBe(original)
  })

  it('preserves UTF-16 BE content through encode→decode', () => {
    const original = 'hello world'
    const encoded = encodeContent(original, 'utf-16be')
    const decoded = decodeContent(encoded, 'utf-16be')
    expect(decoded).toBe(original)
  })

  it('preserves Shift-JIS content through encode→decode', () => {
    const original = '日本語のテスト'
    const encoded = encodeContent(original, 'Shift_JIS')
    const decoded = decodeContent(encoded, 'Shift_JIS')
    expect(decoded).toBe(original)
  })

  it('preserves EUC-JP content through encode→decode', () => {
    const original = '日本語のテスト'
    const encoded = encodeContent(original, 'EUC-JP')
    const decoded = decodeContent(encoded, 'EUC-JP')
    expect(decoded).toBe(original)
  })

  it('preserves GB2312 content through encode→decode', () => {
    const original = '中文测试'
    const encoded = encodeContent(original, 'GB2312')
    const decoded = decodeContent(encoded, 'GB2312')
    expect(decoded).toBe(original)
  })

  it('preserves Big5 content through encode→decode', () => {
    const original = '中文測試'
    const encoded = encodeContent(original, 'Big5')
    const decoded = decodeContent(encoded, 'Big5')
    expect(decoded).toBe(original)
  })
})
