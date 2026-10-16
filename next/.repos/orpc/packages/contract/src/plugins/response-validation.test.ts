import { ORPCError } from '@orpc/client'
import { StandardLink } from '@orpc/client/standard'
import * as z from 'zod'
import { ValidationError } from '../error'
import { reconcileORPCError } from '../error-utils'
import { ProcedureContract } from '../procedure'
import { ResponseValidationLinkPlugin } from './response-validation'

vi.mock('../error-utils', async original => ({
  ...await original(),
  reconcileORPCError: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('responseValidationLinkPlugin', () => {
  const procedure = new ProcedureContract({
    outputSchemas: [
      z.object({
        value: z.number().transform(value => value + 1),
      }),
      z.object({
        value: z.string().transform(value => Number.parseInt(value)),
      }),
    ],
    errorMap: {
      TEST: {
        data: z.object({
          value: z.string().transform(value => Number.parseInt(value)),
        }),
      },
    },
    meta: {},
  })

  const withoutOutputSchemaProcedure = new ProcedureContract({
    errorMap: {},
    meta: {},
  })

  const contract = {
    procedure,
    nested: {
      procedure,
    },
    withoutOutputSchema: withoutOutputSchemaProcedure,
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
      new ResponseValidationLinkPlugin(contract),
    ],
    interceptors: [interceptor],
  })

  it('validates output using the output schema pipeline', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/procedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({
      kind: 'output',
      output: { value: '123' },
    })

    const output = await link.call(['procedure'], {}, { context: {} })

    expect(output).toEqual({ value: 124 })
    expect(await interceptor.mock.results[0]?.value).toEqual({ value: 124 })
  })

  it('skips validation when the procedure has no output schemas', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/withoutOutputSchema',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({
      kind: 'output',
      output: 'anything',
    })

    const output = await link.call(['withoutOutputSchema'], {}, { context: {} })

    expect(output).toBe('anything')
    expect(await interceptor.mock.results[0]?.value).toBe('anything')
  })

  it('throws INTERNAL_SERVER_ERROR when output validation fails', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/procedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })
    codec.decodeResponse.mockResolvedValueOnce({
      kind: 'output',
      output: 'invalid',
    })

    const expectedError = new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Output validation failed',
      cause: expect.any(ValidationError),
    })

    vi.mocked(reconcileORPCError).mockImplementationOnce(async (map, error) => {
      expect(map).toBe(contract.procedure['~orpc'].errorMap)
      expect(error).toBeInstanceOf(ORPCError)
      expect(error.code).toBe('INTERNAL_SERVER_ERROR')
      expect(error.message).toBe('Output validation failed')
      expect(error.cause).toBeInstanceOf(ValidationError)
      expect((error.cause as ValidationError).invalidData).toBe('invalid')

      return expectedError
    })

    await expect(link.call(['procedure'], {}, { context: {} })).rejects.toBe(expectedError)
    await expect(interceptor.mock.results[0]?.value).rejects.toEqual(expectedError)
  })

  it('reconciles thrown ORPCError instances against the contract', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/nested/procedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 400,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })

    const error = new ORPCError('TEST', { message: 'test', data: { value: '123' } })
    const reconciled = new ORPCError('TEST', { message: 'test', data: { value: 123 } })

    codec.decodeResponse.mockResolvedValueOnce({ kind: 'error', error })
    vi.mocked(reconcileORPCError).mockResolvedValueOnce(reconciled)

    await expect(link.call(['nested', 'procedure'], {}, { context: {} })).rejects.toBe(reconciled)
    await expect(interceptor.mock.results[0]?.value).rejects.toBe(error)

    expect(reconcileORPCError).toHaveBeenCalledWith(contract.nested.procedure['~orpc'].errorMap, error)
  })

  it('rethrows non-ORPCError failures without reconciliation', async () => {
    codec.encodeInput.mockResolvedValueOnce({
      method: 'POST',
      url: '/nested/procedure',
      headers: {},
      body: '__encoded__',
    })
    transport.send.mockResolvedValueOnce({
      status: 500,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    })

    const error = new Error('plain failure')

    codec.decodeResponse.mockRejectedValueOnce(error)

    await expect(link.call(['nested', 'procedure'], {}, { context: {} })).rejects.toBe(error)
    await expect(interceptor.mock.results[0]?.value).rejects.toBe(error)

    expect(reconcileORPCError).not.toHaveBeenCalled()
  })
})
