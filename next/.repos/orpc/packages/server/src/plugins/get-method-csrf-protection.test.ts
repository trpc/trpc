import { ORPCError } from '@orpc/client'
import { RPCHandler } from '../adapters/fetch/rpc-handler'
import { RPC_DEFAULT_ALLOW_METHODS } from '../adapters/standard'
import { os } from '../builder'
import { BatchHandlerPlugin } from './batch'
import { GetMethodCsrfProtectionHandlerPlugin } from './get-method-csrf-protection'

function makeRequest(headers: Record<string, unknown>, method: string) {
  return {
    method,
    url: '/ping',
    headers,
    signal: new AbortController().signal,
  } as any
}

function getPlugin() {
  const existingInterceptor = vi.fn()

  const handlerOptions = new GetMethodCsrfProtectionHandlerPlugin<any>().init({
    interceptors: [existingInterceptor],
  } as any)

  return {
    interceptor: handlerOptions.interceptors![0]!,
    existingInterceptor,
    handlerOptions,
  }
}

function invokeInterceptor(headers: Record<string, unknown>, method = 'GET') {
  const nextResult = { status: 200, headers: {}, body: 'ok' }
  const next = vi.fn().mockResolvedValue(nextResult)
  const { interceptor } = getPlugin()

  const result = (async () => interceptor({ context: {}, request: makeRequest(headers, method), next } as any))()

  return { result, next, nextResult }
}

async function expectAllowed(headers: Record<string, unknown>, method = 'GET') {
  const { result, next, nextResult } = invokeInterceptor(headers, method)

  await expect(result).resolves.toBe(nextResult)
  expect(next).toHaveBeenCalledOnce()
}

async function expectBlocked(headers: Record<string, unknown>, method = 'GET') {
  const { result, next } = invokeInterceptor(headers, method)

  await expect(result).rejects.toSatisfy(error =>
    error instanceof ORPCError
    && error.code === 'FORBIDDEN'
    && error.message === 'Request blocked by CSRF protection.')
  expect(next).not.toHaveBeenCalled()
}

/** A cross-site top-level navigation, such as a link click, a redirect, or a GET form. */
const CROSS_SITE_NAVIGATION = {
  'sec-fetch-site': 'cross-site',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
}

describe('getMethodCsrfProtectionHandlerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('registration', () => {
    it('prepends its interceptor so it runs before existing ones', () => {
      const { handlerOptions, existingInterceptor } = getPlugin()

      expect(handlerOptions.interceptors).toHaveLength(2)
      expect(handlerOptions.interceptors![1]).toBe(existingInterceptor)
    })
  })

  describe('guarded methods', () => {
    it.each([
      'POST',
      'HEAD',
      'QUERY',
    ])('ignores %s requests, which never carry cross-site SameSite=Lax cookies', async (method) => {
      await expectAllowed(CROSS_SITE_NAVIGATION, method)
    })

    it('guards GET requests', async () => {
      await expectBlocked(CROSS_SITE_NAVIGATION, 'GET')
    })
  })

  describe('requests without fetch metadata', () => {
    it('passes through when the request has no sec-fetch-* headers', async () => {
      await expectAllowed({})
    })

    it('passes through when only sec-fetch-mode and sec-fetch-dest are present', async () => {
      await expectAllowed({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })
    })
  })

  describe('fetch site', () => {
    it.each([
      'same-origin',
      'SAME-ORIGIN',
      'same-site',
    ])('trusts even a navigation when sec-fetch-site is %s', async (site) => {
      await expectAllowed({ ...CROSS_SITE_NAVIGATION, 'sec-fetch-site': site })
    })

    it('judges an unrecognized sec-fetch-site value like a cross-site one', async () => {
      await expectBlocked({ ...CROSS_SITE_NAVIGATION, 'sec-fetch-site': 'future-value' })
    })

    it('judges a repeated sec-fetch-site header like a cross-site one', async () => {
      await expectBlocked({ ...CROSS_SITE_NAVIGATION, 'sec-fetch-site': ['same-site', 'same-site'] })
    })
  })

  describe('cross-site and browser-initiated navigations', () => {
    it.each([
      ['a link click or redirect', CROSS_SITE_NAVIGATION],
      ['a link click matching header casing loosely', { 'sec-fetch-site': 'Cross-Site', 'sec-fetch-mode': 'Navigate', 'sec-fetch-dest': 'Document' }],
      ['an address-bar, bookmark, email, or native-app navigation', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }],
    ])('blocks %s', async (_, headers) => {
      await expectBlocked(headers)
    })

    it.each([
      ['sec-fetch-mode is stripped', { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'document' }],
      ['sec-fetch-dest is stripped', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }],
      ['both are stripped', { 'sec-fetch-site': 'cross-site' }],
    ])('treats a stripped header as its dangerous value when %s', async (_, headers) => {
      await expectBlocked(headers)
    })
  })

  describe('cross-site requests browsers send without SameSite=Lax cookies', () => {
    it.each([
      ['a fetch or XMLHttpRequest', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }],
      ['an <img>, <script>, media, or prefetch load', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' }],
      ['an <iframe>, <embed>, or <object> load, which is not top-level', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' }],
      ['a WebSocket handshake', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'websocket', 'sec-fetch-dest': 'empty' }],
      ['a browser-extension fetch', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }],
    ])('allows %s', async (_, headers) => {
      await expectAllowed(headers)
    })
  })

  describe('with a GET-enabled RPCHandler', () => {
    const deletePlanet = vi.fn(() => 'deleted')

    function createHandler(extraPlugins: any[] = []) {
      return new RPCHandler({ deletePlanet: os.handler(deletePlanet) }, {
        allowMethods: ['GET', ...RPC_DEFAULT_ALLOW_METHODS],
        plugins: [new GetMethodCsrfProtectionHandlerPlugin(), ...extraPlugins],
      })
    }

    function createGetRequest(headers: Record<string, string>) {
      return new Request('https://api.example.com/deletePlanet', { headers })
    }

    it('blocks a cross-site link or redirect with a parseable FORBIDDEN error', async () => {
      const { matched, response } = await createHandler().handle(createGetRequest(CROSS_SITE_NAVIGATION))

      expect(matched).toBe(true)
      expect(response!.status).toBe(403)
      await expect(response!.json()).resolves.toMatchObject({
        json: expect.objectContaining({ code: 'FORBIDDEN' }),
      })
      expect(deletePlanet).not.toHaveBeenCalled()
    })

    it.each([
      ['a cross-site fetch, where browsers withhold SameSite=Lax cookies', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }],
      ['a same-site fetch from a sibling subdomain', { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }],
      ['a same-origin navigation', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }],
      ['a non-browser client', {}],
    ])('allows %s', async (_, headers) => {
      const { response } = await createHandler().handle(createGetRequest(headers))

      expect(response!.status).toBe(200)
      expect(deletePlanet).toHaveBeenCalledOnce()
    })

    it('leaves a cross-site POST untouched, where SameSite already withholds Lax cookies', async () => {
      const { response } = await createHandler().handle(
        new Request('https://api.example.com/deletePlanet', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...CROSS_SITE_NAVIGATION },
          body: '{}',
        }),
      )

      expect(response!.status).toBe(200)
      expect(deletePlanet).toHaveBeenCalledOnce()
    })

    it('leaves a request matching no procedure unmatched, so a static site can serve it', async () => {
      const { matched, response } = await createHandler().handle(
        new Request('https://api.example.com/unknown', { headers: CROSS_SITE_NAVIGATION }),
      )

      expect(matched).toBe(false)
      expect(response).toBeUndefined()
    })

    describe('batch sub-requests', () => {
      function createBatchRequest(handler: RPCHandler<any>, transportHeaders: Record<string, string>) {
        const data = encodeURIComponent(JSON.stringify([{
          kind: 'request',
          id: 0,
          json: {
            method: 'GET',
            url: '/deletePlanet',
            // the client picks these, so they must not be able to overturn the verdict
            headers: { 'sec-fetch-site': 'same-origin' },
          },
          binary: undefined,
        }]))

        return handler.handle(new Request(`https://api.example.com/__batch__?data=${data}`, {
          headers: { 'orpc-batch': 'buffered', ...transportHeaders },
        }))
      }

      it('judges sub-requests by the transport headers, which override the client-authored ones', async () => {
        const { response } = await createBatchRequest(createHandler([new BatchHandlerPlugin()]), CROSS_SITE_NAVIGATION)

        const body = await response!.json() as any
        expect(body[0]).toMatchObject({ kind: 'response', id: 0 })
        expect(body[0].json.status).toBe(403)
        expect(deletePlanet).not.toHaveBeenCalled()
      })

      it('allows sub-requests of a cross-site fetch batch', async () => {
        const { response } = await createBatchRequest(
          createHandler([new BatchHandlerPlugin()]),
          { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' },
        )

        const body = await response!.json() as any
        expect(body[0].json.status).not.toBe(403)
        expect(deletePlanet).toHaveBeenCalledOnce()
      })
    })
  })
})
