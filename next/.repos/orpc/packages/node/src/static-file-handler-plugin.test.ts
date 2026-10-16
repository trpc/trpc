import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { StaticFileHandlerPluginOptions } from './static-file-handler-plugin'
import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { os } from '@orpc/server'
import { RPCHandler as FetchRPCHandler } from '@orpc/server/fetch'
import { RPCHandler } from '@orpc/server/node'
import { ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'
import * as sharedModule from '@orpc/shared'
import request from 'supertest'
import { StaticFileHandlerPlugin } from './static-file-handler-plugin'

describe('staticFileHandlerPlugin', () => {
  let baseDir: string
  let rootDir: string
  let helloEtag: string
  let helloLastModified: string

  beforeAll(async () => {
    baseDir = mkdtempSync(path.join(tmpdir(), 'orpc-static-file-'))
    rootDir = path.join(baseDir, 'public')
    mkdirSync(rootDir)

    // A file outside the root, so a successful traversal would serve real content
    writeFileSync(path.join(baseDir, 'secret.txt'), 'outside root')

    writeFileSync(path.join(rootDir, 'index.html'), '<h1>home</h1>')
    writeFileSync(path.join(rootDir, 'hello.txt'), 'hello world')
    writeFileSync(path.join(rootDir, 'data.bin'), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))
    writeFileSync(path.join(rootDir, 'no-extension'), 'binary-ish')
    writeFileSync(path.join(rootDir, '.secret'), 'dotfile')
    writeFileSync(path.join(rootDir, 'empty.txt'), '')

    mkdirSync(path.join(rootDir, 'nested'))
    writeFileSync(path.join(rootDir, 'nested', 'index.html'), '<h1>nested</h1>')
    writeFileSync(path.join(rootDir, 'nested', 'style.css'), 'body{}')

    mkdirSync(path.join(rootDir, 'no-index'))
    writeFileSync(path.join(rootDir, 'no-index', 'file.txt'), 'inside')

    writeFileSync(path.join(rootDir, 'compressed.txt'), 'identity content')
    writeFileSync(path.join(rootDir, 'compressed.txt.gz'), gzipSync('gzip content'))
    writeFileSync(path.join(rootDir, 'compressed.txt.br'), brotliCompressSync('br content'))
    writeFileSync(path.join(rootDir, 'compressed.bin'), 'binary identity')
    writeFileSync(path.join(rootDir, 'compressed.bin.gz'), gzipSync('binary gzip'))

    // A directory where a sidecar would be, so the candidate resolves but is not a file
    writeFileSync(path.join(rootDir, 'dir-sidecar.txt'), 'identity content')
    mkdirSync(path.join(rootDir, 'dir-sidecar.txt.br'))

    const res = await createStaticAgent().get('/hello.txt')
    helloEtag = res.headers.etag!
    helloLastModified = res.headers['last-modified']!
  })

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  function createAgent(handler: RPCHandler<Record<never, never>>, options: { prefix?: `/${string}` } = {}) {
    return request(async (req: IncomingMessage, response: ServerResponse) => {
      const result = await handler.handle(req as any, response as any, { context: {}, ...options })

      if (!result.matched) {
        response.statusCode = 404
        response.end('not matched')
      }
    })
  }

  function createStaticAgent(pluginOptions: Partial<StaticFileHandlerPluginOptions> = {}, handleOptions: { prefix?: `/${string}` } = {}) {
    const handler = new RPCHandler({}, {
      plugins: [new StaticFileHandlerPlugin({ rootDir, ...pluginOptions })],
    })

    return createAgent(handler, handleOptions)
  }

  /**
   * supertest and fetch both normalize the request target with the WHATWG url parser,
   * which resolves dot segments and collapses leading slashes before the server sees them.
   * These attacks only reach the plugin through a client that sends the target verbatim.
   */
  async function createRawClient(pluginOptions: Partial<StaticFileHandlerPluginOptions> = {}) {
    const handler = new RPCHandler({}, {
      plugins: [new StaticFileHandlerPlugin({ rootDir, ...pluginOptions })],
    })

    const server = createServer(async (req, res) => {
      const result = await handler.handle(req, res, { context: {} })

      if (!result.matched) {
        res.statusCode = 404
        res.end('not matched')
      }
    })

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    return {
      close: () => {
        server.close()
      },
      get: (target: string) => new Promise<{ status: number | undefined, location: string | undefined, body: string }>((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, path: target }, (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', chunk => body += chunk)
          res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }))
        })
        req.on('error', reject)
        req.end()
      }),
    }
  }

  it('serves a file with standard headers', async () => {
    const res = await createStaticAgent().get('/hello.txt')

    expect(res.status).toBe(200)
    expect(res.text).toBe('hello world')
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(res.headers['content-length']).toBe('11')
    expect(res.headers['cache-control']).toBe('public, max-age=0')
    expect(res.headers['accept-ranges']).toBe('bytes')
    expect(res.headers.etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/)
    expect(res.headers['last-modified']).toBe(statSync(path.join(rootDir, 'hello.txt')).mtime.toUTCString())
    // Guards against a Blob body, which would make the adapter attach a content-disposition
    expect(res.headers['content-disposition']).toBeUndefined()
  })

  it('serves an empty file', async () => {
    const res = await createStaticAgent().get('/empty.txt')

    expect(res.status).toBe(200)
    expect(res.text).toBe('')
    expect(res.headers['content-length']).toBe('0')
  })

  it('serves unknown extensions as application/octet-stream', async () => {
    const res = await createStaticAgent().get('/no-extension')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
  })

  it('detects content types beyond the common web set', async () => {
    const agent = createStaticAgent()

    // Types a hand-maintained table tends to miss, and the charset rule applied to each.
    // json carries no charset, the parameter is undefined for it rather than merely redundant.
    for (const [name, contentType] of [
      ['captions.vtt', 'text/vtt; charset=utf-8'],
      ['playlist.m3u8', 'application/vnd.apple.mpegurl'],
      ['calendar.ics', 'text/calendar; charset=utf-8'],
      ['favicon.ico', 'image/vnd.microsoft.icon'],
      ['archive.tar', 'application/x-tar'],
      ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['data.json', 'application/json'],
      ['bundle.js.map', 'application/json'],
    ] as const) {
      // Valid json, so the test client's own json parser does not choke on the two json cases
      writeFileSync(path.join(rootDir, name), '{}')

      const res = await agent.get(`/${name}`)
      expect(res.status, name).toBe(200)
      expect(res.headers['content-type'], name).toBe(contentType)
    }
  })

  it('does not resolve content types through the prototype chain', async () => {
    writeFileSync(path.join(rootDir, 'file.constructor'), 'x')
    writeFileSync(path.join(rootDir, 'file.__proto__'), 'x')

    const agent = createStaticAgent()

    for (const url of ['/file.constructor', '/file.__proto__']) {
      const res = await agent.get(url)
      expect(res.status, url).toBe(200)
      expect(res.headers['content-type'], url).toBe('application/octet-stream')
    }
  })

  it('supports custom cache control and mime types', async () => {
    const agent = createStaticAgent({
      cacheControl: 'public, max-age=31536000, immutable',
      mimeTypes: { txt: 'text/x-custom' },
    })

    const res = await agent.get('/hello.txt')

    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(res.headers['content-type']).toBe('text/x-custom')
  })

  it('omits cache-control when disabled', async () => {
    const res = await createStaticAgent({ cacheControl: false }).get('/hello.txt')

    expect(res.headers['cache-control']).toBeUndefined()
  })

  it('falls through when no file matches', async () => {
    const res = await createStaticAgent().get('/missing.txt')

    expect(res.status).toBe(404)
    expect(res.text).toBe('not matched')
  })

  it('ignores non-GET/HEAD requests', async () => {
    const res = await createStaticAgent().post('/hello.txt')

    expect(res.status).toBe(404)
    expect(res.text).toBe('not matched')
  })

  it('prefers matched procedures over files', async () => {
    const handler = new RPCHandler({
      ping: os.handler(() => 'pong'),
    }, {
      allowMethods: ['GET'],
      plugins: [new StaticFileHandlerPlugin({ rootDir })],
    })

    writeFileSync(path.join(rootDir, 'ping'), 'file content')

    const res = await createAgent(handler).get(`/ping?data=${encodeURIComponent(JSON.stringify({ json: null }))}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('pong')
  })

  describe('head requests', () => {
    it('sends headers without a body', async () => {
      const res = await createStaticAgent().head('/hello.txt')

      expect(res.status).toBe(200)
      expect(res.text).toBeUndefined()
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
      expect(res.headers['content-length']).toBe('11')
      expect(res.headers.etag).toMatch(/^"/)
    })

    it('ignores range headers', async () => {
      const res = await createStaticAgent().head('/data.bin').set('range', 'bytes=0-3')

      expect(res.status).toBe(200)
      expect(res.headers['content-length']).toBe('10')
    })
  })

  describe('conditional requests', () => {
    it('responds 304 when if-none-match matches', async () => {
      const res = await createStaticAgent().get('/hello.txt').set('if-none-match', helloEtag)

      expect(res.status).toBe(304)
      expect(res.text).toBe('')
      expect(res.headers.etag).toBe(helloEtag)
      expect(res.headers['content-type']).toBeUndefined()
      expect(res.headers['content-length']).toBeUndefined()
    })

    it('responds 304 when if-none-match contains the etag in a list or is a wildcard', async () => {
      const agent = createStaticAgent()

      const listRes = await agent.get('/hello.txt').set('if-none-match', `"other", ${helloEtag}`)
      expect(listRes.status).toBe(304)

      const wildcardRes = await agent.get('/hello.txt').set('if-none-match', '*')
      expect(wildcardRes.status).toBe(304)
    })

    it('responds 304 when if-none-match carries the weak form of the etag', async () => {
      // If-None-Match uses the weak comparison function, and caches may add the W/ prefix
      const res = await createStaticAgent().get('/hello.txt').set('if-none-match', `W/${helloEtag}`)

      expect(res.status).toBe(304)
    })

    it('responds 200 when if-none-match does not match', async () => {
      const res = await createStaticAgent().get('/hello.txt').set('if-none-match', '"different"')

      expect(res.status).toBe(200)
      expect(res.text).toBe('hello world')
    })

    it('responds 304 when not modified since if-modified-since', async () => {
      const res = await createStaticAgent().get('/hello.txt').set('if-modified-since', helloLastModified)

      expect(res.status).toBe(304)
    })

    it('responds 200 when modified after if-modified-since', async () => {
      const past = new Date(Date.now() - 100_000_000).toUTCString()
      const res = await createStaticAgent().get('/hello.txt').set('if-modified-since', past)

      expect(res.status).toBe(200)
    })

    it('if-none-match takes precedence over if-modified-since', async () => {
      const res = await createStaticAgent().get('/hello.txt').set('if-none-match', '"different"').set('if-modified-since', helloLastModified)

      expect(res.status).toBe(200)
    })

    it('responds 412 when if-match or if-unmodified-since fails', async () => {
      const agent = createStaticAgent()

      expect((await agent.get('/hello.txt').set('if-match', '"nope"')).status).toBe(412)
      expect((await agent.get('/hello.txt').set('if-match', helloEtag)).status).toBe(200)
      expect((await agent.get('/hello.txt').set('if-match', '*')).status).toBe(200)
      expect((await agent.get('/hello.txt').set('if-match', `"other", ${helloEtag}`)).status).toBe(200)

      const past = new Date(Date.now() - 100_000_000).toUTCString()
      expect((await agent.get('/hello.txt').set('if-unmodified-since', past)).status).toBe(412)

      const future = new Date(Date.now() + 100_000).toUTCString()
      expect((await agent.get('/hello.txt').set('if-unmodified-since', future)).status).toBe(200)

      // An unparsable date and an empty list are malformed, so both are ignored
      expect((await agent.get('/hello.txt').set('if-unmodified-since', 'not a date')).status).toBe(200)
      expect((await agent.get('/hello.txt').set('if-match', '  ')).status).toBe(200)
    })

    it('revalidates to 304 even when the client sends cache-control no-cache, like fetch does', async () => {
      const res = await createStaticAgent().get('/hello.txt').set('if-none-match', helloEtag).set('cache-control', 'no-cache')

      expect(res.status).toBe(304)
    })
  })

  describe('range requests', () => {
    it('serves a partial response', async () => {
      const res = await createStaticAgent().get('/data.bin').set('range', 'bytes=2-5')

      expect(res.status).toBe(206)
      expect(res.headers['content-range']).toBe('bytes 2-5/10')
      expect(res.headers['content-length']).toBe('4')
      expect(res.body).toEqual(Buffer.from([2, 3, 4, 5]))
    })

    it('serves an open-ended range', async () => {
      const res = await createStaticAgent().get('/data.bin').set('range', 'bytes=7-')

      expect(res.status).toBe(206)
      expect(res.headers['content-range']).toBe('bytes 7-9/10')
      expect(res.body).toEqual(Buffer.from([7, 8, 9]))
    })

    it('serves a suffix range', async () => {
      const res = await createStaticAgent().get('/data.bin').set('range', 'bytes=-3')

      expect(res.status).toBe(206)
      expect(res.headers['content-range']).toBe('bytes 7-9/10')
      expect(res.body).toEqual(Buffer.from([7, 8, 9]))
    })

    it('clamps ranges past the end of the file', async () => {
      const res = await createStaticAgent().get('/data.bin').set('range', 'bytes=8-100')

      expect(res.status).toBe(206)
      expect(res.headers['content-range']).toBe('bytes 8-9/10')
    })

    it('responds 416 when the range is unsatisfiable', async () => {
      const res = await createStaticAgent().get('/data.bin').set('range', 'bytes=100-')

      expect(res.status).toBe(416)
      expect(res.headers['content-range']).toBe('bytes */10')
    })

    it('ignores malformed and multi-range headers', async () => {
      const agent = createStaticAgent()

      const malformedRes = await agent.get('/data.bin').set('range', 'bytes=abc')
      expect(malformedRes.status).toBe(200)

      const multiRes = await agent.get('/data.bin').set('range', 'bytes=0-1,3-4')
      expect(multiRes.status).toBe(200)

      const invertedRes = await agent.get('/data.bin').set('range', 'bytes=5-2')
      expect(invertedRes.status).toBe(200)
    })

    it('ignores the range when if-range does not match', async () => {
      const res = await createStaticAgent().get('/data.bin').set('range', 'bytes=0-3').set('if-range', new Date(Date.now() - 100_000_000).toUTCString())

      expect(res.status).toBe(200)
      expect(res.headers['content-length']).toBe('10')
    })

    it('applies the range when if-range matches the last modified date', async () => {
      const res = await createStaticAgent().get('/data.bin').set('range', 'bytes=0-3').set('if-range', statSync(path.join(rootDir, 'data.bin')).mtime.toUTCString())

      expect(res.status).toBe(206)
    })

    it('applies the range when if-range matches the etag and ignores it otherwise', async () => {
      const agent = createStaticAgent()
      const etag = (await agent.get('/data.bin')).headers.etag!

      const matching = await agent.get('/data.bin').set('range', 'bytes=0-3').set('if-range', etag)
      expect(matching.status).toBe(206)
      expect(matching.headers['content-range']).toBe('bytes 0-3/10')

      const mismatching = await agent.get('/data.bin').set('range', 'bytes=0-3').set('if-range', '"other"')
      expect(mismatching.status).toBe(200)
      expect(mismatching.headers['content-length']).toBe('10')

      // A weak tag can never satisfy the strong comparison if-range requires
      const weak = await agent.get('/data.bin').set('range', 'bytes=0-3').set('if-range', `W/${etag}`)
      expect(weak.status).toBe(200)
    })

    it('responds 416 for a zero length suffix range and for any suffix range on an empty file', async () => {
      const agent = createStaticAgent()

      const zeroSuffixRes = await agent.get('/data.bin').set('range', 'bytes=-0')
      expect(zeroSuffixRes.status).toBe(416)
      expect(zeroSuffixRes.headers['content-range']).toBe('bytes */10')

      const emptyFileRes = await agent.get('/empty.txt').set('range', 'bytes=-3')
      expect(emptyFileRes.status).toBe(416)
      expect(emptyFileRes.headers['content-range']).toBe('bytes */0')
    })

    it('accepts whitespace and uppercase in the range unit', async () => {
      const agent = createStaticAgent()

      const spacedRes = await agent.get('/data.bin').set('range', 'bytes= 0-3')
      expect(spacedRes.status).toBe(206)
      expect(spacedRes.headers['content-range']).toBe('bytes 0-3/10')

      const upperRes = await agent.get('/data.bin').set('range', 'BYTES=0-3')
      expect(upperRes.status).toBe(206)
    })
  })

  describe('directories and index files', () => {
    it('serves the index file for the root path', async () => {
      const res = await createStaticAgent().get('/')

      expect(res.status).toBe(200)
      expect(res.text).toBe('<h1>home</h1>')
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    })

    it('serves the index file of a nested directory', async () => {
      const res = await createStaticAgent().get('/nested/')

      expect(res.status).toBe(200)
      expect(res.text).toBe('<h1>nested</h1>')
    })

    it('redirects directories without a trailing slash, preserving the query', async () => {
      const res = await createStaticAgent().get('/nested?foo=bar')

      expect(res.status).toBe(301)
      expect(res.headers.location).toBe('/nested/?foo=bar')
    })

    it('applies the cache policy to the directory redirect', async () => {
      const res = await createStaticAgent().get('/nested')
      expect(res.status).toBe(301)
      expect(res.headers['cache-control']).toBe('public, max-age=0')

      const disabledRes = await createStaticAgent({ cacheControl: false }).get('/nested')
      expect(disabledRes.status).toBe(301)
      expect(disabledRes.headers['cache-control']).toBeUndefined()
    })

    it('does not serve a file for a url with a trailing slash', async () => {
      const res = await createStaticAgent().get('/hello.txt/')

      expect(res.status).toBe(404)

      // With a fallback configured the url is treated like any other unmatched route
      const fallbackRes = await createStaticAgent({ fallbackFile: 'index.html' }).get('/hello.txt/')
      expect(fallbackRes.status).toBe(200)
      expect(fallbackRes.text).toBe('<h1>home</h1>')
    })

    it('falls through instead of redirecting when index files are disabled', async () => {
      const res = await createStaticAgent({ indexFile: false }).get('/nested')

      expect(res.status).toBe(404)
    })

    it('falls through when the directory has no index file', async () => {
      const res = await createStaticAgent().get('/no-index/')

      expect(res.status).toBe(404)
    })

    it('supports disabling index files', async () => {
      const res = await createStaticAgent({ indexFile: false }).get('/nested/')

      expect(res.status).toBe(404)
    })

    it('supports a custom index file', async () => {
      const res = await createStaticAgent({ indexFile: 'file.txt' }).get('/no-index/')

      expect(res.status).toBe(200)
      expect(res.text).toBe('inside')
    })
  })

  describe('security', () => {
    it('blocks directory traversal', async () => {
      const agent = createStaticAgent()

      const urls = [
        '/../secret.txt',
        '/%2e%2e/secret.txt',
        '/%2E%2E/secret.txt',
        '/..%2fsecret.txt',
        '/%2e%2e%2fsecret.txt',
        '/%252e%252e/secret.txt',
        '/..%c0%af/secret.txt',
        '/nested/%2e%2e/%2e%2e/secret.txt',
        '/foo%5c..%5cbar.txt',
        '/foo%2fbar.txt',
        '/....//secret.txt',
        '/..;/secret.txt',
        '/..%00/secret.txt',
        '/%c0%ae%c0%ae/secret.txt',
        '/..%5csecret.txt',
        '/%2e%2e%5csecret.txt',
        '/..%252fsecret.txt',
        '/.%2e/secret.txt',
        '/./../secret.txt',
      ]

      for (const url of urls) {
        const res = await agent.get(url)
        expect(res.status, url).toBe(404)
        expect(res.text, url).toBe('not matched')
      }
    })

    it('blocks directory traversal when dotfiles are enabled', async () => {
      const agent = createStaticAgent({ dotfiles: true })

      for (const url of ['/../secret.txt', '/..%c0%af/secret.txt', '/..%c0%afsecret.txt', '/..%2fsecret.txt']) {
        expect((await agent.get(url)).status, url).toBe(404)
      }
    })

    it('resolves dot segments within the root instead of following them', async () => {
      const agent = createStaticAgent()

      const inside = await agent.get('/nested/%2e%2e/hello.txt')
      expect(inside.status).toBe(200)
      expect(inside.text).toBe('hello world')

      const clamped = await agent.get('/%2e%2e/%2e%2e/%2e%2e/hello.txt')
      expect(clamped.status).toBe(200)
      expect(clamped.text).toBe('hello world')
    })

    it('resolves dot segments sent verbatim by a client that does not normalize them', async ({ onTestFinished }) => {
      const client = await createRawClient()
      onTestFinished(() => client.close())

      const inside = await client.get('/nested/../hello.txt')
      expect(inside.status).toBe(200)
      expect(inside.body).toBe('hello world')

      // Climbing above the served path is refused rather than clamped, so a proxy in front of
      // this plugin can never disagree with it about which path was requested
      const above = await client.get('/../../../hello.txt')
      expect(above.status).toBe(404)
      expect(above.body).toBe('not matched')

      // secret.txt really exists one directory above the root, so this asserts a blocked escape
      const traversed = await client.get('/nested/../../secret.txt')
      expect(traversed.status).toBe(404)
      expect(traversed.body).toBe('not matched')
    })

    it('refuses dot segments that climb above the mounted path', async ({ onTestFinished }) => {
      const client = await createRawClient({ path: '/assets' })
      onTestFinished(() => client.close())

      const above = await client.get('/assets/../../hello.txt')
      expect(above.status).toBe(404)
      expect(above.body).toBe('not matched')

      // Dot segments that stay within the mount are still resolved
      const inside = await client.get('/assets/nested/../hello.txt')
      expect(inside.status).toBe(200)
      expect(inside.body).toBe('hello world')
    })

    it('never redirects to a protocol relative location', async ({ onTestFinished }) => {
      const client = await createRawClient()
      onTestFinished(() => client.close())

      // Without rebuilding the location these resolve to http://attacker.example
      const rootRes = await client.get('//attacker.example/..')
      expect(rootRes.status).toBe(301)
      expect(rootRes.location).toBe('/')

      const nestedRes = await client.get('//attacker.example/../nested')
      expect(nestedRes.status).toBe(301)
      expect(nestedRes.location).toBe('/nested/')
    })

    it('never serves index or fallback files that escape the root', async ({ onTestFinished }) => {
      const siblingDir = `${rootDir}-secret`
      mkdirSync(siblingDir, { recursive: true })
      writeFileSync(path.join(siblingDir, 'x.txt'), 'sibling secret')
      onTestFinished(() => rmSync(siblingDir, { recursive: true, force: true }))

      // The second form would escape if the root prefix lost its trailing separator
      for (const file of ['../secret.txt', `../${path.basename(siblingDir)}/x.txt`]) {
        expect((await createStaticAgent({ indexFile: file }).get('/')).status, file).toBe(404)
        expect((await createStaticAgent({ fallbackFile: file }).get('/missing.txt')).status, file).toBe(404)
      }

      // A path that leaves and re-enters the root is still served
      const inside = await createStaticAgent({ fallbackFile: 'nested/../hello.txt' }).get('/missing.txt')
      expect(inside.status).toBe(200)
    })

    it('serves configured index and fallback files even when they are dotfiles', async () => {
      expect((await createStaticAgent({ indexFile: '.secret' }).get('/')).status).toBe(200)
      expect((await createStaticAgent({ fallbackFile: '.secret' }).get('/missing')).status).toBe(200)

      // Request paths are still blocked
      expect((await createStaticAgent({ fallbackFile: 'index.html' }).get('/.secret')).status).toBe(404)
    })

    it('never follows symlinks that leave the root', async ({ onTestFinished }) => {
      const outsideDir = path.join(baseDir, 'outside-dir')
      mkdirSync(outsideDir, { recursive: true })
      writeFileSync(path.join(outsideDir, 'file.txt'), 'outside dir')
      symlinkSync(path.join(baseDir, 'secret.txt'), path.join(rootDir, 'link.txt'))
      symlinkSync(baseDir, path.join(rootDir, 'up'))
      symlinkSync(outsideDir, path.join(rootDir, 'linkdir'))
      symlinkSync(path.join(rootDir, '.secret'), path.join(rootDir, 'notdot.txt'))
      onTestFinished(() => {
        for (const name of ['link.txt', 'up', 'linkdir', 'notdot.txt']) {
          rmSync(path.join(rootDir, name), { force: true })
        }
        rmSync(outsideDir, { recursive: true, force: true })
      })

      const agent = createStaticAgent()

      for (const url of ['/link.txt', '/up/secret.txt', '/linkdir/file.txt']) {
        expect((await agent.get(url)).status, url).toBe(404)
      }

      const allowedRes = await createStaticAgent({ allowSymlinks: true }).get('/link.txt')
      expect(allowedRes.status).toBe(200)
      expect(allowedRes.text).toBe('outside root')

      // Dotfile hiding is a url policy, so a link inside the root to a dotfile still resolves
      expect((await agent.get('/notdot.txt')).text).toBe('dotfile')
    })

    it('never serves a precompressed sidecar that leaves the root', async ({ onTestFinished }) => {
      writeFileSync(path.join(baseDir, 'evil.gz'), gzipSync('outside gzip'))
      writeFileSync(path.join(rootDir, 'sidecar.txt'), 'identity content')
      symlinkSync(path.join(baseDir, 'evil.gz'), path.join(rootDir, 'sidecar.txt.gz'))
      onTestFinished(() => rmSync(path.join(rootDir, 'sidecar.txt.gz'), { force: true }))

      const res = await createStaticAgent({ precompressed: true }).get('/sidecar.txt').set('accept-encoding', 'gzip')

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBeUndefined()
      expect(res.text).toBe('identity content')
    })

    it('serves files when rootDir itself is a symlink', async ({ onTestFinished }) => {
      const linkedRoot = path.join(baseDir, 'rootlink')
      symlinkSync(rootDir, linkedRoot)
      onTestFinished(() => rmSync(linkedRoot, { force: true }))

      expect((await createStaticAgent({ rootDir: linkedRoot }).get('/hello.txt')).status).toBe(200)
    })

    it('falls through when rootDir does not exist', async () => {
      const res = await createStaticAgent({ rootDir: path.join(baseDir, 'nope') }).get('/hello.txt')

      expect(res.status).toBe(404)
    })

    it('rejects paths containing null bytes', async () => {
      const res = await createStaticAgent().get('/hello.txt%00.png')

      expect(res.status).toBe(404)
    })

    it('hides dotfiles by default and serves them when enabled', async () => {
      const hiddenRes = await createStaticAgent().get('/.secret')
      expect(hiddenRes.status).toBe(404)

      const allowedRes = await createStaticAgent({ dotfiles: true }).get('/.secret')
      expect(allowedRes.status).toBe(200)
      expect(allowedRes.body).toEqual(Buffer.from('dotfile'))
    })

    it('refuses 8.3 short names that can alias dotfiles', async () => {
      // A refused path falls through before the fallback, while an allowed missing one is answered by it
      const agent = createStaticAgent({ fallbackFile: 'hello.txt' })

      for (const url of ['/ENV~1', '/env~1', '/HTACCE~1', '/ENV~1.LOC', '/ENV~1.', '/ENV~1::$DATA', '/GIT~1/config', '/nested/GIT~1/HEAD']) {
        expect((await agent.get(url)).status, url).toBe(404)
      }

      // A tilde that cannot be the numeric tail of a short name is an ordinary character
      for (const url of ['/vendors~main~1a2b.js', '/index.html~', '/~user', '/a.b~1']) {
        expect((await agent.get(url)).status, url).toBe(200)
      }

      expect((await createStaticAgent({ fallbackFile: 'hello.txt', dotfiles: true }).get('/ENV~1')).status).toBe(200)
    })
  })

  describe('mounting', () => {
    it('serves files under a custom path', async () => {
      const agent = createStaticAgent({ path: '/assets' })

      const res = await agent.get('/assets/hello.txt')
      expect(res.status).toBe(200)
      expect(res.text).toBe('hello world')

      const outsideRes = await agent.get('/hello.txt')
      expect(outsideRes.status).toBe(404)

      const partialPrefixRes = await agent.get('/assetshello.txt')
      expect(partialPrefixRes.status).toBe(404)
    })

    it('serves files under the handler prefix', async () => {
      const agent = createStaticAgent({}, { prefix: '/api' })

      const res = await agent.get('/api/hello.txt')
      expect(res.status).toBe(200)
      expect(res.text).toBe('hello world')
    })

    it('combines the handler prefix and the path option', async () => {
      const agent = createStaticAgent({ path: '/assets' }, { prefix: '/api' })

      const res = await agent.get('/api/assets/hello.txt')
      expect(res.status).toBe(200)

      const outsideRes = await agent.get('/api/hello.txt')
      expect(outsideRes.status).toBe(404)
    })

    it('redirects a mounted directory path without a trailing slash', async () => {
      const res = await createStaticAgent({ path: '/assets' }).get('/assets')

      expect(res.status).toBe(301)
      expect(res.headers.location).toBe('/assets/')
    })

    it('normalizes a trailing slash in the path option', async () => {
      const agent = createStaticAgent({ path: '/assets/' })

      const res = await agent.get('/assets/hello.txt')
      expect(res.status).toBe(200)
      expect(res.text).toBe('hello world')

      const redirectRes = await agent.get('/assets')
      expect(redirectRes.status).toBe(301)
      expect(redirectRes.headers.location).toBe('/assets/')
    })

    it.skipIf(process.platform === 'win32')('supports a rootDir that is the filesystem root', async () => {
      const res = await createStaticAgent({ rootDir: path.parse(rootDir).root }).get(path.join(rootDir, 'hello.txt'))

      expect(res.status).toBe(200)
      expect(res.text).toBe('hello world')
    })
  })

  describe('precompressed', () => {
    it('serves the precompressed variant when the client accepts its encoding', async () => {
      const res = await createStaticAgent({ precompressed: true })
        .get('/compressed.txt')
        .set('accept-encoding', 'gzip')

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBe('gzip')
      expect(res.headers.vary).toBe('accept-encoding')
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
      expect(res.text).toBe('gzip content')
    })

    it('prefers brotli over gzip', async () => {
      const res = await createStaticAgent({ precompressed: true })
        .get('/compressed.txt')
        .set('accept-encoding', 'gzip;q=0.8, br;q=0.9')

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBe('br')
      expect(res.text).toBe('br content')
    })

    it('serves the identity variant with vary when no encoding is accepted', async () => {
      const res = await createStaticAgent({ precompressed: true })
        .get('/compressed.txt')
        .set('accept-encoding', 'identity')

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBeUndefined()
      expect(res.headers.vary).toBe('accept-encoding')
      expect(res.text).toBe('identity content')
    })

    it('is disabled by default', async () => {
      const res = await createStaticAgent()
        .get('/compressed.txt')
        .set('accept-encoding', 'gzip')

      expect(res.headers['content-encoding']).toBeUndefined()
      expect(res.headers.vary).toBeUndefined()
      expect(res.text).toBe('identity content')
    })

    it('honors accept-encoding q-values', async () => {
      const agent = createStaticAgent({ precompressed: true })

      const rejectedRes = await agent.get('/compressed.txt').set('accept-encoding', 'gzip;q=0')
      expect(rejectedRes.headers['content-encoding']).toBeUndefined()
      expect(rejectedRes.text).toBe('identity content')

      const wildcardRes = await agent.get('/compressed.txt').set('accept-encoding', '*')
      expect(wildcardRes.headers['content-encoding']).toBe('br')

      // An empty list element is skipped rather than matching an empty coding
      const emptyElementRes = await agent.get('/compressed.txt').set('accept-encoding', 'gzip,,')
      expect(emptyElementRes.headers['content-encoding']).toBe('gzip')
    })

    it('lets an explicit q-value take precedence over the wildcard', async () => {
      const agent = createStaticAgent({ precompressed: true })

      const rejectedRes = await agent.get('/compressed.txt').set('accept-encoding', 'br;q=0, *')
      expect(rejectedRes.headers['content-encoding']).toBe('gzip')

      const allRejectedRes = await agent.get('/compressed.txt').set('accept-encoding', '*, br;q=0, gzip;q=0, zstd;q=0')
      expect(allRejectedRes.headers['content-encoding']).toBeUndefined()
      expect(allRejectedRes.text).toBe('identity content')
    })

    it('skips accepted encodings that have no sidecar file', async () => {
      const res = await createStaticAgent({ precompressed: true })
        .get('/compressed.txt')
        .set('accept-encoding', 'zstd, gzip')

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBe('gzip')
      expect(res.headers.vary).toBe('accept-encoding')
      expect(res.text).toBe('gzip content')
    })

    it('skips a sidecar path that is not a file', async () => {
      const res = await createStaticAgent({ precompressed: true })
        .get('/dir-sidecar.txt')
        .set('accept-encoding', 'br')

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBeUndefined()
      expect(res.text).toBe('identity content')
    })

    it('serves the identity variant when the file has no sidecars at all', async () => {
      const res = await createStaticAgent({ precompressed: true })
        .get('/hello.txt')
        .set('accept-encoding', 'br, gzip')

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBeUndefined()
      expect(res.headers.vary).toBe('accept-encoding')
      expect(res.text).toBe('hello world')
    })

    it('omits content-encoding from a 304', async () => {
      const agent = createStaticAgent({ precompressed: true })
      const etag = (await agent.get('/compressed.txt').set('accept-encoding', 'gzip')).headers.etag!

      const res = await agent.get('/compressed.txt').set('accept-encoding', 'gzip').set('if-none-match', etag)

      expect(res.status).toBe(304)
      expect(res.headers['content-encoding']).toBeUndefined()
      expect(res.headers.vary).toBe('accept-encoding')
    })

    it('does not apply to non-compressible content types', async () => {
      const res = await createStaticAgent({ precompressed: true })
        .get('/compressed.bin')
        .set('accept-encoding', 'gzip')

      expect(res.headers['content-encoding']).toBeUndefined()
      expect(res.headers.vary).toBeUndefined()
      expect(res.body).toEqual(Buffer.from('binary identity'))
    })
  })

  it('restarts a download resumed through response compression instead of splicing identity bytes into compressed ones', async () => {
    const agent = createAgent(new RPCHandler({}, {
      plugins: [new StaticFileHandlerPlugin({ rootDir }), new ResponseCompressionHandlerPlugin({ threshold: 0 })],
    }))

    const first = await agent.get('/hello.txt').set('accept-encoding', 'gzip')
    expect(first.headers['content-encoding']).toBe('gzip')
    expect(first.headers.etag).toBe(`W/${helloEtag}`)
    expect(first.headers['accept-ranges']).toBeUndefined()

    // The weak tag cannot satisfy if-range, so the full compressed body comes back instead of a 206
    const resumed = await agent.get('/hello.txt').set('accept-encoding', 'gzip').set('range', 'bytes=5-').set('if-range', first.headers.etag!)
    expect(resumed.status).toBe(200)
    expect(resumed.headers['content-encoding']).toBe('gzip')
    expect(resumed.text).toBe('hello world')

    const revalidated = await agent.get('/hello.txt').set('accept-encoding', 'gzip').set('if-none-match', first.headers.etag!)
    expect(revalidated.status).toBe(304)
  })

  describe('fallback file', () => {
    it('serves the fallback file when nothing matches', async () => {
      const res = await createStaticAgent({ fallbackFile: 'index.html' }).get('/some/spa/route')

      expect(res.status).toBe(200)
      expect(res.text).toBe('<h1>home</h1>')
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    })

    it('still serves existing files over the fallback', async () => {
      const res = await createStaticAgent({ fallbackFile: 'index.html' }).get('/hello.txt')

      expect(res.status).toBe(200)
      expect(res.text).toBe('hello world')
    })
  })

  it('handles files modified in the past consistently', async () => {
    const filePath = path.join(rootDir, 'old.txt')
    writeFileSync(filePath, 'old content')
    const past = new Date('2020-01-02T03:04:05Z')
    utimesSync(filePath, past, past)

    const agent = createStaticAgent()
    const res = await agent.get('/old.txt')

    expect(res.status).toBe(200)
    expect(res.headers['last-modified']).toBe(past.toUTCString())

    const freshRes = await agent.get('/old.txt').set('if-modified-since', past.toUTCString())
    expect(freshRes.status).toBe(304)
  })

  describe('tracing', () => {
    it('renames the active span to the mounted base path', async ({ onTestFinished }) => {
      const span = { updateName: vi.fn(), setAttribute: vi.fn(), recordException: vi.fn(), end: vi.fn() }
      const spy = vi.spyOn(sharedModule, 'getTracer').mockReturnValue({
        startActiveSpan: (_name: unknown, _parent: unknown, fn: (span: unknown) => unknown) => fn(span),
        withActiveSpan: (_: unknown, fn: () => unknown) => fn(),
        getActiveSpan: () => span,
      } as any)
      onTestFinished(() => spy.mockRestore())

      await createStaticAgent().get('/hello.txt')
      expect(span.updateName).toHaveBeenLastCalledWith('GET /* (static file)')

      await createStaticAgent({ path: '/assets' }).get('/assets/hello.txt')
      expect(span.updateName).toHaveBeenLastCalledWith('GET /assets/* (static file)')

      // The span is left to the handler when no file is served
      span.updateName.mockClear()
      await createStaticAgent().get('/missing.txt')
      expect(span.updateName).not.toHaveBeenCalledWith(expect.stringContaining('static file'))
    })
  })

  /**
   * The plugin is adapter agnostic, these smoke tests only prove the fetch
   * adapter wiring; the http semantics are covered by the suites above.
   */
  describe('fetch adapter', () => {
    it('serves a file and falls through when no file matches', async () => {
      const handler = new FetchRPCHandler({}, {
        plugins: [new StaticFileHandlerPlugin({ rootDir })],
      })

      const served = await handler.handle(new Request('https://example.com/hello.txt'))
      expect(served.matched).toBe(true)
      expect(served.response!.status).toBe(200)
      expect(await served.response!.text()).toBe('hello world')
      expect(served.response!.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(served.response!.headers.get('etag')).toBe(helloEtag)

      const unmatched = await handler.handle(new Request('https://example.com/missing.txt'))
      expect(unmatched.matched).toBe(false)
    })
  })
})
