import type { MultipartPart } from './multipart'
import { Buffer } from 'node:buffer'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseHeaderParameters, parseMultipart } from './multipart'

interface CollectedPart extends MultipartPart {
  content: Buffer
}

function toStream(body: Buffer, chunkSize: number, delivery: 'sync' | 'async' = 'sync'): ReadableStream<Uint8Array> {
  let offset = 0

  return new ReadableStream({
    async pull(controller) {
      if (delivery === 'async') {
        await new Promise<void>(resolve => setImmediate(resolve))
      }

      if (offset >= body.length) {
        controller.close()
        return
      }

      controller.enqueue(body.subarray(offset, offset += chunkSize))
    },
  })
}

async function collect(body: Buffer, boundary: string, chunkSize: number, delivery?: 'sync' | 'async'): Promise<CollectedPart[]> {
  const parts: CollectedPart[] = []

  await parseMultipart(toStream(body, chunkSize, delivery), boundary, (part) => {
    const chunks: Buffer[] = []

    return {
      write: (chunk) => {
        chunks.push(Buffer.from(chunk))
      },
      end: () => {
        parts.push({ ...part, content: Buffer.concat(chunks) })
      },
    }
  })

  return parts
}

function buildBody(boundary: string, parts: string[][]): Buffer {
  return Buffer.from([
    ...parts.map(lines => [`--${boundary}`, ...lines].join('\r\n')),
    `--${boundary}--`,
    '',
  ].join('\r\n'))
}

