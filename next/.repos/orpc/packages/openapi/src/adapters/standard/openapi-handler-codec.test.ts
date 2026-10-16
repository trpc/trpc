import type { StandardLazyRequest } from '@standard-server/core'
import { ORPCError } from '@orpc/client'
import { DEFAULT_ERROR_STATUS, os } from '@orpc/server'
import { openapi } from '../../meta'
import { OpenAPIHandlerCodec } from './openapi-handler-codec'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openAPIHandlerCodec', () => {
  const options = {
    context: {},
  } as const

  function createRequest(overrides: Partial<StandardLazyRequest> = {}) {
    return {
      method: 'GET',
      url: '/' as const,
      resolveBody: vi.fn(),
      headers: {},
      signal: undefined,
      ...overrides,
    }
  }

  describe('.resolveProcedure', () => {
    describe('routing', () => {
      it('returns undefined when no route matches', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'GET', path: '/items' })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/missing',
        }), options as any)

        expect(result).toBeUndefined()
      })

      it('respects the runtime prefix option', async () => {
        const procedure = os
          .meta(openapi({ method: 'GET', prefix: '/api/v1', path: '/items/{id}' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/gateway/api/v1/items/42',
        }), {
          ...options,
          prefix: '/gateway',
        } as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '42',
        })
      })
    })

    describe('compact GET input', () => {
      it('merges path params and query without reading the body', async () => {
        const procedure = os
          .meta(openapi({ method: 'GET', path: '/{id}' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)
        const resolveBody = vi.fn()

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/42?plain=value&filter[status]=active',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()
        expect(result!.procedure).toBe(procedure)

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '42',
          plain: 'value',
          filter: { status: 'active' },
        })

        expect(resolveBody).not.toHaveBeenCalled()
      })

      it('treats HEAD like GET, merging path params and query without reading the body', async () => {
        const procedure = os
          .meta(openapi({ method: 'HEAD', path: '/{id}' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)
        const resolveBody = vi.fn()

        const result = await codec.resolveProcedure(createRequest({
          method: 'HEAD',
          url: '/42?verbose=true',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '42',
          verbose: 'true',
        })

        expect(resolveBody).not.toHaveBeenCalled()
      })

      it('gives path params precedence over conflicting query params', async () => {
        const procedure = os
          .meta(openapi({ method: 'GET', path: '/{id}' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/42?id=99&q=hello',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '42',
          q: 'hello',
        })
      })

      it('returns query directly when there are no path params', async () => {
        const procedure = os
          .meta(openapi({ method: 'GET', path: '/status' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/status?plain=value&filter[status]=active',
        }), options as any)

        expect(result).toBeDefined()
        expect(result!.procedure).toBe(procedure)

        await expect(result!.decodeInput()).resolves.toEqual({
          plain: 'value',
          filter: { status: 'active' },
        })
      })

      it('converts a bracket-notation root array query to an object and merges with path params', async () => {
        const procedure = os
          .meta(openapi({ method: 'GET', path: '/{id}' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/42?0=zero&1=one',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '42',
          0: 'zero',
          1: 'one',
        })
      })

      it('decodes path params using simple array and object styles', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({
            method: 'GET',
            path: '/{id}/{tags}/{filters}',
            paramsStyles: {
              id: 'primitive',
              tags: 'comma-delimited-array',
              filters: 'comma-delimited-object',
            },
          })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/42/red,blue/size,large,brand,nike?page=2',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '42',
          tags: ['red', 'blue'],
          filters: { size: 'large', brand: 'nike' },
          page: '2',
        })
      })

      it('ignores paramsStyles keys that are not path params of the matched route', async () => {
        const base = os.meta(openapi({ paramsStyles: { tags: 'comma-delimited-array', filters: 'comma-delimited-object' } }))
        const codec = new OpenAPIHandlerCodec({
          list: base.meta(openapi({ method: 'GET', path: '/items/{category}' })).handler(vi.fn()),
          create: base.meta(openapi({ method: 'POST', path: '/items/{category}' })).handler(vi.fn()),
          detailed: base.meta(openapi({ method: 'PUT', path: '/items/{category}', inputStructure: 'detailed' })).handler(vi.fn()),
        })

        const list = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/items/books?tags=a&tags=b',
        }), options as any)

        await expect(list!.decodeInput()).resolves.toEqual({ category: 'books', tags: ['a', 'b'] })

        const create = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/items/books',
          resolveBody: vi.fn().mockResolvedValueOnce({ tags: ['a', 'b'] }),
        }), options as any)

        await expect(create!.decodeInput()).resolves.toEqual({ category: 'books', tags: ['a', 'b'] })

        const detailed = await codec.resolveProcedure(createRequest({
          method: 'PUT',
          url: '/items/books',
        }), options as any)

        const input = await detailed!.decodeInput() as any
        expect(Object.keys(input.params)).toEqual(['category'])
      })
    })

    describe('compact non-GET input', () => {
      it('returns only path params when the body deserializes to undefined', async () => {
        const serializer = {
          serialize: vi.fn(),
          deserialize: vi.fn().mockReturnValueOnce(undefined),
        } as any

        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'POST', path: '/{id}', requestBodyHint: 'url-search-params' })).handler(vi.fn()),
          { serializer },
        )
        const resolveBody = vi.fn().mockResolvedValueOnce(undefined)
        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/24',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({ id: '24' })

        expect(resolveBody).toHaveBeenCalledOnce()
        expect(resolveBody).toHaveBeenCalledWith('url-search-params')
        expect(serializer.deserialize).toHaveBeenCalledWith(undefined)
      })

      it('merges object body with path params', async () => {
        const procedure = os
          .meta(openapi({ method: 'POST', path: '/{id}', requestBodyHint: 'url-search-params' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)
        const resolveBody = vi.fn().mockResolvedValueOnce(new URLSearchParams([
          ['title', 'hello'],
          ['published', 'true'],
        ]))

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/24',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()
        expect(result!.procedure).toBe(procedure)

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '24',
          title: 'hello',
          published: 'true',
        })

        expect(resolveBody).toHaveBeenCalledOnce()
        expect(resolveBody).toHaveBeenCalledWith('url-search-params')
      })

      it('gives path params precedence over conflicting body properties', async () => {
        const procedure = os
          .meta(openapi({ method: 'POST', path: '/{id}', requestBodyHint: 'url-search-params' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)
        const resolveBody = vi.fn().mockResolvedValueOnce(new URLSearchParams([
          ['id', '99'],
          ['title', 'hello'],
        ]))

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/24',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '24',
          title: 'hello',
        })
      })

      it('returns only path params when a primitive body cannot be merged', async () => {
        const serializer = {
          serialize: vi.fn(),
          deserialize: vi.fn().mockReturnValueOnce('raw-body'),
        } as any

        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'POST', path: '/{id}', requestBodyHint: 'url-search-params' })).handler(vi.fn()),
          { serializer },
        )
        const resolveBody = vi.fn().mockResolvedValueOnce('__body__')

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/24',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({ id: '24' })
        expect(serializer.deserialize).toHaveBeenCalledWith('__body__')
      })

      it('returns body directly when there are no path params', async () => {
        const serializer = {
          serialize: vi.fn(),
          deserialize: vi.fn().mockReturnValueOnce({ name: 'din' }),
        } as any

        const procedure = os
          .meta(openapi({ method: 'POST', path: '/submit' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure, { serializer })
        const resolveBody = vi.fn().mockResolvedValueOnce('__body__')

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/submit',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()
        expect(result!.procedure).toBe(procedure)

        await expect(result!.decodeInput()).resolves.toEqual({ name: 'din' })
        expect(resolveBody).toHaveBeenCalledWith(undefined)
      })

      it('returns only path params when an array body cannot be merged', async () => {
        const serializer = {
          serialize: vi.fn(),
          deserialize: vi.fn().mockReturnValueOnce(['first', 'second']),
        } as any

        const procedure = os
          .meta(openapi({ method: 'POST', path: '/{id}', requestBodyHint: 'json' }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure, { serializer })
        const resolveBody = vi.fn().mockResolvedValueOnce('__body__')

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/24',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()
        expect(result!.procedure).toBe(procedure)

        await expect(result!.decodeInput()).resolves.toEqual({ id: '24' })
      })

      it('returns only path params when a binary body cannot be merged', async () => {
        const blob = new Blob(['raw-bytes'])
        const serializer = {
          serialize: vi.fn(),
          deserialize: vi.fn().mockReturnValueOnce(blob),
        } as any

        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'POST', path: '/{id}' })).handler(vi.fn()),
          { serializer },
        )
        const resolveBody = vi.fn().mockResolvedValueOnce(blob)

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/24',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({ id: '24' })
      })

      it('returns a binary body as-is when there are no path params', async () => {
        const blob = new Blob(['raw-bytes'])
        const serializer = {
          serialize: vi.fn(),
          deserialize: vi.fn().mockReturnValueOnce(blob),
        } as any

        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'POST', path: '/submit' })).handler(vi.fn()),
          { serializer },
        )
        const resolveBody = vi.fn().mockResolvedValueOnce(blob)

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/submit',
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toBe(blob)
      })
    })

    describe('detailed input', () => {
      it('decodes input into { params, query, headers, body }', async () => {
        const procedure = os
          .meta(openapi({
            method: 'POST',
            path: '/{id}',
            inputStructure: 'detailed',
            requestBodyHint: 'url-search-params',
          }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)
        const resolveBody = vi.fn().mockResolvedValueOnce(new URLSearchParams([
          ['name', 'alice'],
          ['active', 'true'],
        ]))

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/99?page=2',
          headers: { 'x-trace-id': 'abc' },
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()
        expect(result!.procedure).toBe(procedure)

        await expect(result!.decodeInput()).resolves.toEqual({
          params: { id: '99' },
          query: { page: '2' },
          headers: { 'x-trace-id': 'abc' },
          body: { name: 'alice', active: 'true' },
        })

        expect(resolveBody).toHaveBeenCalledOnce()
        expect(resolveBody).toHaveBeenCalledWith('url-search-params')
      })

      it('decodes styled path params inside the detailed params object', async () => {
        const procedure = os
          .meta(openapi({
            method: 'POST',
            path: '/{id}/{tags}/{filters}',
            inputStructure: 'detailed',
            paramsStyles: {
              id: 'primitive',
              tags: 'comma-delimited-array',
              filters: 'comma-delimited-object',
            },
          }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)
        const resolveBody = vi.fn().mockResolvedValueOnce(undefined)

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/42/red,blue/size,large,brand,nike?page=2',
          headers: { 'x-trace-id': 'abc' },
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          params: {
            id: '42',
            tags: ['red', 'blue'],
            filters: { size: 'large', brand: 'nike' },
          },
          query: { page: '2' },
          headers: { 'x-trace-id': 'abc' },
          body: undefined,
        })
      })

      it('decodes styled query values inside the detailed query object', async () => {
        const procedure = os
          .meta(openapi({
            method: 'POST',
            path: '/{id}',
            inputStructure: 'detailed',
            queryStyles: {
              keyword: 'primitive',
              tags: 'array',
              meta: 'json',
            },
          }))
          .handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)
        const resolveBody = vi.fn().mockResolvedValueOnce(undefined)

        const result = await codec.resolveProcedure(createRequest({
          method: 'POST',
          url: '/42?keyword=first&keyword=last&tags=red&tags=blue&meta=%7B%22enabled%22%3Atrue%7D&plain=value',
          headers: { 'x-trace-id': 'abc' },
          resolveBody,
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          params: { id: '42' },
          query: {
            keyword: 'last',
            tags: ['red', 'blue'],
            meta: { enabled: true },
            plain: 'value',
          },
          headers: { 'x-trace-id': 'abc' },
          body: undefined,
        })
      })
    })

    describe('queryParsing', () => {
      it('applies last, array, and json strategies to repeated params', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({
            method: 'GET',
            path: '/{id}',
            queryStyles: {
              keyword: 'primitive',
              tags: 'array',
              meta: 'json',
            },
          })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/42?keyword=first&keyword=last&tags=red&tags=blue&meta=%7B%22enabled%22%3Atrue%7D&plain=value',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          id: '42',
          keyword: 'last',
          tags: ['red', 'blue'],
          meta: { enabled: true },
          plain: 'value',
        })
      })

      it('converts a bracket-notation root array to an object when strategies are defined', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'GET', queryStyles: { tags: 'array' } })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/?0=zero&1=one',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          0: 'zero',
          1: 'one',
          tags: [],
        })
      })

      it('returns the deserialized result as-is when queryParsing is an empty object', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'GET', queryStyles: { } })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/?0=zero&1=one',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({ 0: 'zero', 1: 'one' })
      })

      it('falls back to the raw string value when json strategy cannot parse', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({ method: 'GET', queryStyles: { meta: 'json' } })).handler(vi.fn()),
        )
        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/?meta=not-json',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          meta: 'not-json',
        })
      })

      it('applies all delimited parsing strategies using the last matching value', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({
            method: 'GET',
            queryStyles: {
              commaArray: 'comma-delimited-array',
              commaObject: 'comma-delimited-object',
              spaceArray: 'space-delimited-array',
              spaceObject: 'space-delimited-object',
              pipeArray: 'pipe-delimited-array',
              pipeObject: 'pipe-delimited-object',
            },
          })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/?commaArray=skip&commaArray=red,blue%20sky,green%2Ftea&commaObject=skip&commaObject=first,1,second,two%20words&spaceArray=skip&spaceArray=alpha beta gamma%2Cdeta&spaceObject=skip&spaceObject=left 10 right twenty%2Cone&pipeArray=skip&pipeArray=north|south%20east|west%2Fcoast&pipeObject=skip&pipeObject=primary|1|secondary|two%20words',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          commaArray: ['red', 'blue sky', 'green/tea'],
          commaObject: { first: '1', second: 'two words' },
          spaceArray: ['alpha', 'beta', 'gamma,deta'],
          spaceObject: { left: '10', right: 'twenty,one' },
          pipeArray: ['north', 'south east', 'west/coast'],
          pipeObject: { primary: '1', secondary: 'two words' },
        })
      })

      it('parsing as undefined for delimited parsing strategies if query is absent', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({
            method: 'GET',
            queryStyles: {
              commaArray: 'comma-delimited-array',
              commaObject: 'comma-delimited-object',
              spaceArray: 'space-delimited-array',
              spaceObject: 'space-delimited-object',
              pipeArray: 'pipe-delimited-array',
              pipeObject: 'pipe-delimited-object',
            },
          })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          commaArray: undefined,
          commaObject: undefined,
          spaceArray: undefined,
          spaceObject: undefined,
          pipeArray: undefined,
          pipeObject: undefined,
        })
      })

      it('keeps default bracket-notation decoding when a parsing hint is undefined', async () => {
        const codec = new OpenAPIHandlerCodec(
          os.meta(openapi({
            method: 'GET',
            queryStyles: {
              keep: undefined,
              tags: 'array',
            },
          })).handler(vi.fn()),
        )

        const result = await codec.resolveProcedure(createRequest({
          method: 'GET',
          url: '/?keep[enabled]=true&tags=red&tags=blue',
        }), options as any)

        expect(result).toBeDefined()

        await expect(result!.decodeInput()).resolves.toEqual({
          keep: { enabled: 'true' },
          tags: ['red', 'blue'],
        })
      })
    })
  })

  describe('.encodeOutput', () => {
    describe('outputStructure=compact', () => {
      it('uses default 200 success status if successStatus is not defined', () => {
        const serializer = {
          serialize: vi.fn().mockReturnValueOnce('__serialized__'),
          deserialize: vi.fn(),
        }

        const procedure = os.handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure, { serializer })

        const response = codec.encodeOutput('__output__', procedure, [])

        expect(response).toEqual({
          status: 200,
          headers: {},
          body: '__serialized__',
        })

        expect(serializer.serialize).toHaveBeenCalledOnce()
        expect(serializer.serialize).toHaveBeenCalledWith('__output__')
      })

      it('uses successStatus if defined', () => {
        const serializer = {
          serialize: vi.fn().mockReturnValueOnce('__serialized__'),
          deserialize: vi.fn(),
        }

        const procedure = os.meta(openapi({ successStatus: 201 })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure, { serializer })

        const response = codec.encodeOutput('__output__', procedure, [])

        expect(response).toEqual({
          status: 201,
          headers: {},
          body: '__serialized__',
        })

        expect(serializer.serialize).toHaveBeenCalledOnce()
        expect(serializer.serialize).toHaveBeenCalledWith('__output__')
      })
    })

    describe('outputStructure=detailed', () => {
      it('uses default 200 success status meta when output not contain status', () => {
        const serializer = {
          serialize: vi.fn().mockReturnValueOnce('__serialized_body__'),
          deserialize: vi.fn(),
        } as any

        const procedure = os.meta(openapi({ outputStructure: 'detailed' })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure, { serializer })

        const response = codec.encodeOutput({
          body: { ok: true },
        }, procedure, ['detailed'] as any)

        expect(response).toEqual({
          status: 200,
          headers: {},
          body: '__serialized_body__',
        })

        expect(serializer.serialize).toHaveBeenCalledOnce()
        expect(serializer.serialize).toHaveBeenCalledWith({ ok: true })
      })

      it('uses the successStatus meta when output not contain status', () => {
        const serializer = {
          serialize: vi.fn().mockReturnValueOnce('__serialized_body__'),
          deserialize: vi.fn(),
        } as any

        const procedure = os.meta(openapi({ outputStructure: 'detailed', successStatus: 201 })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure, { serializer })

        const response = codec.encodeOutput({
          body: { ok: true },
        }, procedure, ['detailed'] as any)

        expect(response).toEqual({
          status: 201,
          headers: {},
          body: '__serialized_body__',
        })

        expect(serializer.serialize).toHaveBeenCalledOnce()
        expect(serializer.serialize).toHaveBeenCalledWith({ ok: true })
      })

      it('uses explicit status and headers from output', () => {
        const procedure = os.meta(openapi({ outputStructure: 'detailed' })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const response = codec.encodeOutput({
          status: 202,
          headers: { 'x-custom': 'value' },
          body: { ok: true },
        }, procedure, [])

        expect(response).toEqual({
          status: 202,
          headers: { 'x-custom': 'value' },
          body: { ok: true },
        })
      })

      it('accepts informational and redirect statuses since any status below 400 is success', () => {
        const procedure = os.meta(openapi({ outputStructure: 'detailed' })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const response = codec.encodeOutput({
          status: 302,
          headers: { location: 'https://example.com' },
        }, procedure, [])

        expect(response).toEqual({
          status: 302,
          headers: { location: 'https://example.com' },
          body: undefined,
        })
      })

      it('serializes non-string header values', () => {
        const procedure = os.meta(openapi({ outputStructure: 'detailed' })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const response = codec.encodeOutput({
          headers: {
            'x-string': 'value',
            'x-number': 42,
            'x-boolean': true,
            'x-date': new Date('2020-01-02T03:04:05.000Z'),
            'x-array': ['a', 1, null, undefined],
            'x-null': null,
            'x-undefined': undefined,
          },
          body: undefined,
        }, procedure, []) as any

        expect(response.headers).toEqual({
          'x-string': 'value',
          'x-number': '42',
          'x-boolean': 'true',
          'x-date': '2020-01-02T03:04:05.000Z',
          'x-array': ['a', '1'],
        })
        expect(Object.keys(response.headers)).not.toContain('x-null')
        expect(Object.keys(response.headers)).not.toContain('x-undefined')
      })

      it('prevents prototype injection via header keys', () => {
        const procedure = os.meta(openapi({ outputStructure: 'detailed' })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        const response = codec.encodeOutput({
          headers: JSON.parse('{"__proto__": "injected", "constructor": "c", "x-safe": "ok"}'),
        }, procedure, []) as any

        expect(response.headers['x-safe']).toBe('ok')

        // `__proto__` and `constructor` become plain own properties, not prototype-chain mutations
        expect(Object.getOwnPropertyDescriptor(response.headers, '__proto__')?.value).toBe('injected')
        expect(Object.getOwnPropertyDescriptor(response.headers, 'constructor')?.value).toBe('c')
      })

      it.each([
        ['non-object output', '__invalid__'],
        ['status of 400 or above', { status: 400 }],
        ['non-integer status', { status: 250.5 }],
        ['non-number status', { status: '200' }],
        ['extra keys', { body: 'ok', extra: true }],
        ['non-object headers', { headers: 'invalid' }],
      ])('throws for invalid output: %s', (_, output) => {
        const procedure = os.meta(openapi({ outputStructure: 'detailed' })).handler(vi.fn())
        const codec = new OpenAPIHandlerCodec(procedure)

        expect(() => codec.encodeOutput(output, procedure, [])).toThrow('Invalid "detailed" output structure')
      })
    })
  })

  describe('.encodeError', () => {
    it('maps known error codes to HTTP status via COMMON_ERROR_STATUS_MAP', () => {
      const serializer = {
        serialize: vi.fn().mockReturnValueOnce('__serialized_error__'),
        deserialize: vi.fn(),
      } as any

      const procedure = os.handler(vi.fn())
      const codec = new OpenAPIHandlerCodec(procedure, { serializer })
      const error = new ORPCError('BAD_GATEWAY')

      const response = codec.encodeError(error)

      expect(response).toEqual({
        status: 502,
        headers: {},
        body: '__serialized_error__',
      })

      expect(serializer.serialize).toHaveBeenCalledOnce()
      expect(serializer.serialize).toHaveBeenCalledWith(error.toJSON())
    })

    it('uses customErrorResponseBodyEncoder and falls back on null', () => {
      let attempt = 1
      const customErrorResponseBodyEncoder = vi.fn(() => {
        if (attempt++ === 2) {
          return null
        }

        return {
          message: 'custom error body',
        }
      })

      const serializer = {
        serialize: vi.fn()
          .mockReturnValueOnce('__serialized_custom__')
          .mockReturnValueOnce('__serialized_default__'),
        deserialize: vi.fn(),
      } as any

      const procedure = os.handler(vi.fn())
      const codec = new OpenAPIHandlerCodec(procedure, {
        serializer,
        customErrorResponseBodyEncoder,
      })

      const firstError = new ORPCError('BAD_GATEWAY', { data: '__data1__' })
      const firstResponse = codec.encodeError(firstError)

      expect(firstResponse).toEqual({
        status: 502,
        headers: {},
        body: '__serialized_custom__',
      })

      const secondError = new ORPCError('UNKNOWN_CODE' as any, { data: '__data2__' })
      const secondResponse = codec.encodeError(secondError)

      expect(secondResponse).toEqual({
        status: DEFAULT_ERROR_STATUS,
        headers: {},
        body: '__serialized_default__',
      })

      expect(customErrorResponseBodyEncoder).toHaveBeenCalledTimes(2)
      expect(customErrorResponseBodyEncoder).toHaveBeenNthCalledWith(1, firstError)
      expect(customErrorResponseBodyEncoder).toHaveBeenNthCalledWith(2, secondError)

      expect(serializer.serialize).toHaveBeenCalledTimes(2)
      expect(serializer.serialize).toHaveBeenNthCalledWith(1, { message: 'custom error body' })
      expect(serializer.serialize).toHaveBeenNthCalledWith(2, secondError.toJSON())
    })

    it('does not resolve error codes through Object.prototype', async () => {
      const serializer = { serialize: vi.fn(), deserialize: vi.fn() } as any
      const codec = new OpenAPIHandlerCodec({ procedure: os.handler(vi.fn()) }, { serializer })

      expect((await codec.encodeError(new ORPCError('toString' as any))).status).toEqual(DEFAULT_ERROR_STATUS)
    })

    it('can custom error status via errorStatuses option', () => {
      const serializer = {
        serialize: vi.fn().mockReturnValueOnce('__serialized_override__'),
        deserialize: vi.fn(),
      } as any

      const procedure = os.handler(vi.fn())
      const codec = new OpenAPIHandlerCodec({ procedure }, {
        serializer,
        errorStatusMap: { BAD_GATEWAY: 599 },
      })

      const error = new ORPCError('BAD_GATEWAY')
      const response = codec.encodeError(error)

      expect(response).toEqual({
        status: 599,
        headers: {},
        body: '__serialized_override__',
      })
    })

    it('fallback unknown error code to DEFAULT_ERROR_STATUS', () => {
      const serializer = {
        serialize: vi.fn()
          .mockReturnValueOnce('__serialized_unknown__'),
        deserialize: vi.fn(),
      } as any

      const procedure = os.handler(vi.fn())
      const codec = new OpenAPIHandlerCodec({ procedure }, {
        serializer,
        errorStatusMap: {},
      })

      const unknownError = new ORPCError('UNKNOWN_CODE' as any)
      const unknownResponse = codec.encodeError(unknownError)

      expect(unknownResponse).toEqual({
        status: DEFAULT_ERROR_STATUS,
        headers: {},
        body: '__serialized_unknown__',
      })
    })
  })
})
