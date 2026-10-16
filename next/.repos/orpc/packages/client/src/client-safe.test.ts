import { createSafeClient } from './client-safe'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createSafeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const client = {
    ping: vi.fn(),
    nested: {
      pong: vi.fn(),
    },
    invalid: 'invalid',
  } as any

  const safeClient = createSafeClient(client) as any

  it('works', async () => {
    const signal = new AbortController().signal
    client.ping.mockResolvedValue(42)
    const result = await safeClient.ping('input', { signal })

    expect(result.error).toBeNull()
    expect(result.data).toBe(42)
    expect(client.ping).toHaveBeenCalledWith('input', { signal })
  })

  it('support nested clients', async () => {
    const signal = new AbortController().signal
    client.nested.pong.mockResolvedValue({ result: 'pong' })
    const result = await safeClient.nested.pong({ id: 123 }, { signal })

    expect(result.error).toBeNull()
    expect(result.data).toEqual({ result: 'pong' })
    expect(client.nested.pong).toHaveBeenCalledWith({ id: 123 }, { signal })
  })

  it('safe on error', async () => {
    const error = new Error('Something went wrong')
    client.ping.mockRejectedValue(error)
    const result = await safeClient.ping('input')

    expect(result.error).toBe(error)
    expect(result.data).toBeUndefined()
    expect(client.ping).toHaveBeenCalledWith('input')
  })

  it('returns strictly equal client on repeated access', () => {
    expect(safeClient.ping).toBe(safeClient.ping)
    expect(safeClient.nested).toBe(safeClient.nested)
    expect(safeClient.nested.pong).toBe(safeClient.nested.pong)
    expect(safeClient.nested.pong).not.toBe(safeClient.ping)

    expect(createSafeClient(client)).not.toBe(safeClient)
  })

  it('not proxy on non-object or symbol properties', () => {
    expect(safeClient.invalid).toBe('invalid')
    expect(safeClient[Symbol('test')]).toEqual(undefined)
    expect(safeClient.nested[Symbol('test')]).toEqual(undefined)
  })

  it('not recursive on unwrap keys', async () => {
    expect(safeClient.then).toBeUndefined()
    expect(await safeClient).toBe(safeClient)
    expect(safeClient.call).toBe(Function.prototype.call)
    expect(safeClient.apply).toBe(Function.prototype.apply)

    client.ping.mockResolvedValue(42)
    const result = await safeClient.ping.call(undefined, 'input')
    expect(result.error).toBeNull()
    expect(result.data).toBe(42)
    expect(client.ping).toHaveBeenCalledWith('input')
  })
})