describe('parseMultipart', () => {
  const boundary = 'X-TEST-BOUNDARY'

  it('parses fields and files', async () => {
    const body = buildBody(boundary, [
      ['Content-Disposition: form-data; name="field"', '', 'value'],
      ['Content-Disposition: form-data; name="file"; filename="a.txt"', 'Content-Type: text/plain', '', 'file content'],
    ])

    for (const chunkSize of [1, 2, 3, 4, 7, 16, 61, 1024, body.length]) {
      const parts = await collect(body, boundary, chunkSize)

      expect(parts).toHaveLength(2)
      expect(parts[0]).toMatchObject({ name: 'field', filename: undefined, type: undefined, headerSize: Buffer.byteLength('Content-Disposition: form-data; name="field"\r\n\r\n') })
      expect(parts[0]!.content.toString()).toBe('value')
      expect(parts[1]).toMatchObject({ name: 'file', filename: 'a.txt', type: 'text/plain', headerSize: Buffer.byteLength('Content-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\n') })
      expect(parts[1]!.content.toString()).toBe('file content')
    }
  })

  it('keeps content-type parameters, case-insensitive dispositions, and ignores other part headers', async () => {
    const body = buildBody(boundary, [
      ['Content-Disposition: FORM-DATA; name="file"; filename="data.csv"', 'Content-Type: text/csv; charset=utf-8', 'Content-Transfer-Encoding: 7bit', '', 'a,b'],
    ])

    const parts = await collect(body, boundary, 5)
    expect(parts[0]).toMatchObject({ name: 'file', filename: 'data.csv', type: 'text/csv; charset=utf-8' })
    expect(parts[0]!.content.toString()).toBe('a,b')
  })

  it('parses an empty form, empty parts, and an empty filename', async () => {
    expect(await collect(Buffer.from(`--${boundary}--\r\n`), boundary, 3)).toHaveLength(0)

    const body = buildBody(boundary, [
      ['Content-Disposition: form-data; name="empty-field"', '', ''],
      ['Content-Disposition: form-data; name="empty-file"; filename=""', '', ''],
    ])

    const parts = await collect(body, boundary, 5)
    expect(parts[0]).toMatchObject({ name: 'empty-field', filename: undefined })
    expect(parts[0]!.content).toHaveLength(0)
    // An empty filename is still a file part, matching how browsers submit an empty file input
    expect(parts[1]).toMatchObject({ name: 'empty-file', filename: '' })
    expect(parts[1]!.content).toHaveLength(0)
  })

  it('keeps CRLF sequences and boundary fragments inside part bodies intact', async () => {
    const content = `line1\r\nline2\r\n--not-the-boundary\r\n--${boundary.slice(0, -1)}!\rmiddle\ntail--`

    const body = buildBody(boundary, [
      ['Content-Disposition: form-data; name="file"; filename="a.bin"', '', content],
    ])

    for (const chunkSize of [1, 3, 16, body.length]) {
      const parts = await collect(body, boundary, chunkSize)
      expect(parts[0]!.content.toString()).toBe(content)
    }
  })

  it('ignores the preamble, the epilogue, and transport padding after boundaries', async () => {
    const body = Buffer.from([
      'this is a preamble the parser must skip',
      `--${boundary} \t `,
      'Content-Disposition: form-data; name="field"',
      '',
      'value',
      `--${boundary}--`,
      'this is an epilogue the parser must ignore',
    ].join('\r\n'))

    for (const chunkSize of [1, 9, body.length]) {
      const parts = await collect(body, boundary, chunkSize)
      expect(parts).toHaveLength(1)
      expect(parts[0]!.content.toString()).toBe('value')
    }
  })

  it('drops transport padding as it arrives instead of buffering it', async () => {
    // Buffered padding is re-copied and rescanned on every chunk, which would not finish at this size
    const body = Buffer.from(`--${boundary}${' '.repeat(8 * 1024 * 1024)}\r\nContent-Disposition: form-data; name="a"\r\n\r\nv\r\n--${boundary}--\r\n`)

    const parts = await collect(body, boundary, 4096)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.content.toString()).toBe('v')
  })

  it('limits part headers to 16 KiB however the chunks split them', async () => {
    const withHeaderBlock = (size: number): Buffer => {
      const disposition = 'Content-Disposition: form-data; name=""'
      return buildBody(boundary, [[disposition.replace('""', `"${'a'.repeat(size - disposition.length)}"`), '', 'v']])
    }

    const atLimit = withHeaderBlock(16 * 1024)
    const terminator = atLimit.indexOf('\r\n\r\n')

    // Chunks ending inside the terminator must not count its first bytes against the limit
    for (const chunkSize of [997, terminator + 1, terminator + 2, terminator + 3, atLimit.length]) {
      expect(await collect(atLimit, boundary, chunkSize)).toHaveLength(1)
      await expect(collect(withHeaderBlock(16 * 1024 + 1), boundary, chunkSize)).rejects.toThrow('maximum allowed size')
    }

    const oversized = withHeaderBlock(60 * 1024)
    await expect(collect(oversized, boundary, oversized.length)).rejects.toThrow('maximum allowed size')
  })

  it('tolerates leniencies other parsers disagree on', async () => {
    // Space before the header colon, accepted by the standard parser
    const spacedColon = buildBody(boundary, [['Content-Disposition : form-data; name="a"', '', 'va']])
    expect((await collect(spacedColon, boundary, 5))[0]).toMatchObject({ name: 'a' })

    // Junk after the close delimiter is epilogue
    const trailingJunk = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="a"\r\n\r\nva\r\n--${boundary}--tail junk`)
    expect((await collect(trailingJunk, boundary, 5))[0]!.content.toString()).toBe('va')

    // filename* is forbidden in multipart/form-data and stays ignored, leaving a field
    const extendedFilename = buildBody(boundary, [[`Content-Disposition: form-data; name="f"; filename*=utf-8''ext.txt`, '', 'va']])
    expect((await collect(extendedFilename, boundary, 5))[0]).toMatchObject({ name: 'f', filename: undefined })

    // The first occurrence of a duplicate parameter wins
    const duplicated = buildBody(boundary, [['Content-Disposition: form-data; name="first"; name="second"', '', 'va']])
    expect((await collect(duplicated, boundary, 5))[0]).toMatchObject({ name: 'first' })
  })

  it('decodes the serialization escapes in names and filenames', async () => {
    const body = buildBody(boundary, [
      ['Content-Disposition: form-data; name="quo%22ted%0Aname"; filename="my %22quoted%22%0D%0Afile.txt"', '', 'v'],
    ])

    const parts = await collect(body, boundary, 4)
    expect(parts[0]!.name).toBe('quo"ted\nname')
    expect(parts[0]!.filename).toBe('my "quoted"\r\nfile.txt')
  })

  it('keeps quoted content-disposition parameters verbatim, including backslashes', async () => {
    const body = buildBody(boundary, [
      ['Content-Disposition: form-data; name="na;me=x"; filename="C:\\tmp\\a; .png"', '', 'v'],
    ])

    const parts = await collect(body, boundary, 4)
    expect(parts[0]!.name).toBe('na;me=x')
    expect(parts[0]!.filename).toBe('C:\\tmp\\a; .png')
  })

  it('awaits the part writer before feeding more data', async () => {
    const body = buildBody(boundary, [
      ['Content-Disposition: form-data; name="a"; filename="a.bin"', '', 'x'.repeat(256)],
      ['Content-Disposition: form-data; name="b"; filename="b.bin"', '', 'y'.repeat(256)],
    ])

    let inFlight = 0
    let maxInFlight = 0

    await parseMultipart(toStream(body, 7), boundary, () => ({
      write: async () => {
        maxInFlight = Math.max(maxInFlight, ++inFlight)
        await sleep(1)
        inFlight--
      },
      end: () => {},
    }))

    expect(maxInFlight).toBe(1)
  })

  it('rejects malformed bodies', async () => {
    const missingDisposition = buildBody(boundary, [['Content-Type: text/plain', '', 'v']])
    await expect(collect(missingDisposition, boundary, 3)).rejects.toThrow('content-disposition')

    // The standard parser accepts no disposition type other than form-data
    const wrongDisposition = buildBody(boundary, [['Content-Disposition: attachment; name="a"', '', 'v']])
    await expect(collect(wrongDisposition, boundary, 3)).rejects.toThrow('must be form-data')

    const missingName = buildBody(boundary, [['Content-Disposition: form-data; filename="a.txt"', '', 'v']])
    await expect(collect(missingName, boundary, 3)).rejects.toThrow('name parameter')

    const bareDisposition = buildBody(boundary, [['Content-Disposition: form-data', '', 'v']])
    await expect(collect(bareDisposition, boundary, 3)).rejects.toThrow('name parameter')

    const headerWithoutColon = buildBody(boundary, [['Content-Disposition: form-data; name="a"', 'not-a-header', '', 'v']])
    await expect(collect(headerWithoutColon, boundary, 3)).rejects.toThrow('malformed part header')

    const missingHeaders = Buffer.from(`--${boundary}\r\n\r\nv\r\n--${boundary}--\r\n`)
    await expect(collect(missingHeaders, boundary, 3)).rejects.toThrow('content-disposition')

    // A boundary match without a delimiter tail rejects rather than complicating the parse
    const garbageAfterBoundary = Buffer.from(`--${boundary}!!\r\n--${boundary}--\r\n`)
    await expect(collect(garbageAfterBoundary, boundary, 3)).rejects.toThrow('expected CRLF')

    // The dashes of a close delimiter follow the boundary directly, never the transport padding
    const paddedCloseDelimiter = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="a"\r\n\r\nv\r\n--${boundary} \t--\r\n`)
    await expect(collect(paddedCloseDelimiter, boundary, 3)).rejects.toThrow('expected CRLF')

    const falseDelimiterInBody = buildBody(boundary, [
      ['Content-Disposition: form-data; name="a"', '', `content\r\n--${boundary}Xtail`],
    ])
    await expect(collect(falseDelimiterInBody, boundary, 3)).rejects.toThrow('expected CRLF')

    // Multipart line endings are strictly CRLF
    const lfOnly = Buffer.from(buildBody(boundary, [['Content-Disposition: form-data; name="a"', '', 'v']]).toString().replaceAll('\r\n', '\n'))
    await expect(collect(lfOnly, boundary, 3)).rejects.toThrow(TypeError)

    await expect(collect(Buffer.alloc(0), boundary, 3)).rejects.toThrow('unexpected end of body')

    const unboundedHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${'a'.repeat(20 * 1024)}"`)
    await expect(collect(unboundedHeader, boundary, 1024)).rejects.toThrow('maximum allowed size')
  })

  it('rejects truncated bodies wherever the cut lands', async () => {
    const body = buildBody(boundary, [
      ['Content-Disposition: form-data; name="field"', '', 'value'],
      ['Content-Disposition: form-data; name="file"; filename="a.txt"', 'Content-Type: text/plain', '', 'file content'],
    ])

    // Anywhere before the closing `--` of the final delimiter is incomplete
    for (let end = 1; end < body.length - 3; end += 13) {
      await expect(collect(body.subarray(0, end), boundary, 8)).rejects.toThrow(TypeError)
    }
  })

  describe('differential against the standard parser', () => {
    async function expectMatchesStandardParser(form: FormData, chunkSizes: number[], delivery?: 'sync' | 'async'): Promise<void> {
      const response = new Response(form)
      const contentType = response.headers.get('content-type')!
      const body = Buffer.from(await response.arrayBuffer())
      const boundary = parseHeaderParameters(contentType).get('boundary')!

      const expected = await new Response(body, { headers: { 'content-type': contentType } }).formData()
      const expectedEntries = [...expected]

      for (const chunkSize of chunkSizes) {
        const parts = await collect(body, boundary, chunkSize, delivery)

        expect(parts).toHaveLength(expectedEntries.length)

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]!
          const [expectedName, expectedValue] = expectedEntries[i]!

          expect(part.name).toBe(expectedName)

          if (typeof expectedValue === 'string') {
            expect(part.filename).toBeUndefined()
            expect(part.content.toString()).toBe(expectedValue)
          }
          else {
            expect(part.type ?? 'text/plain').toBe(expectedValue.type)
            expect(part.content.equals(Buffer.from(await expectedValue.arrayBuffer()))).toBe(true)
          }
        }
      }
    }

    it('parses what the standard parser parses', async () => {
      const form = new FormData()
      form.append('field', 'value')
      form.append('field', 'value 2 for the same name')
      form.append('unicode', 'tiếng Việt 🚀')
      form.append('quo"ted\nname', 'escaped by the serializer')
      form.append('file', new File(['file content'], 'tệp tin 🚀.txt', { type: 'text/plain' }))
      form.append('escapes', new File(['x'], 'my "quoted"\r\nfile.txt', { type: 'text/plain' }))
      form.append('binary', new File([new Uint8Array([0, 1, 2, 253, 254, 255])], 'raw.bin', { type: 'application/octet-stream' }))
      form.append('empty', new File([], 'empty.bin'))

      await expectMatchesStandardParser(form, [1, 2, 3, 7, 64, 1024, 1024 * 1024])
      await expectMatchesStandardParser(form, [1, 3, 61], 'async')
    })

    it('parses randomized forms identically at randomized chunk sizes', async () => {
      // Deterministic PRNG so a failure reproduces
      let seed = 0x2F6E2B1
      const random = (): number => {
        seed = (seed * 1664525 + 1013904223) % 4294967296
        return seed / 4294967296
      }

      const fragments = ['\r', '\n', '\r\n', '--', '\r\n--', 'formdata-', 'a', '"', ';', 'é', '🚀', '\0', '\r\n--formdata']

      for (let iteration = 0; iteration < 25; iteration++) {
        const form = new FormData()
        const partCount = 1 + Math.floor(random() * 6)

        for (let i = 0; i < partCount; i++) {
          let content = ''
          const fragmentCount = Math.floor(random() * 200)
          for (let j = 0; j < fragmentCount; j++) {
            content += fragments[Math.floor(random() * fragments.length)]
          }

          if (random() < 0.5) {
            form.append(`field-${i}`, content)
          }
          else {
            form.append(`file-${i}`, new File([content], `file-${i}.bin`, { type: random() < 0.5 ? 'application/octet-stream' : '' }))
          }
        }

        const chunkSize = [1, 2, 3, 5, 8, 64, 997, 8192][Math.floor(random() * 8)]!
        await expectMatchesStandardParser(form, [chunkSize], iteration % 2 === 0 ? 'async' : 'sync')
      }
    })
  })
})

