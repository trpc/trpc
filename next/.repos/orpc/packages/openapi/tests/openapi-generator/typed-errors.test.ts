import { oc } from '@orpc/contract'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: typed errors', () => {
  const generator = new OpenAPIGenerator({ converters: [zodJsonSchemaConverter] })

  const router = {
    createPlanet: oc
      .meta(openapi({ method: 'POST', path: '/planets' }))
      .errors({
        CONFLICT: {
          message: 'Planet already exists',
          data: z.object({ existingId: z.string() }),
        },
        UNPROCESSABLE_CONTENT: {},
      })
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.string() })),
    getPlanet: oc
      .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
      .errors({
        NOT_FOUND: {},
      })
      .input(z.object({ id: z.string() })),
  }

  it('documents each error status as a oneOf of components named after the error codes', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/planets']?.post?.responses).toEqual({
      200: expect.any(Object),
      409: {
        description: 'Planet already exists',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/Conflict' },
                { $ref: '#/components/schemas/UndefinedError' },
              ],
            },
          },
        },
      },
      422: {
        description: '422',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/UnprocessableContent' },
                { $ref: '#/components/schemas/UndefinedError' },
              ],
            },
          },
        },
      },
    })

    expect(doc.paths?.['/planets/{id}']?.get?.responses?.['404']).toEqual(expect.objectContaining({
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: '#/components/schemas/NotFound' },
              { $ref: '#/components/schemas/UndefinedError' },
            ],
          },
        },
      },
    }))
  })

  it('builds error components with defined, code, message, and data', async () => {
    const doc = await generator.generate(router)

    expect(doc.components?.schemas?.Conflict).toEqual({
      title: 'CONFLICT',
      type: 'object',
      properties: {
        defined: { const: true },
        code: { const: 'CONFLICT' },
        message: { type: 'string' },
        data: expect.objectContaining({
          type: 'object',
          properties: {
            existingId: expect.objectContaining({ type: 'string' }),
          },
          required: ['existingId'],
        }),
      },
      required: ['defined', 'code', 'message', 'data'],
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

  it.each(['3.2.0', '3.1.0', '3.0.3'] as const)('titles error components after their codes so oneOf branches sharing a status stay distinguishable in OpenAPI %s', async (version) => {
    const doc = await generator.generate({
      createPlanet: oc
        .meta(openapi({ method: 'POST', path: '/planets' }))
        .errors({
          PLANET_NAME_TAKEN: { data: z.object({ existingId: z.string() }) },
          PLANET_QUOTA_EXCEEDED: {},
        })
        .input(z.object({ name: z.string() })),
    }, {
      version,
      errorStatusMap: { PLANET_NAME_TAKEN: 409, PLANET_QUOTA_EXCEEDED: 409 },
    })

    expect(doc.paths?.['/planets']?.post?.responses?.['409']).toEqual(expect.objectContaining({
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: '#/components/schemas/PlanetNameTaken' },
              { $ref: '#/components/schemas/PlanetQuotaExceeded' },
              { $ref: '#/components/schemas/UndefinedError' },
            ],
          },
        },
      },
    }))

    expect(doc.components?.schemas).toEqual({
      PlanetNameTaken: expect.objectContaining({ title: 'PLANET_NAME_TAKEN' }),
      PlanetQuotaExceeded: expect.objectContaining({ title: 'PLANET_QUOTA_EXCEEDED' }),
      UndefinedError: expect.objectContaining({ title: 'UndefinedError' }),
    })
  })

  it('shares error components between procedures and across regenerations from a base document', async () => {
    const sharedRouter = {
      a: oc.meta(openapi({})).errors({ NOT_FOUND: { message: 'Planet not found' } }),
      b: oc.meta(openapi({})).errors({ NOT_FOUND: { message: 'Moon not found' } }),
    }

    const first = await generator.generate(sharedRouter)
    expect(Object.keys(first.components?.schemas ?? {}).sort()).toEqual(['NotFound', 'UndefinedError'])

    const second = await generator.generate(sharedRouter, {
      base: { components: first.components },
    })
    expect(Object.keys(second.components?.schemas ?? {}).sort()).toEqual(['NotFound', 'UndefinedError'])
  })

  it('supports a custom error status map and a custom error body schema', async () => {
    const doc = await generator.generate({
      getPlanet: oc
        .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
        .errors({ PLANET_GONE: { message: 'Planet is gone' } })
        .input(z.object({ id: z.string() })),
    }, {
      errorStatusMap: { PLANET_GONE: 410 },
      customErrorResponseBodySchema: (definedErrors, status) => {
        expect(definedErrors).toEqual([
          expect.objectContaining({ code: 'PLANET_GONE', defaultMessage: 'Planet is gone' }),
        ])

        return {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            status: { const: status },
          },
          required: ['code', 'message'],
        }
      },
    })

    expect(doc.paths?.['/planets/{id}']?.get?.responses?.['410']).toEqual({
      description: 'Planet is gone',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              status: { const: 410 },
            },
            required: ['code', 'message'],
          },
        },
      },
    })
    // only the always-available UndefinedError component is registered
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(['UndefinedError'])
  })
})
