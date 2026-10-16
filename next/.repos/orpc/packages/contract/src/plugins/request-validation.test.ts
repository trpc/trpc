import { ORPCError } from '@orpc/client'
import { StandardLink } from '@orpc/client/standard'
import * as z from 'zod'
import { ValidationError } from '../error'
import { ProcedureContract } from '../procedure'
import { RequestValidationLinkPlugin } from './request-validation'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requestValidationLinkPlugin', () => {
  const chainedProcedure = new ProcedureContract({
    inputSchemas: [
      z.number().transform(value => value + 1),
      z.number().min(2),
    ],
    outputSchemas: [],
    errorMap: {},
    meta: {},
  })

  const stackedObjectProcedure = new ProcedureContract({
    inputSchemas: [
      z.object({ parent: z.string().transform(value => `parent__${value}`) }),
      z.object({ parent: z.string(), child: z.string() }),
    ],
    outputSchemas: [],
    errorMap: {},
    meta: {},
  })

  const nestedObjectProcedure = new ProcedureContract({
    inputSchemas: [
      z.object({ params: z.object({ id: z.string() }) }),
      z.object({ params: z.object({ slug: z.string() }), query: z.object({ page: z.number() }) }),
    ],
    outputSchemas: [],
    errorMap: {},
    meta: {},
  })

  const withoutInputSchemaProcedure = new ProcedureContract({
    outputSchemas: [],
    errorMap: {},
    meta: {},
  })

  const contract = {
    chainedProcedure,
    stackedObjectProcedure,
    nestedObjectProcedure,
    nested: {
      chainedProcedure,
    },
    withoutInputSchema: withoutInputSchemaProcedure,
  }

  const codec = {
    encodeInput: vi.fn(),
    decodeResponse: vi.fn(),
  }

  const transport = {
    send: vi.fn(),
  }

  const interceptor = vi.fn(({ next }) => next())

  const link = new StandardLink(codec, transport, {
    plugins: [
      new RequestValidationLinkPlugin(contract),
    ],
    interceptors: [interceptor],
  })

  const linkUsingValidatedInput = new StandardLink(codec, transport, {
    plugins: [
      new RequestValidationLinkPlugin(contract, { forwardValidatedInput: true }),
    ],
  })

  it('forwards the original input by default after local validation succeeds', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/chainedProcedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({ kind: 'output', output: '__output__' })

    const output = await link.call(['chainedProcedure'], 1, { context: {} })

    expect(output).toBe('__output__')
    expect(codec.encodeInput).toHaveBeenCalledWith(1, ['chainedProcedure'], { context: {} })
    expect(interceptor).toHaveBeenCalledTimes(1)
  })

  it('can replace the downstream input with the validated value when enabled', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/chainedProcedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({ kind: 'output', output: '__output__' })

    const output = await linkUsingValidatedInput.call(['chainedProcedure'], 1, { context: {} })

    expect(output).toBe('__output__')
    expect(codec.encodeInput).toHaveBeenCalledWith(2, ['chainedProcedure'], { context: {} })
  })

  it('merges what every stacked object schema validates', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/stackedObjectProcedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({ kind: 'output', output: '__output__' })

    const input = { parent: 'PARENT', child: 'CHILD', unknown: 'UNKNOWN' }
    const output = await linkUsingValidatedInput.call(['stackedObjectProcedure'], input as any, { context: {} })

    expect(output).toBe('__output__')
    expect(codec.encodeInput).toHaveBeenCalledWith(
      { parent: 'parent__PARENT', child: 'CHILD' },
      ['stackedObjectProcedure'],
      { context: {} },
    )
  })

  it('merges stacked object schema fragments nested one level deep', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/nestedObjectProcedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({ kind: 'output', output: '__output__' })

    const input = { params: { id: 'ID', slug: 'SLUG', unknown: 'UNKNOWN' }, query: { page: 1 } }
    const output = await linkUsingValidatedInput.call(['nestedObjectProcedure'], input as any, { context: {} })

    expect(output).toBe('__output__')
    expect(codec.encodeInput).toHaveBeenCalledWith(
      { params: { id: 'ID', slug: 'SLUG' }, query: { page: 1 } },
      ['nestedObjectProcedure'],
      { context: {} },
    )
  })

  it('skips validation when the procedure has no input schemas', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/withoutInputSchema',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({ kind: 'output', output: '__output__' })

    const output = await link.call(['withoutInputSchema'], 'anything', { context: {} })

    expect(output).toBe('__output__')
    expect(codec.encodeInput).toHaveBeenCalledWith('anything', ['withoutInputSchema'], { context: {} })
  })

  it('throws a BAD_REQUEST error when any validation step fails', async () => {
    await expect(link.call(['nested', 'chainedProcedure'], 0, { context: {} })).rejects.toThrow(
      new ORPCError('BAD_REQUEST', {
        message: 'Input validation failed',
        data: {
          issues: expect.any(Array),
        },
        cause: new ValidationError({
          message: 'Input validation failed',
          issues: expect.any(Array),
          invalidData: 1,
        }),
      }),
    )

    expect(codec.encodeInput).not.toHaveBeenCalled()
    expect(transport.send).not.toHaveBeenCalled()
  })
})
