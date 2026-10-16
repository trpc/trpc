import { oc } from '@orpc/contract'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: webhook endpoint with full http control', () => {
  const generator = new OpenAPIGenerator({ converters: [zodJsonSchemaConverter] })

  const router = {
    receiveEvent: oc
      .meta(openapi({
        method: 'POST',
        path: '/webhooks/{source}',
        inputStructure: 'detailed',
        outputStructure: 'detailed',
      }))
      .input(z.object({
        params: z.object({ source: z.string() }),
        query: z.object({ retry: z.boolean().optional() }),
        headers: z.object({
          'x-signature': z.string(),
          'x-idempotency-key': z.string().optional(),
        }),
        body: z.object({ event: z.string(), payload: z.unknown() }),
      }))
      .output(z.union([
        z.object({
          status: z.literal(200).describe('Processed immediately'),
          body: z.object({ processed: z.boolean() }),
        }),
        z.object({
          status: z.literal(202).describe('Queued for processing'),
          headers: z.object({ 'x-queue-id': z.string() }),
          body: z.object({ queued: z.boolean() }),
        }),
      ])),
  }

  it('maps params, query, and headers to parameters and the body section to the request body', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/webhooks/{source}']?.post).toEqual(expect.objectContaining({
      parameters: [
        { name: 'source', in: 'path', required: true, schema: { type: 'string' } },
        {
          name: 'retry',
          in: 'query',
          allowEmptyValue: true,
          allowReserved: true,
          schema: { type: 'boolean' },
        },
        { name: 'x-signature', in: 'header', required: true, schema: { type: 'string' } },
        { name: 'x-idempotency-key', in: 'header', schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: expect.objectContaining({
              type: 'object',
              properties: expect.objectContaining({
                event: { type: 'string' },
              }),
              required: ['event', 'payload'],
            }),
          },
        },
      },
    }))
  })

  it('maps each detailed output status to its own response with headers and description', async () => {
    const doc = await generator.generate(router)

    expect(doc.paths?.['/webhooks/{source}']?.post?.responses).toEqual({
      200: {
        description: 'Processed immediately',
        content: {
          'application/json': {
            schema: expect.objectContaining({
              type: 'object',
              properties: {
                processed: { type: 'boolean' },
              },
              required: ['processed'],
            }),
          },
        },
      },
      202: {
        description: 'Queued for processing',
        headers: {
          'x-queue-id': {
            required: true,
            schema: { type: 'string' },
          },
        },
        content: {
          'application/json': {
            schema: expect.objectContaining({
              type: 'object',
              properties: {
                queued: { type: 'boolean' },
              },
              required: ['queued'],
            }),
          },
        },
      },
    })
  })

  it('uses successStatus and successDescription when detailed outputs omit the status field', async () => {
    const doc = await generator.generate({
      acknowledge: oc
        .meta(openapi({
          outputStructure: 'detailed',
          successStatus: 226,
          successDescription: 'IM Used',
        }))
        .output(z.object({
          body: z.object({ ok: z.boolean() }),
        })),
    })

    expect(doc.paths?.['/acknowledge']?.post?.responses).toEqual({
      226: expect.objectContaining({
        description: 'IM Used',
      }),
    })
  })
})
