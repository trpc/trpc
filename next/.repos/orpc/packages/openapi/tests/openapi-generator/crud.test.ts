import { oc } from '@orpc/contract'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: crud api', () => {
  const generator = new OpenAPIGenerator({ converters: [zodJsonSchemaConverter] })

  const Planet = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
  }).meta({ id: 'Planet' })

  const router = {
    planet: {
      list: oc
        .meta(openapi({
          method: 'GET',
          prefix: '/api/v1',
          path: '/planets',
          tags: ['planets'],
          summary: 'List planets',
          queryStyles: { tags: 'comma-delimited-array' },
        }))
        .input(z.object({
          search: z.string().optional(),
          tags: z.array(z.string()).optional(),
          page: z.number().optional(),
        }))
        .output(z.array(Planet)),
      find: oc
        .meta(openapi({ method: 'GET', prefix: '/api/v1', path: '/planets/{id}', tags: ['planets'] }))
        .input(z.object({ id: z.string() }))
        .output(Planet),
      create: oc
        .meta(openapi({
          method: 'POST',
          prefix: '/api/v1',
          path: '/planets',
          tags: ['planets'],
          successStatus: 201,
          successDescription: 'Planet created',
        }))
        .input(z.object({ name: z.string(), description: z.string().optional() }))
        .output(Planet),
      update: oc
        .meta(openapi({ method: 'PUT', prefix: '/api/v1', path: '/planets/{id}', tags: ['planets'] }))
        .input(z.object({
          id: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
        }))
        .output(Planet),
      compare: oc
        .meta(openapi({
          method: 'GET',
          prefix: '/api/v1',
          path: '/planets/{ids}/compare',
          tags: ['planets'],
          paramsStyles: { ids: 'comma-delimited-array' },
        }))
        .input(z.object({ ids: z.array(z.string()) }))
        .output(z.array(Planet)),
      exists: oc
        .meta(openapi({ method: 'HEAD', prefix: '/api/v1', path: '/planets/{id}', tags: ['planets'] }))
        .input(z.object({ id: z.string(), includeArchived: z.boolean().optional() })),
    },
  }

  it('documents every operation under its path and method', async () => {
    const doc = await generator.generate(router, {
      base: { info: { title: 'Planet API', version: '1.0.0' } },
    })

    expect(doc.info).toEqual({ title: 'Planet API', version: '1.0.0' })
    expect(doc.paths).toEqual({
      '/api/v1/planets': {
        get: expect.objectContaining({ operationId: 'planet.list', summary: 'List planets', tags: ['planets'] }),
        post: expect.objectContaining({ operationId: 'planet.create' }),
      },
      '/api/v1/planets/{id}': {
        get: expect.objectContaining({ operationId: 'planet.find' }),
        put: expect.objectContaining({ operationId: 'planet.update' }),
        head: expect.objectContaining({ operationId: 'planet.exists' }),
      },
      '/api/v1/planets/{ids}/compare': {
        get: expect.objectContaining({ operationId: 'planet.compare' }),
      },
    })
  })

  it('maps HEAD inputs to query parameters like GET, without a request body', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/api/v1/planets/{id}']?.head).toEqual(expect.objectContaining({
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        {
          name: 'includeArchived',
          in: 'query',
          allowEmptyValue: true,
          allowReserved: true,
          schema: { type: 'boolean' },
        },
      ],
    }))
    expect((doc.paths?.['/api/v1/planets/{id}']?.head as any).requestBody).toBeUndefined()
  })

  it('documents comma-delimited path params with the simple style', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/api/v1/planets/{ids}/compare']?.get?.parameters).toEqual([
      {
        name: 'ids',
        in: 'path',
        required: true,
        style: 'simple',
        explode: false,
        schema: { type: 'array', items: { type: 'string' } },
      },
    ])
  })

  it('maps list inputs to query parameters with the configured styles', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/api/v1/planets']?.get?.parameters).toEqual([
      {
        name: 'search',
        in: 'query',
        allowEmptyValue: true,
        allowReserved: true,
        schema: { type: 'string' },
      },
      {
        name: 'tags',
        in: 'query',
        explode: false,
        allowEmptyValue: true,
        allowReserved: true,
        schema: { type: 'array', items: { type: 'string' } },
      },
      {
        name: 'page',
        in: 'query',
        allowEmptyValue: true,
        allowReserved: true,
        schema: { type: 'number' },
      },
    ])
  })

  it('maps path params and reuses the shared Planet component in responses', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/api/v1/planets/{id}']?.get).toEqual(expect.objectContaining({
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Planet' },
            },
          },
        },
      },
    }))

    // the list response references the same hoisted Planet component
    expect((doc.paths?.['/api/v1/planets']?.get?.responses?.['200'] as any).content['application/json'].schema).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/Planet' },
    })
    expect(doc.components?.schemas?.Planet).toEqual(expect.objectContaining({
      type: 'object',
      required: ['id', 'name'],
    }))
  })

  it('maps create inputs to a required request body with a custom success status', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/api/v1/planets']?.post).toEqual(expect.objectContaining({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: expect.objectContaining({
              type: 'object',
              required: ['name'],
            }),
          },
        },
      },
      responses: {
        201: expect.objectContaining({ description: 'Planet created' }),
      },
    }))
  })

  it('maps update inputs to a path param plus an optional request body', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/api/v1/planets/{id}']?.put).toEqual(expect.objectContaining({
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: expect.objectContaining({
              type: 'object',
              properties: expect.objectContaining({
                name: { type: 'string' },
                description: { type: 'string' },
              }),
            }),
          },
        },
      },
    }))
  })

  it('rejects invalid contracts with one aggregated error listing every procedure', async () => {
    const error = await generator.generate({
      // path params must be required
      find: oc
        .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
        .input(z.object({ id: z.string().optional() })),
      // GET inputs must be objects
      list: oc.meta(openapi({ method: 'GET' })).input(z.string()),
    }).then(
      () => { throw new Error('expected generate to reject') },
      e => e,
    )

    expect(error.message).toContain('Procedure at find:')
    expect(error.message).toContain('is optional in the input schema')
    expect(error.message).toContain('Procedure at list:')
    expect(error.message).toContain('method is GET but the input schema is not an object')
  })
})
