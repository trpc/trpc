import { oc } from '@orpc/contract'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: composed schemas', () => {
  const generator = new OpenAPIGenerator({ converters: [zodJsonSchemaConverter] })

  it('documents polymorphic payloads: extracts the shared path param and keeps the body polymorphic', async () => {
    const doc = await generator.generate({
      ingestEvent: oc
        .meta(openapi({ method: 'POST', path: '/events/{type}' }))
        .input(z.discriminatedUnion('type', [
          z.object({ type: z.literal('click'), x: z.number() }),
          z.object({ type: z.literal('view'), duration: z.number() }),
        ]))
        .output(z.discriminatedUnion('type', [
          z.object({ type: z.literal('click'), x: z.number() }),
          z.object({ type: z.literal('view'), duration: z.number() }),
        ])),
    })

    expect(doc.paths?.['/events/{type}']?.post).toEqual(expect.objectContaining({
      parameters: [
        {
          name: 'type',
          in: 'path',
          required: true,
          schema: {
            anyOf: [
              { const: 'click', type: 'string' },
              { const: 'view', type: 'string' },
            ],
          },
        },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: expect.objectContaining({
              type: 'object',
              properties: {
                x: { type: 'number' },
                duration: { type: 'number' },
              },
            }),
          },
        },
      },
      responses: {
        200: expect.objectContaining({
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  expect.objectContaining({ required: ['type', 'x'] }),
                  expect.objectContaining({ required: ['type', 'duration'] }),
                ],
              },
            },
          },
        }),
      },
    }))
  })

  it('documents intersection inputs as query parameters and intersection outputs as a merged object', async () => {
    const doc = await generator.generate({
      searchPlanets: oc
        .meta(openapi({ method: 'GET', path: '/planets' }))
        .input(z.intersection(
          z.looseObject({ search: z.string() }),
          z.looseObject({ page: z.number() }),
        ))
        .output(z.intersection(
          z.looseObject({ items: z.array(z.string()) }),
          z.looseObject({ total: z.number() }),
        )),
    })

    expect(doc.paths?.['/planets']?.get).toEqual(expect.objectContaining({
      parameters: [
        expect.objectContaining({ name: 'search', in: 'query', required: true }),
        expect.objectContaining({ name: 'page', in: 'query', required: true }),
      ],
      responses: {
        200: expect.objectContaining({
          content: {
            'application/json': {
              schema: expect.objectContaining({
                type: 'object',
                required: ['items', 'total'],
              }),
            },
          },
        }),
      },
    }))
  })

  it('merges inputs added by multiple .input() calls before extracting params and query', async () => {
    const doc = await generator.generate({
      listPlanets: oc
        .meta(openapi({ method: 'GET', path: '/systems/{systemId}/planets' }))
        .input(z.looseObject({ systemId: z.string() }))
        .input(z.looseObject({ search: z.string().optional() })),
    })

    expect(doc.paths?.['/systems/{systemId}/planets']?.get?.parameters).toEqual([
      { name: 'systemId', in: 'path', required: true, schema: expect.objectContaining({ type: 'string' }) },
      {
        name: 'search',
        in: 'query',
        allowEmptyValue: true,
        allowReserved: true,
        schema: expect.objectContaining({ type: 'string' }),
      },
    ])
  })

  it('merges detailed sections added by multiple .input() and .output() calls', async () => {
    const doc = await generator.generate({
      updatePlanet: oc
        .meta(openapi({
          method: 'POST',
          path: '/planets/{id}',
          inputStructure: 'detailed',
          outputStructure: 'detailed',
        }))
        .input(z.looseObject({
          params: z.object({ id: z.string() }),
        }))
        .input(z.looseObject({
          headers: z.object({ 'x-trace-id': z.string() }),
          body: z.object({ name: z.string() }),
        }))
        .output(z.looseObject({
          headers: z.object({ 'x-request-id': z.string() }),
        }))
        .output(z.looseObject({
          body: z.object({ updated: z.boolean() }),
        })),
    })

    expect(doc.paths?.['/planets/{id}']?.post).toEqual(expect.objectContaining({
      parameters: [
        expect.objectContaining({ name: 'id', in: 'path' }),
        expect.objectContaining({ name: 'x-trace-id', in: 'header' }),
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: expect.objectContaining({
              properties: { name: { type: 'string' } },
            }),
          },
        },
      },
      responses: {
        200: {
          description: 'OK',
          headers: {
            'x-request-id': {
              required: true,
              schema: { type: 'string' },
            },
          },
          content: {
            'application/json': {
              schema: expect.objectContaining({
                properties: { updated: { type: 'boolean' } },
              }),
            },
          },
        },
      },
    }))
  })
})
