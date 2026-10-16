import { oc } from '@orpc/contract'
import z from 'zod'
import { openapi, OpenAPIGenerator } from '../../src'
import { zodJsonSchemaConverter } from '../__shared__/schema'

describe('openAPIGenerator e2e: file upload and download', () => {
  const generator = new OpenAPIGenerator({ converters: [zodJsonSchemaConverter] })

  it('documents raw uploads with one content entry per accepted mime type', async () => {
    const doc = await generator.generate({
      uploadDocument: oc
        .meta(openapi({ method: 'POST', path: '/documents' }))
        .input(z.file().mime(['application/pdf', 'application/xml'])),
    })

    expect(doc.paths?.['/documents']?.post?.requestBody).toEqual({
      required: true,
      content: {
        'application/pdf': {
          schema: expect.objectContaining({ contentEncoding: 'binary' }),
        },
        'application/xml': {
          schema: expect.objectContaining({ contentEncoding: 'binary' }),
        },
      },
    })
  })

  it('documents form uploads with nested files as multipart/form-data', async () => {
    const doc = await generator.generate({
      uploadAvatar: oc
        .meta(openapi({ method: 'POST', path: '/avatars' }))
        .input(z.object({
          userId: z.string(),
          image: z.file().mime(['image/png', 'image/jpeg']),
        })),
    })

    expect(doc.paths?.['/avatars']?.post?.requestBody).toEqual({
      required: true,
      content: {
        'multipart/form-data': {
          schema: expect.objectContaining({
            type: 'object',
            required: ['userId', 'image'],
          }),
        },
      },
    })
  })

  it('documents downloads without a known mime type as */*', async () => {
    const doc = await generator.generate({
      downloadDocument: oc
        .meta(openapi({ method: 'GET', path: '/documents/{id}' }))
        .input(z.object({ id: z.string() }))
        .output(z.file()),
    })

    expect(doc.paths?.['/documents/{id}']?.get?.responses?.['200']).toEqual({
      description: 'OK',
      content: {
        '*/*': {
          schema: expect.objectContaining({ contentEncoding: 'binary' }),
        },
      },
    })
  })

  it('splits mixed unions of files and json into separate content types', async () => {
    const doc = await generator.generate({
      exportPlanets: oc
        .meta(openapi({ method: 'GET', path: '/planets/export' }))
        .input(z.object({ format: z.string().optional() }))
        .output(z.union([
          z.file().mime('text/csv'),
          z.array(z.object({ id: z.string() })),
        ])),
    })

    expect(doc.paths?.['/planets/export']?.get?.responses?.['200']).toEqual({
      description: 'OK',
      content: {
        'application/json': {
          schema: expect.objectContaining({ type: 'array' }),
        },
        'text/csv': {
          schema: expect.objectContaining({ contentEncoding: 'binary' }),
        },
      },
    })
  })

  it('merges file schemas sharing the json content type into the json media entry', async () => {
    const doc = await generator.generate({
      importPlanets: oc
        .meta(openapi({ method: 'POST', path: '/planets/import' }))
        .input(z.union([
          z.file().mime('application/json'),
          z.object({ planets: z.array(z.object({ id: z.string() })) }),
        ])),
    })

    expect(doc.paths?.['/planets/import']?.post?.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: {
            anyOf: [
              expect.objectContaining({ type: 'object' }),
              expect.objectContaining({ contentEncoding: 'binary' }),
            ],
          },
        },
      },
    })
  })
})
