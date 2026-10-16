import { ProcedureContract } from '@orpc/contract'
import { createContractJsonifiedUtilsFactory, createContractUtilsFactory } from './contract-utils'
import * as routerUtilsModule from './router-utils'

const createRouterUtilsSpy = vi.spyOn(routerUtilsModule, 'createRouterUtils')

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

describe('createContractUtilsFactory', () => {
  const clientFactory = vi.fn()

  it('throws when no procedure contract defines meta.path', () => {
    const factory = createContractUtilsFactory(clientFactory as any, {})

    expect(() => factory(createContract() as any)).toThrow(
      'ContractUtilsFactory: procedure contract must define `meta.path` that matches its path in the root router contract.',
    )

    expect(() => factory({ users: { list: createContract() } } as any)).toThrow(
      'ContractUtilsFactory: procedure contract must define `meta.path` that matches its path in the root router contract.',
    )

    expect(createRouterUtilsSpy).not.toHaveBeenCalled()
  })

  it('passes the created client and resolved path to createRouterUtils', () => {
    const delegatedUtils = { queryOptions: vi.fn() }
    const queryInterceptor = vi.fn()
    const mutationInterceptor = vi.fn()
    const plugin = {
      name: 'test-plugin',
      init: vi.fn((options: unknown) => options),
      initProcedureOptions: vi.fn((_: string[], options: unknown) => options),
    }
    const scopedOptions = {
      queryOptions: {
        staleTime: 1000,
      },
    }
    const options = {
      prefix: '__prefix__',
      queryInterceptors: [queryInterceptor],
      mutationInterceptors: [mutationInterceptor],
      plugins: [plugin],
      scoped: {
        users: {
          list: scopedOptions,
        },
      },
    }
    const procedure = createContract(['users', 'list'])
    const delegatedClient = vi.fn()

    clientFactory.mockReturnValueOnce(delegatedClient)
    createRouterUtilsSpy.mockReturnValueOnce(delegatedUtils as any)

    const factory = createContractUtilsFactory(clientFactory as any, options as any)
    const result = factory(procedure as any)

    expect(result).toBe(delegatedUtils)
    expect(clientFactory).toHaveBeenCalledTimes(1)
    expect(clientFactory).toHaveBeenCalledWith(procedure)

    expect(createRouterUtilsSpy).toHaveBeenCalledTimes(1)
    expect(createRouterUtilsSpy).toHaveBeenCalledWith(delegatedClient, {
      ...options,
      path: ['users', 'list'],
      scoped: scopedOptions,
    })
  })

  it('resolves the base path when a router contract is passed', () => {
    const delegatedUtils = { queryOptions: vi.fn() }
    const delegatedClient = { list: vi.fn(), find: vi.fn() }
    const scopedListOptions = {
      queryOptions: {
        staleTime: 1000,
      },
    }
    const options = {
      prefix: '__prefix__',
      scoped: {
        users: {
          list: scopedListOptions,
        },
      },
    }
    const router = {
      list: createContract(['users', 'list']),
      find: createContract(['users', 'find']),
    }

    clientFactory.mockReturnValueOnce(delegatedClient)
    createRouterUtilsSpy.mockReturnValueOnce(delegatedUtils as any)

    const factory = createContractUtilsFactory(clientFactory as any, options as any)
    const result = factory(router as any)

    expect(result).toBe(delegatedUtils)
    expect(clientFactory).toHaveBeenCalledTimes(1)
    expect(clientFactory).toHaveBeenCalledWith(router)

    expect(createRouterUtilsSpy).toHaveBeenCalledTimes(1)
    expect(createRouterUtilsSpy).toHaveBeenCalledWith(delegatedClient, {
      ...options,
      path: ['users'],
      scoped: {
        list: scopedListOptions,
      },
    })
  })
})

describe('createContractJsonifiedUtilsFactory', () => {
  const clientFactory = vi.fn()

  it('delegates to createRouterUtils with the resolved path', () => {
    const delegatedUtils = { mutationOptions: vi.fn() }
    const scopedOptions = {
      mutationOptions: {
        meta: {
          feature: 'jsonified',
        },
      },
    }
    const options = {
      prefix: '__json__',
      scoped: {
        nested: {
          pong: scopedOptions,
        },
      },
    }
    const procedure = createContract(['nested', 'pong'])
    const delegatedClient = vi.fn()

    clientFactory.mockReturnValueOnce(delegatedClient)
    createRouterUtilsSpy.mockReturnValueOnce(delegatedUtils as any)

    const factory = createContractJsonifiedUtilsFactory(clientFactory as any, options as any)
    const result = factory(procedure as any)

    expect(result).toBe(delegatedUtils)
    expect(clientFactory).toHaveBeenCalledTimes(1)
    expect(clientFactory).toHaveBeenCalledWith(procedure)

    expect(createRouterUtilsSpy).toHaveBeenCalledTimes(1)
    expect(createRouterUtilsSpy).toHaveBeenCalledWith(delegatedClient, {
      ...options,
      path: ['nested', 'pong'],
      scoped: scopedOptions,
    })
  })
})
