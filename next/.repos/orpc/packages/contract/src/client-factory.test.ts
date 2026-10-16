import type { ClientContext, ClientLink } from '@orpc/client'
import { createContractClientFactory } from './client-factory'
import { ProcedureContract } from './procedure'

beforeEach(() => {
  vi.clearAllMocks()
})

function createContract(path?: string[]) {
  return new ProcedureContract({
    errorMap: {},
    meta: path ? { '~path': path } : {},
    inputSchemas: [],
    outputSchemas: [],
  })
}

describe('createContractClientFactory', () => {
  const mockedLink: ClientLink<ClientContext> = {
    call: vi.fn().mockReturnValue('__mocked__'),
  }

  it('throws when no procedure contract defines meta.path', () => {
    const factory = createContractClientFactory(mockedLink)

    expect(() => factory(createContract() as any)).toThrow(
      'ContractClientFactory: procedure contract must define `meta.path` that matches its path in the root router contract.',
    )

    expect(() => factory({ users: { list: createContract() } } as any)).toThrow(
      'ContractClientFactory: procedure contract must define `meta.path` that matches its path in the root router contract.',
    )

    expect(mockedLink.call).not.toHaveBeenCalled()
  })

  it('returns a client that calls the link with the procedure path and syncs routerRef', async () => {
    const routerRef = {}
    const factory = createContractClientFactory(mockedLink, { contractRef: routerRef })
    const procedure = createContract(['users', 'list'])
    const signal = new AbortController().signal

    const client = factory(procedure as any)

    expect(routerRef).toEqual({
      users: {
        list: {
          '~orpc': procedure['~orpc'],
        },
      },
    })
    expect((routerRef as any).users.list).toBeInstanceOf(ProcedureContract)

    expect(mockedLink.call).not.toHaveBeenCalled()

    expect(await (client as any)({ value: 'hello' }, { context: { requestId: 'request_1' }, signal })).toBe('__mocked__')

    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(
      ['users', 'list'],
      { value: 'hello' },
      { context: { requestId: 'request_1' }, signal },
    )
  })

  it('returns a router client when a router contract is passed', async () => {
    const routerRef = {}
    const factory = createContractClientFactory(mockedLink, { contractRef: routerRef })
    // a sub-router: the base path is derived from the first procedure defining meta.path
    const list = createContract(['users', 'list'])
    const find = createContract()

    const client = factory({
      list,
      find,
    } as any) as any

    expect(routerRef).toEqual({
      users: {
        list: {
          '~orpc': list['~orpc'],
        },
        find: {
          '~orpc': find['~orpc'],
        },
      },
    })

    expect(await client.list({ value: 'hello' })).toBe('__mocked__')
    expect(mockedLink.call).toHaveBeenCalledWith(
      ['users', 'list'],
      { value: 'hello' },
      { context: {} },
    )

    // every procedure resolves as base path + its path within the passed router contract
    expect(await client.find({ value: 'hi' })).toBe('__mocked__')
    expect(mockedLink.call).toHaveBeenCalledWith(
      ['users', 'find'],
      { value: 'hi' },
      { context: {} },
    )
  })

  it('passes interceptors through to the per-procedure client', async () => {
    const interceptor = vi.fn(({ path, input, context, next }) => {
      expect(path).toEqual(['users', 'find'])
      expect(input).toEqual({ value: 'hello' })
      expect(context).toEqual({ requestId: 'request_1' })

      return next({
        path,
        input: { value: 'intercepted' },
        context: { ...context, traceId: 'trace_1' },
      })
    })

    const factory = createContractClientFactory(mockedLink, {
      interceptors: [interceptor],
    })

    const client = factory(createContract(['users', 'find']) as any) as any

    expect(await client({ value: 'hello' }, { context: { requestId: 'request_1' } })).toBe('__mocked__')

    expect(interceptor).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(
      ['users', 'find'],
      { value: 'intercepted' },
      { context: { requestId: 'request_1', traceId: 'trace_1' } },
    )
  })

  it('passes scoped through, based on the resolved base path', async () => {
    const interceptor = vi.fn(({ path, input, context, next }) => {
      expect(path).toEqual(['users', 'find'])
      expect(input).toEqual({ value: 'hello' })
      expect(context).toEqual({ requestId: 'request_1' })

      return next({
        path,
        input: { value: 'intercepted' },
        context: { ...context, traceId: 'trace_1' },
      })
    })

    const factory = createContractClientFactory(mockedLink, {
      scoped: {
        users: {
          find: {
            interceptors: [interceptor],
          },
        },
      } as any,
    })

    const client = factory({
      find: createContract(['users', 'find']),
    } as any) as any

    expect(await client.find({ value: 'hello' }, { context: { requestId: 'request_1' } })).toBe('__mocked__')

    expect(interceptor).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(
      ['users', 'find'],
      { value: 'intercepted' },
      { context: { requestId: 'request_1', traceId: 'trace_1' } },
    )
  })

  it('ignore invalid contract when sync routerRef', async () => {
    const contractRef = {}
    const factory = createContractClientFactory(mockedLink, {
      contractRef,
    })

    const contract = {
      find: createContract(['users', 'find']),
      router: 'invalid' as any,
    }

    const client = factory(contract)

    expect(contractRef).toEqual({
      users: {
        find: {
          '~orpc': contract.find['~orpc'],
        },
      },
    })
  })
})