describe('parseHeaderParameters', () => {
  it('parses tokens and quoted strings, keeping backslashes literal', () => {
    expect(parseHeaderParameters('multipart/form-data; boundary=----abc=123')).toEqual(new Map([['boundary', '----abc=123']]))
    expect(parseHeaderParameters('multipart/form-data; boundary="b;=x"; charset=utf-8')).toEqual(new Map([['boundary', 'b;=x'], ['charset', 'utf-8']]))
    expect(parseHeaderParameters('form-data; name="a\\b"; filename="c\\\\d.txt"')).toEqual(new Map([['name', 'a\\b'], ['filename', 'c\\\\d.txt']]))
    expect(parseHeaderParameters('form-data;\t name = spaced ; filename=trailing ')).toEqual(new Map([['name', 'spaced'], ['filename', 'trailing']]))
  })

  it('keeps the first occurrence of a parameter', () => {
    expect(parseHeaderParameters('form-data; name=first; name=second')).toEqual(new Map([['name', 'first']]))
  })

  it('skips parameters without a value', () => {
    expect(parseHeaderParameters('form-data; x; name=a')).toEqual(new Map([['name', 'a']]))
    expect(parseHeaderParameters('form-data; name=a; trailing')).toEqual(new Map([['name', 'a']]))
    expect(parseHeaderParameters('form-data; only')).toEqual(new Map())
  })

  it('stays linear on a long run of parameters without values', () => {
    // Searching past each semicolon for an equals sign would not finish at this size
    expect(parseHeaderParameters(`form-data${'; x'.repeat(256 * 1024)}; name=a`)).toEqual(new Map([['name', 'a']]))
    expect(parseHeaderParameters(`form-data${';'.repeat(1024 * 1024)}`)).toEqual(new Map())
  })

  it('returns nothing without parameters and survives malformed input', () => {
    expect(parseHeaderParameters('form-data')).toEqual(new Map())
    expect(parseHeaderParameters('form-data; ')).toEqual(new Map())
    expect(parseHeaderParameters('form-data; name="unterminated')).toEqual(new Map([['name', 'unterminated']]))
  })
})
