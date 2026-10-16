import { getPathMeta, meta, resolveBasePathMeta } from './meta-built-in'
import { ProcedureContract } from './procedure'

describe('meta.path', () => {
  it('returns plugin with correct name', () => {
    const plugin = meta.path(['users', 'list'])
    expect(plugin.name).toBe('~path')
  })

  it('init merges ~path into existing meta', () => {
    const plugin = meta.path(['users', 'list'])
    const result = plugin.init!({ existing: true } as any)
    expect(result).toEqual({ 'existing': true, '~path': ['users', 'list'] })
  })

  it('init overwrites existing ~path', () => {
    const plugin = meta.path(['new'])
    const result = plugin.init!({ '~path': ['old'] } as any)
    expect(result).toEqual({ '~path': ['new'] })
  })

  it('init does not mutate the original meta', () => {
    const plugin = meta.path(['a'])
    const original = { x: 1 } as any
    const result = plugin.init!(original)
    expect(result).not.toBe(original)
  })
})

describe('getPathMeta', () => {
  it('returns the path from meta', () => {
    const input = { '~orpc': { meta: { '~path': ['a', 'b'] } } }
    expect(getPathMeta(input as any)).toEqual(['a', 'b'])
  })

  it('returns undefined when ~path is not set', () => {
    const input = { '~orpc': { meta: {} } }
    expect(getPathMeta(input as any)).toBeUndefined()
  })
})

describe('resolveBasePathMeta', () => {
  function createContract(path?: string[]) {
    return new ProcedureContract({
      errorMap: {},
      meta: path ? { '~path': path } : {},
      inputSchemas: [],
      outputSchemas: [],
    })
  }

  it('returns meta.path for a procedure contract', () => {
    expect(resolveBasePathMeta(createContract(['users', 'list']) as any)).toEqual(['users', 'list'])
  })

  it('returns undefined when no procedure defines meta.path', () => {
    expect(resolveBasePathMeta(createContract() as any)).toBeUndefined()
    expect(resolveBasePathMeta({ users: { list: createContract() } } as any)).toBeUndefined()
  })

  it('derives the base path from the first procedure defining meta.path', () => {
    const router = {
      ping: createContract(),
      users: {
        list: createContract(['app', 'users', 'list']),
      },
    }

    expect(resolveBasePathMeta(router as any)).toEqual(['app'])
  })

  it('returns an empty base path when meta.path matches the position exactly', () => {
    expect(resolveBasePathMeta({ users: { list: createContract(['users', 'list']) } } as any)).toEqual([])
  })

  it('throws when meta.path does not match the procedure position', () => {
    expect(() => resolveBasePathMeta({ users: { find: createContract(['members', 'find']) } } as any)).toThrow(
      'Procedure contract at "users.find" defines meta.path "members.find" that does not match its path inside the given router contract.',
    )
  })

  it('ignore invalid contract', () => {
    expect(resolveBasePathMeta({ find: 'invalid' } as any)).toBeUndefined()

    expect(resolveBasePathMeta({
      find: 'invalid',
      create: createContract(['users', 'create']),
    } as any)).toEqual(['users'])
  })
})
