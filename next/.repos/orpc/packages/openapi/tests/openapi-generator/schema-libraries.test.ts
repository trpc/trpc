import { oc } from '@orpc/contract'
import * as arktype from 'arktype'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { testSchema, testSchemaConverter, zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: schema library agnosticism', () => {
  const generator = new OpenAPIGenerator({ converters: [testSchemaConverter, zodJsonSchemaConverter] })

  it('generates the same operation shape from zod, arktype, and plain JSON schemas', async () => {
    const doc = await generator.generate({
      withZod: oc
        .meta(openapi({ method: 'POST', path: '/zod' }))
        .input(z.object({ name: z.string() }))
        .output(z.object({ id: z.string() })),
      withArktype: oc
        .meta(openapi({ method: 'POST', path: '/arktype' }))
        .input(arktype.type({ name: 'string' }))
        .output(arktype.type({ id: 'string' })),
      withJsonSchema: oc
        .meta(openapi({ method: 'POST', path: '/json-schema' }))
        .input(testSchema({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }))
        .output(testSchema({ type: 'object', properties: { id: { type: 'string' } }, required: ['id'] })),
    })

    for (const path of ['/zod', '/arktype', '/json-schema'] as const) {
      expect(doc.paths?.[path]?.post, path).toEqual(expect.objectContaining({
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: expect.objectContaining({
                type: 'object',
                properties: expect.objectContaining({
                  name: expect.objectContaining({ type: 'string' }),
                }),
                required: ['name'],
              }),
            },
          },
        },
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: expect.objectContaining({
                  type: 'object',
                  properties: expect.objectContaining({
                    id: expect.objectContaining({ type: 'string' }),
                  }),
                  required: ['id'],
                }),
              },
            },
          },
        },
      }))
    }
  })

  it('maps arktype GET inputs to query and path parameters', async () => {
    const doc = await generator.generate({
      find: oc
        .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
        .input(arktype.type({ 'id': 'string', 'expand?': 'string' })),
    })

    expect(doc.paths?.['/planets/{id}']?.get?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: expect.objectContaining({ type: 'string' }) },
      {
        name: 'expand',
        in: 'query',
        allowEmptyValue: true,
        allowReserved: true,
        schema: expect.objectContaining({ type: 'string' }),
      },
    ])
  })

  it('supports plain JSON schemas with $defs, hoisting them into components', async () => {
    const doc = await generator.generate({
      createPlanet: oc
        .meta(openapi({ method: 'POST', path: '/planets' }))
        .input(testSchema({
          type: 'object',
          properties: { planet: { $ref: '#/$defs/Planet' } },
          required: ['planet'],
          $defs: {
            Planet: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
            },
          },
        })),
    })

    expect((doc.paths?.['/planets']?.post?.requestBody as any).content['application/json'].schema).toEqual({
      type: 'object',
      properties: { planet: { $ref: '#/components/schemas/Planet' } },
      required: ['planet'],
    })
    expect(doc.components?.schemas).toEqual({
      Planet: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    })
  })
})
