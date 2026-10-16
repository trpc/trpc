import { asyncIteratorObject, oc } from '@orpc/contract'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: server-sent event streaming', () => {
  const generator = new OpenAPIGenerator({ converters: [zodJsonSchemaConverter] })

  it('documents a bidirectional chat stream as text/event-stream on both sides', async () => {
    const doc = await generator.generate({
      chat: oc
        .meta(openapi({ path: '/chat' }))
        .input(asyncIteratorObject(z.object({ prompt: z.string() }), z.object({ done: z.boolean() })))
        .output(asyncIteratorObject(z.object({ delta: z.string() }), z.object({ usage: z.number() }))),
    })

    expect(doc.paths?.['/chat']?.post?.requestBody).toEqual({
      required: true,
      content: {
        'text/event-stream': {
          schema: {
            oneOf: [
              expect.objectContaining({
                properties: expect.objectContaining({
                  event: { const: 'message' },
                  data: expect.objectContaining({
                    properties: { prompt: { type: 'string' } },
                  }),
                }),
                required: ['event', 'data'],
              }),
              expect.objectContaining({
                properties: expect.objectContaining({
                  event: { const: 'close' },
                  data: expect.objectContaining({
                    properties: { done: { type: 'boolean' } },
                  }),
                }),
                required: ['event', 'data'],
              }),
              expect.objectContaining({
                properties: expect.objectContaining({
                  event: { const: 'error' },
                }),
                required: ['event'],
              }),
            ],
          },
        },
      },
    })

    expect(doc.paths?.['/chat']?.post?.responses?.['200']).toEqual({
      description: 'OK',
      content: {
        'text/event-stream': {
          schema: {
            oneOf: [
              expect.objectContaining({
                properties: expect.objectContaining({
                  event: { const: 'message' },
                  data: expect.objectContaining({
                    properties: { delta: { type: 'string' } },
                  }),
                }),
              }),
              expect.objectContaining({
                properties: expect.objectContaining({
                  event: { const: 'close' },
                  data: expect.objectContaining({
                    properties: { usage: { type: 'number' } },
                  }),
                }),
              }),
              expect.objectContaining({
                properties: expect.objectContaining({
                  event: { const: 'error' },
                }),
              }),
            ],
          },
        },
      },
    })
  })

  it('documents a subscription without a return schema using an unconstrained close event', async () => {
    const doc = await generator.generate({
      notifications: oc
        .meta(openapi({ method: 'GET', path: '/notifications' }))
        .output(asyncIteratorObject(z.object({ title: z.string() }))),
    })

    const schema = (doc.paths?.['/notifications']?.get?.responses?.['200'] as any).content['text/event-stream'].schema

    expect(schema.oneOf[1]).toEqual({
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
})
