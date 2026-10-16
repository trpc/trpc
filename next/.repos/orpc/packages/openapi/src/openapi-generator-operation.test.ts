import type { AnyProcedureContract, AnySchema, ErrorMap } from '@orpc/contract'
import type { OpenAPIOperationContext } from './openapi-generator-operation'
import type { OpenAPIV3_2 } from './types'
import { COMMON_ERROR_STATUS_MAP } from '@orpc/client'
import { asyncIteratorObject, error } from '@orpc/contract'
import { combineJsonSchemasWithComposition, DelegatingJsonSchemaConverter } from '@orpc/json-schema'
import { testSchema, testSchemaConverter } from '../tests/__shared__/schema'
import { OpenAPIComponentRegistry } from './openapi-generator-components'
import {
  buildErrorResponse,
  buildRequest,
  buildSuccessResponse,
  toOpenAPIPath,
} from './openapi-generator-operation'

import { getDynamicPathParams } from './utils'

describe('openAPIGenerator operation builders', () => {
  function createContext(options: {
    schemas?: Record<string, any>
    errorStatusMap?: Record<string, number>
    customErrorResponseBodySchema?: OpenAPIOperationContext['customErrorResponseBodySchema']
  } = {}) {
    const doc: OpenAPIV3_2.OpenAPIObject = {
      openapi: '3.2.0',
      info: { title: 'API Reference', version: '0.0.0' },
      ...(options.schemas ? { components: { schemas: options.schemas } } : {}),
    }

    const converter = new DelegatingJsonSchemaConverter([testSchemaConverter])

    const ctx: OpenAPIOperationContext = {
      registry: new OpenAPIComponentRegistry(doc, undefined),
      convertSchemas: (schemas, direction) => {
        if (!schemas || schemas.length <= 1) {
          return converter.convert(schemas?.[0], direction)
        }

        const results = schemas.map(s => converter.convert(s, direction))

        return [
          combineJsonSchemasWithComposition('allOf', results.map(([jsonSchema]) => jsonSchema)),
          results.every(([, optional]) => optional),
        ]
      },
      errorStatusMap: options.errorStatusMap ?? COMMON_ERROR_STATUS_MAP,
      customErrorResponseBodySchema: options.customErrorResponseBodySchema,
    }

    const operation: OpenAPIV3_2.OperationObject = {}

    return { doc, ctx, operation }
  }

  function testDef(def: { inputs?: AnySchema[], outputs?: AnySchema[], errors?: ErrorMap } = {}): AnyProcedureContract['~orpc'] {
    return {
      inputSchemas: def.inputs,
      outputSchemas: def.outputs,
      errorMap: def.errors ?? {},
    } as AnyProcedureContract['~orpc']
  }

  describe('toOpenAPIPath', () => {
    it('returns paths without dynamic params unchanged', () => {
      expect(toOpenAPIPath('/planets', undefined)).toBe('/planets')
    })

    it('normalizes dynamic params, including the {+param} form', () => {
      const path = '/planets/{id}/{+rest}' as const
      expect(toOpenAPIPath(path, getDynamicPathParams(path))).toBe('/planets/{id}/{rest}')
    })
  })

  describe('buildRequest', () => {
    it('does nothing for unconstrained inputs without dynamic params', () => {
      const { ctx, operation } = createContext()

      buildRequest(ctx, operation, testDef(), undefined, undefined)
      buildRequest(ctx, operation, testDef({ inputs: [testSchema(true)] }), undefined, undefined)

      expect(operation).toEqual({})
    })

    it('maps compact inputs to a request body', () => {
      const { ctx, operation } = createContext()

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })],
      }), undefined, undefined)

      expect(operation).toEqual({
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
            },
          },
        },
      })
    })

    it('omits required for optional compact request bodies', () => {
      const { ctx, operation } = createContext()

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({ type: 'object' }, { optional: true })],
      }), undefined, undefined)

      expect(operation.requestBody).toEqual({
        content: { 'application/json': { schema: { type: 'object' } } },
      })
    })

    it('maps compact path params and keeps the remaining fields in the body', () => {
      const { ctx, operation } = createContext()
      const path = '/planets/{id}' as const

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['id', 'name'],
        })],
      }), { method: 'POST', path }, getDynamicPathParams(path))

      expect(operation.parameters).toEqual([
        { in: 'path', required: true, name: 'id', schema: { type: 'string' } },
      ])
      expect(operation.requestBody).toEqual({
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                note: { type: 'string' },
              },
              required: ['name'],
            },
          },
        },
      })
    })

    it('applies params styles to path parameters', () => {
      const { ctx, operation } = createContext()
      const path = '/planets/{id}/{tags}/{filters}' as const

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({
          type: 'object',
          properties: {
            id: { type: 'string' },
            tags: { type: 'array' },
            filters: { type: 'object' },
          },
          required: ['id', 'tags', 'filters'],
        })],
      }), {
        method: 'GET',
        path,
        paramsStyles: {
          id: 'primitive',
          tags: 'comma-delimited-array',
          filters: 'comma-delimited-object',
        },
      }, getDynamicPathParams(path))

      expect(operation.parameters).toEqual([
        { in: 'path', required: true, name: 'id', schema: { type: 'string' } },
        { in: 'path', required: true, name: 'tags', style: 'simple', explode: false, schema: { type: 'array' } },
        { in: 'path', required: true, name: 'filters', style: 'simple', explode: false, schema: { type: 'object' } },
      ])
    })

    it('marks the request body optional when every non-param field is optional', () => {
      const { ctx, operation } = createContext()
      const path = '/planets/{id}' as const

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({
          type: 'object',
          properties: { id: { type: 'string' }, note: { type: 'string' } },
          required: ['id'],
        })],
      }), { method: 'POST', path }, getDynamicPathParams(path))

      expect((operation.requestBody as any)?.required).toBeUndefined()
    })

    it('maps compact GET inputs to query parameters and applies every query style', () => {
      const { ctx, operation } = createContext()

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({
          type: 'object',
          properties: {
            primitive: { type: 'string' },
            array: { type: 'array' },
            commaArray: { type: 'array' },
            pipeObject: { type: 'object' },
            spaceArray: { type: 'array' },
            json: { type: 'object' },
            deepObject: { type: 'object' },
            arrayable: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }] },
            optional: { type: 'string' },
          },
          required: ['primitive', 'array', 'commaArray', 'pipeObject', 'spaceArray', 'json', 'deepObject', 'arrayable'],
        })],
      }), {
        method: 'GET',
        queryStyles: {
          primitive: 'primitive',
          array: 'array',
          commaArray: 'comma-delimited-array',
          pipeObject: 'pipe-delimited-object',
          spaceArray: 'space-delimited-array',
          json: 'json',
        },
      }, undefined)

      expect(operation.parameters).toEqual([
        { in: 'query', name: 'primitive', required: true, allowEmptyValue: true, allowReserved: true, schema: { type: 'string' } },
        { in: 'query', name: 'array', required: true, allowEmptyValue: true, allowReserved: true, schema: { type: 'array' } },
        { in: 'query', name: 'commaArray', required: true, explode: false, allowEmptyValue: true, allowReserved: true, schema: { type: 'array' } },
        { in: 'query', name: 'pipeObject', required: true, style: 'pipeDelimited', allowEmptyValue: true, allowReserved: true, schema: { type: 'object' } },
        { in: 'query', name: 'spaceArray', required: true, style: 'spaceDelimited', allowEmptyValue: true, allowReserved: true, schema: { type: 'array' } },
        { in: 'query', name: 'json', required: true, allowEmptyValue: true, allowReserved: true, content: { 'application/json': { schema: { type: 'object' } } } },
        { in: 'query', name: 'deepObject', required: true, style: 'deepObject', explode: true, allowEmptyValue: true, allowReserved: true, schema: { type: 'object' } },
        { in: 'query', name: 'arrayable', required: true, allowEmptyValue: true, allowReserved: true, schema: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }] } },
        { in: 'query', name: 'optional', allowEmptyValue: true, allowReserved: true, schema: { type: 'string' } },
      ])
      expect(operation.requestBody).toBeUndefined()
    })

    it('maps HEAD inputs to query parameters like GET', () => {
      const { ctx, operation } = createContext()
      const path = '/planets/{id}' as const

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({
          type: 'object',
          properties: { id: { type: 'string' }, verbose: { type: 'boolean' } },
          required: ['id', 'verbose'],
        })],
      }), { method: 'HEAD', path }, getDynamicPathParams(path))

      expect(operation.parameters).toEqual([
        { in: 'path', required: true, name: 'id', schema: { type: 'string' } },
        { in: 'query', name: 'verbose', required: true, allowEmptyValue: true, allowReserved: true, schema: { type: 'boolean' } },
      ])
      expect(operation.requestBody).toBeUndefined()
    })

    it('maps detailed inputs to params, query, headers, and body', () => {
      const { ctx, operation } = createContext()
      const path = '/planets/{id}' as const

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({
          type: 'object',
          properties: {
            params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
            query: { type: 'object', properties: { expand: { type: 'boolean' } } },
            headers: { type: 'object', properties: { 'x-trace-id': { type: 'string' }, 'x-optional': { type: 'string' } }, required: ['x-trace-id'] },
            body: { type: 'object', properties: { name: { type: 'string' } } },
          },
          required: ['params', 'headers'],
        })],
      }), { inputStructure: 'detailed', path }, getDynamicPathParams(path))

      expect(operation.parameters).toEqual([
        { in: 'path', required: true, name: 'id', schema: { type: 'string' } },
        { in: 'query', name: 'expand', allowEmptyValue: true, allowReserved: true, schema: { type: 'boolean' } },
        { in: 'header', name: 'x-trace-id', required: true, schema: { type: 'string' } },
        { in: 'header', name: 'x-optional', schema: { type: 'string' } },
      ])
      expect(operation.requestBody).toEqual({
        content: {
          'application/json': {
            schema: { type: 'object', properties: { name: { type: 'string' } } },
          },
        },
      })
    })

    it('maps detailed inputs with only a body section', () => {
      const { ctx, operation } = createContext()

      buildRequest(ctx, operation, testDef({
        inputs: [testSchema({
          type: 'object',
          properties: { body: { type: 'string' } },
          required: ['body'],
        })],
      }), { inputStructure: 'detailed' }, undefined)

      expect(operation.parameters).toBeUndefined()
      expect(operation.requestBody).toEqual({
        required: true,
        content: { 'application/json': { schema: { type: 'string' } } },
      })
    })

    it('maps AsyncIteratorObject inputs to an SSE request body', () => {
      const { ctx, operation } = createContext()

      buildRequest(ctx, operation, testDef({
        inputs: [asyncIteratorObject(testSchema({ type: 'string' }), testSchema({ type: 'boolean' }))],
      }), undefined, undefined)

      expect(operation.requestBody).toEqual({
        required: true,
        content: {
          'text/event-stream': {
            schema: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    event: { const: 'message' },
                    data: { type: 'string' },
                    id: { type: 'string' },
                    retry: { type: 'number' },
                  },
                  required: ['event', 'data'],
                },
                {
                  type: 'object',
                  properties: {
                    event: { const: 'close' },
                    data: { type: 'boolean' },
                    id: { type: 'string' },
                    retry: { type: 'number' },
                  },
                  required: ['event', 'data'],
                },
                {
                  type: 'object',
                  properties: {
                    event: { const: 'error' },
                    data: {},
                    id: { type: 'string' },
                    retry: { type: 'number' },
                  },
                  required: ['event'],
                },
              ],
            },
          },
        },
      })
    })

    it('maps AsyncIteratorObject inputs without a return schema', () => {
      const { ctx, operation } = createContext()

      buildRequest(ctx, operation, testDef({
        inputs: [asyncIteratorObject(testSchema({ type: 'string' }))],
      }), undefined, undefined)

      expect(((operation.requestBody as any)?.content?.['text/event-stream']?.schema as any).oneOf[1]).toEqual({
        type: 'object',
        properties: {
          event: { const: 'close' },
          data: {},
          id: { type: 'string' },
          retry: { type: 'number' },
        },
        required: ['event'],
      })
    })

    it.each([
      {
        name: 'a GET input schema is not an object',
        inputs: [testSchema({ type: 'string' })],
        meta: { method: 'GET' as const },
        path: undefined,
        message: 'method is GET but the input schema is not an object',
      },
      {
        name: 'a HEAD input schema is not an object',
        inputs: [testSchema({ type: 'string' })],
        meta: { method: 'HEAD' as const },
        path: undefined,
        message: 'method is HEAD but the input schema is not an object',
      },
      {
        name: 'a detailed input schema is not an object',
        inputs: [testSchema({ type: 'string' })],
        meta: { inputStructure: 'detailed' as const },
        path: undefined,
        message: 'inputStructure is "detailed" but the input schema is not an object',
      },
      {
        name: 'dynamic params exist but the input schema is not an object',
        inputs: [testSchema({ type: 'string' })],
        meta: { path: '/planets/{id}' as const },
        path: '/planets/{id}' as const,
        message: 'declares path params ({id}) but there is no object schema to source them from',
      },
      {
        name: 'a dynamic param is missing from the input schema',
        inputs: [testSchema({
          type: 'object',
          properties: {
            params: { type: 'object', properties: { other: { type: 'string' } }, required: ['other'] },
          },
          required: ['params'],
        })],
        meta: { inputStructure: 'detailed' as const, path: '/planets/{id}' as const },
        path: '/planets/{id}' as const,
        message: 'dynamic param "{id}" is missing from the input schema',
      },
      {
        name: 'a dynamic param is missing and the input schema has no keys at all',
        inputs: [testSchema({ type: 'object' })],
        meta: { path: '/planets/{id}' as const },
        path: '/planets/{id}' as const,
        message: 'Schema keys:  (none)',
      },
      {
        name: 'a dynamic param is optional in the input schema',
        inputs: [testSchema({ type: 'object', properties: { id: { type: 'string' } } })],
        meta: { path: '/planets/{id}' as const },
        path: '/planets/{id}' as const,
        message: 'dynamic param "id" is optional in the input schema',
      },
    ])('throws when $name', ({ inputs, meta, path, message }) => {
      const { ctx, operation } = createContext()

      expect(() => buildRequest(
        ctx,
        operation,
        testDef({ inputs }),
        meta,
        path ? getDynamicPathParams(path) : undefined,
      )).toThrow(message)
    })
  })

  describe('buildSuccessResponse', () => {
    it('creates a success response without content when there is no output schema', () => {
      const { ctx, operation } = createContext()

      buildSuccessResponse(ctx, operation, testDef(), undefined)

      expect(operation.responses).toEqual({
        200: { description: 'OK', content: {} },
      })
    })

    it('maps compact outputs with custom status and description', () => {
      const { ctx, operation } = createContext()

      buildSuccessResponse(ctx, operation, testDef({
        outputs: [testSchema({ type: 'object' })],
      }), { successStatus: 201, successDescription: 'Created' })

      expect(operation.responses).toEqual({
        201: {
          description: 'Created',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      })
    })

    it('splits file outputs by media type', () => {
      const { ctx, operation } = createContext()

      buildSuccessResponse(ctx, operation, testDef({
        outputs: [testSchema({
          anyOf: [
            { type: 'string', contentMediaType: 'image/png', contentEncoding: 'binary' },
            { type: 'string', contentMediaType: 'image/png', contentEncoding: 'base64' },
            { type: 'string', contentEncoding: 'binary' },
            { type: 'object' },
          ],
        })],
      }), undefined)

      expect(operation.responses?.['200']).toEqual({
        description: 'OK',
        content: {
          'application/json': { schema: { type: 'object' } },
          'image/png': {
            schema: {
              anyOf: [
                { type: 'string', contentMediaType: 'image/png', contentEncoding: 'binary' },
                { type: 'string', contentMediaType: 'image/png', contentEncoding: 'base64' },
              ],
            },
          },
          '*/*': { schema: { type: 'string', contentEncoding: 'binary' } },
        },
      })
    })

    it('uses multipart/form-data for bodies with nested files', () => {
      const { ctx, operation } = createContext()

      buildSuccessResponse(ctx, operation, testDef({
        outputs: [testSchema({
          type: 'object',
          properties: { file: { type: 'string', contentEncoding: 'binary' } },
        })],
      }), undefined)

      expect(operation.responses?.['200']).toEqual({
        description: 'OK',
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { file: { type: 'string', contentEncoding: 'binary' } },
            },
          },
        },
      })
    })

    it('maps AsyncIteratorObject outputs to an SSE success response', () => {
      const { ctx, operation } = createContext()

      buildSuccessResponse(ctx, operation, testDef({
        outputs: [asyncIteratorObject(testSchema({ type: 'string' }))],
      }), undefined)

      expect(operation.responses?.['200']).toEqual({
        description: 'OK',
        content: {
          'text/event-stream': {
            schema: expect.objectContaining({ oneOf: expect.any(Array) }),
          },
        },
      })
    })

    it('maps detailed outputs to per-status responses with merged descriptions, bodies, and headers', () => {
      const { ctx, operation } = createContext()

      buildSuccessResponse(ctx, operation, testDef({
        outputs: [testSchema({
          anyOf: [
            {
              type: 'object',
              properties: {
                status: { const: 201, description: 'created' },
                headers: { type: 'object', properties: { 'x-id': { type: 'string' } }, required: ['x-id'] },
                body: { type: 'object' },
              },
              required: ['status', 'headers', 'body'],
            },
            {
              type: 'object',
              properties: {
                status: { const: 201 },
                body: { type: 'string' },
              },
              required: ['status', 'body'],
            },
            {
              type: 'object',
              properties: {
                headers: { type: 'object', properties: { 'x-opt': { type: 'string' } } },
              },
              required: [],
            },
            {
              type: 'object',
              properties: {
                status: { const: 202 },
                body: { type: 'boolean' },
              },
              required: ['status', 'body'],
            },
          ],
        })],
      }), { outputStructure: 'detailed', successStatus: 299 })

      expect(operation.responses).toEqual({
        201: {
          description: 'created',
          headers: {
            'x-id': { required: true, schema: { type: 'string' } },
          },
          content: {
            'application/json': {
              schema: { anyOf: [{ type: 'object' }, { type: 'string' }] },
            },
          },
        },
        202: {
          description: 'OK',
          content: {
            'application/json': {
              schema: { type: 'boolean' },
            },
          },
        },
        299: {
          description: 'OK',
          headers: {
            'x-opt': { schema: { type: 'string' } },
          },
        },
      })
    })

    it.each([
      {
        // Effect emits `Schema.Literal(201)` as `{ type: 'number', enum: [201] }`
        name: 'a single-value enum',
        status: { type: 'number', enum: [201], description: 'created' },
        descriptions: { 201: 'created' },
      },
      {
        name: 'a multi-value enum',
        status: { type: 'number', enum: [200, 201, 200], description: 'success' },
        descriptions: { 200: 'success', 201: 'success' },
      },
      {
        // zod and valibot emit a union of literals as `anyOf` of `const` schemas
        name: 'a union of literals',
        status: {
          description: 'accepted',
          anyOf: [
            { type: 'number', const: 201, description: 'created' },
            { type: 'number', const: 202 },
            { type: 'number', enum: [203, 204] },
          ],
        },
        descriptions: { 201: 'created', 202: 'accepted', 203: 'accepted', 204: 'accepted' },
      },
    ])('maps $name detailed status to per-status responses', ({ status, descriptions }) => {
      const { ctx, operation } = createContext()

      buildSuccessResponse(ctx, operation, testDef({
        outputs: [testSchema({
          type: 'object',
          properties: {
            status: status as any,
            headers: { type: 'object', properties: { 'x-id': { type: 'string' } }, required: ['x-id'] },
            body: { type: 'string' },
          },
          required: ['status', 'headers', 'body'],
        })],
      }), { outputStructure: 'detailed' })

      expect(operation.responses).toEqual(Object.fromEntries(
        Object.entries(descriptions).map(([code, description]) => [code, {
          description,
          headers: { 'x-id': { required: true, schema: { type: 'string' } } },
          content: { 'application/json': { schema: { type: 'string' } } },
        }]),
      ))
    })

    it.each([
      {
        name: 'a detailed output member is not an object',
        output: { anyOf: [{ type: 'object' }, { type: 'string' }] },
        message: 'outputStructure is "detailed" but the output schema (or one of its union members) is not an object',
      },
      {
        name: 'a detailed status is not a schema object',
        output: { type: 'object', properties: { status: true }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
      {
        name: 'a detailed status is not a literal integer',
        output: { type: 'object', properties: { status: { type: 'number' } }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
      {
        name: 'a detailed status is not a success status',
        output: { type: 'object', properties: { status: { const: 400 } }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
      {
        name: 'a detailed enum status contains a non-success status',
        output: { type: 'object', properties: { status: { type: 'number', enum: [200, 400] } }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
      {
        name: 'a detailed enum status is empty',
        output: { type: 'object', properties: { status: { type: 'number', enum: [] } }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
      {
        name: 'a detailed status union is empty',
        output: { type: 'object', properties: { status: { anyOf: [] } }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
      {
        name: 'a detailed status union contains a non-literal member',
        output: { type: 'object', properties: { status: { anyOf: [{ const: 200 }, { type: 'number' }] } }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
      {
        name: 'a detailed status union contains a non-integer literal',
        output: { type: 'object', properties: { status: { anyOf: [{ const: 200 }, { const: '201' }] } }, required: ['status'] },
        message: 'invalid "status" field in the detailed output schema',
      },
    ])('throws when $name', ({ output, message }) => {
      const { ctx, operation } = createContext()

      expect(() => buildSuccessResponse(
        ctx,
        operation,
        testDef({ outputs: [testSchema(output as any)] }),
        { outputStructure: 'detailed' },
      )).toThrow(message)
    })
  })

  describe('buildErrorResponse', () => {
    it('does nothing when no errors are defined or all configurations are undefined', () => {
      const { ctx, operation } = createContext()

      buildErrorResponse(ctx, operation, testDef())
      buildErrorResponse(ctx, operation, testDef({ errors: { DISABLED: undefined } }))

      expect(operation).toEqual({})
    })

    it('hoists each defined error into components named after its code', () => {
      const { doc, ctx, operation } = createContext({
        errorStatusMap: { 'BAD_REQUEST': 400, 'BAD_REQUEST_2': 400, 'custom-timeout': 408 },
      })

      buildErrorResponse(ctx, operation, testDef({
        errors: {
          'BAD_REQUEST': { data: testSchema({ type: 'object', properties: { field: { type: 'string' } }, required: ['field'] }) },
          'BAD_REQUEST_2': { message: 'Second bad request' },
          'custom-timeout': {},
        },
      }))

      expect(operation.responses?.['400']).toEqual({
        description: 'Second bad request',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/BadRequest' },
                { $ref: '#/components/schemas/BadRequest2' },
                { $ref: '#/components/schemas/UndefinedError' },
              ],
            },
          },
        },
      })
      expect(operation.responses?.['408']).toEqual({
        description: '408',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/CustomTimeout' },
                { $ref: '#/components/schemas/UndefinedError' },
              ],
            },
          },
        },
      })

      expect(doc.components?.schemas?.BadRequest).toEqual({
        title: 'BAD_REQUEST',
        type: 'object',
        properties: {
          defined: { const: true },
          code: { const: 'BAD_REQUEST' },
          message: { type: 'string', default: undefined },
          data: { type: 'object', properties: { field: { type: 'string' } }, required: ['field'] },
        },
        required: ['defined', 'code', 'message', 'data'],
      })
      expect(doc.components?.schemas?.BadRequest2).toEqual({
        title: 'BAD_REQUEST_2',
        type: 'object',
        properties: {
          defined: { const: true },
          code: { const: 'BAD_REQUEST_2' },
          message: { type: 'string', default: undefined },
          data: { },
        },
        required: ['defined', 'code', 'message'],
      })
      expect(doc.components?.schemas?.UndefinedError).toEqual({
        title: 'UndefinedError',
        type: 'object',
        properties: {
          defined: { const: false },
          code: { type: 'string' },
          message: { type: 'string' },
          data: {},
        },
        required: ['defined', 'code', 'message'],
      })
    })

    it('uses the common status map by default and falls back to 500 for unknown codes', () => {
      const { ctx, operation } = createContext()

      buildErrorResponse(ctx, operation, testDef({
        errors: {
          NOT_FOUND: {},
          CUSTOM_UNKNOWN_CODE: {},
        },
      }))

      expect(Object.keys(operation.responses ?? {})).toEqual(['404', '500'])
    })

    it('falls back to the "Error" component name for codes without alphanumeric characters', () => {
      const { ctx, operation } = createContext()

      buildErrorResponse(ctx, operation, testDef({ errors: { '---': {} } }))

      expect((operation.responses?.['500'] as any).content['application/json'].schema.oneOf[0]).toEqual({
        $ref: '#/components/schemas/Error',
      })
    })

    it('keeps the error component name unique among local data defs', () => {
      const { doc, ctx, operation } = createContext()

      buildErrorResponse(ctx, operation, testDef({
        errors: {
          CONFLICT: {
            data: testSchema({
              type: 'object',
              properties: { nested: { $ref: '#/$defs/Conflict' } },
              required: ['nested'],
              $defs: { Conflict: { type: 'string' } },
            }),
          },
        },
      }))

      expect((operation.responses?.['409'] as any).content['application/json'].schema.oneOf[0]).toEqual({
        $ref: '#/components/schemas/Conflict2',
      })
      expect(doc.components?.schemas?.Conflict).toEqual({ type: 'string' })
      expect(doc.components?.schemas?.Conflict2).toEqual(expect.objectContaining({
        properties: expect.objectContaining({
          code: { const: 'CONFLICT' },
        }),
      }))
    })

    it('renders error factory items registered under their code', () => {
      const { doc, ctx, operation } = createContext()

      const ForbiddenError = error('FORBIDDEN', {
        message: 'Access denied',
        data: testSchema({ type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] }),
      })

      buildErrorResponse(ctx, operation, testDef({
        errors: {
          [ForbiddenError.code]: ForbiddenError,
        },
      }))

      expect(operation.responses?.['403']).toEqual({
        description: 'Access denied',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/Forbidden' },
                { $ref: '#/components/schemas/UndefinedError' },
              ],
            },
          },
        },
      })

      expect(doc.components?.schemas?.Forbidden).toEqual({
        title: 'FORBIDDEN',
        type: 'object',
        properties: {
          defined: { const: true },
          code: { const: 'FORBIDDEN' },
          message: { type: 'string', default: undefined },
          data: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
        },
        required: ['defined', 'code', 'message', 'data'],
      })
    })

    it('allows overriding the error body schema per status', () => {
      const customErrorResponseBodySchema = vi.fn((definedErrors, status) => {
        if (status === 400) {
          return { type: 'object' as const, description: 'custom-400' }
        }

        return undefined
      })

      const { ctx, operation } = createContext({ customErrorResponseBodySchema })

      buildErrorResponse(ctx, operation, testDef({
        errors: {
          BAD_REQUEST: { data: testSchema({ type: 'object' }) },
          NOT_FOUND: {},
        },
      }))

      expect(customErrorResponseBodySchema).toHaveBeenCalledTimes(2)
      expect(customErrorResponseBodySchema).toHaveBeenCalledWith([
        {
          code: 'BAD_REQUEST',
          defaultMessage: undefined,
          dataOptional: false,
          dataJsonSchema: { type: 'object' },
        },
      ], 400)

      expect((operation.responses?.['400'] as any).content['application/json'].schema).toEqual({
        type: 'object',
        description: 'custom-400',
      })
      expect((operation.responses?.['404'] as any).content['application/json'].schema).toEqual(
        expect.objectContaining({ oneOf: expect.any(Array) }),
      )
    })
  })
})
