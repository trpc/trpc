import { decodePeerMessage, encodePeerMessage } from '@standard-server/peer'
import { os } from '../../builder'
import { RPCHandler } from './rpc-handler'

describe('rpcHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createHandler = (options: ConstructorParameters<typeof RPCHandler>[1] = {}) => {
    return new RPCHandler({
      ping: os.handler(async ({ signal }) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        signal?.throwIfAborted()

        return 'pong'
      }),
    }, options)
  }

  const createPort = () => {
    const channel = new MessageChannel()
    const clientPort = channel.port1
    const serverPort = channel.port2

    return {
      clientPort,
      serverPort,
    }
  }

  const createRequestMessage = async ({
    prefix,
    url = '/ping',
  }: { prefix?: string, url?: `/${string}` } = {}) => {
    return encodePeerMessage({
      id: '19',
      kind: 'request',
      json: {
        url,
        body: { json: 'input' },
        headers: {},
        method: 'POST',
      },
    }, prefix ? { prefix } : undefined)
  }

  it('accepts context and prefix option in message method', async () => {
    const handler = new RPCHandler({
      ping: os
        .$context<{ userId: string }>()
        .handler(({ context }) => context.userId),
    })

    const { serverPort } = createPort()
    const message = await createRequestMessage({ url: '/api/ping' })

    const posted: unknown[] = []
    vi.spyOn(serverPort, 'postMessage').mockImplementation((message) => {
      posted.push(message)
    })

    const result = await handler.message(serverPort as any, message, {
      context: { userId: 'u_123' },
      prefix: '/api',
    })

    expect(result.matched).toBe(true)
    expect(posted).toHaveLength(1)

    const decoded = decodePeerMessage(posted[0] as any) as any

    expect(decoded.matched).toBe(true)
    expect(decoded.message.kind).toBe('response')
    expect(decoded.message.json.status).toBe(undefined)
    expect(decoded.message.json.body).toEqual({ json: 'u_123' })
  })

  it.each([
    ['string', () => createRequestMessage()],
    ['bytes', async () => {
      const message = await createRequestMessage()
      return new TextEncoder().encode(message as string)
    }],
  ])('handles %s request', async (_type, createMessage) => {
    const handler = createHandler()
    const { serverPort } = createPort()
    const message = await createMessage()

    const posted: unknown[] = []
    vi.spyOn(serverPort, 'postMessage').mockImplementation((message) => {
      posted.push(message)
    })

    const result = await handler.message(serverPort as any, message)

    expect(result.matched).toBe(true)
    expect(posted).toHaveLength(1)

    const decoded = decodePeerMessage(posted[0] as any) as any

    expect(decoded.matched).toBe(true)
    expect(decoded.message.kind).toBe('response')
    expect(decoded.message.json.status).toBe(undefined)
  })

  it('can decode messages with prefix', async () => {
    const handler = createHandler({
      decodePeerMessage: { prefix: 'orpc:' },
    })

    const { serverPort } = createPort()
    const posted: unknown[] = []
    vi.spyOn(serverPort, 'postMessage').mockImplementation((message) => {
      posted.push(message)
    })

    const message = await createRequestMessage()

    const result = await handler.message(serverPort as any, message)

    expect(result).toEqual({ matched: false })
    expect(posted).toHaveLength(0)

    const prefixedMessage = await createRequestMessage({ prefix: 'orpc:' })

    const result2 = await handler.message(serverPort as any, prefixedMessage)

    expect(result2.matched).toBe(true)
    expect(posted).toHaveLength(1)
  })

  it('can encode messages with prefix', async () => {
    const handler = createHandler({
      encodePeerMessage: { prefix: 'orpc:' },
    })

    const { serverPort } = createPort()
    const posted: unknown[] = []
    vi.spyOn(serverPort, 'postMessage').mockImplementation((message) => {
      posted.push(message)
    })

    const message = await createRequestMessage()

    const result = await handler.message(serverPort as any, message)

    expect(result.matched).toBe(true)
    expect(posted).toHaveLength(1)

    const decoded = decodePeerMessage(posted[0] as any, { prefix: 'orpc:' }) as any

    expect(decoded.matched).toBe(true)
    expect(decoded.message.kind).toBe('response')
    expect(decoded.message.json.status).toBe(undefined)
  })

  it('aborts in-flight request on close before response is sent', async () => {
    let signal: AbortSignal | undefined
    let releaseProcedure: (() => void) | undefined

    const procedureBlock = new Promise<void>((resolve) => {
      releaseProcedure = resolve
    })

    const handler = new RPCHandler({
      ping: os.handler(async ({ signal: procedureSignal }) => {
        signal = procedureSignal
        await procedureBlock
        signal?.throwIfAborted()

        return 'pong'
      }),
    })

    const { serverPort } = createPort()
    const postMessage = vi.spyOn(serverPort, 'postMessage').mockImplementation(() => {
      // noop
    })

    const message = await createRequestMessage()
    void handler.message(serverPort as any, message)

    await vi.waitFor(() => {
      expect(signal).toBeDefined()
    })

    expect(signal!.aborted).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()

    await handler.close(serverPort as any)
    releaseProcedure!()

    await vi.waitFor(() => {
      expect(signal?.aborted).toBe(true)
    })

    expect(postMessage).not.toHaveBeenCalled()

    await handler.close(serverPort as any) // safe to invoke multiple times
  })

  it('can receive and send un-encoded messages with transfer option (structured clone)', async () => {
    const transferable = new Uint8Array([1, 2, 3]).buffer

    const transfer = vi.fn(async () => {
      return [transferable]
    })

    const handler = createHandler({
      experimental_transfer: transfer,
    })

    const { serverPort } = createPort()

    const postMessage = vi.spyOn(serverPort, 'postMessage').mockImplementation(() => {
      // noop
    })

    const result = await handler.message(serverPort as any, {
      id: '19',
      kind: 'request',
      json: {
        url: '/ping',
        body: { json: 'input' },
        headers: {},
        method: 'POST',
      },
    })

    expect(result.matched).toBe(true)
    expect(transfer).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'response' }), [transferable])
  })

  it('wires message and close events via upgrade', async () => {
    let onMessage: ((event: { data: string }) => void) | undefined
    let onClose: (() => void) | undefined
    let signal: AbortSignal | undefined
    let releaseProcedure: (() => void) | undefined

    const procedureBlock = new Promise<void>((resolve) => {
      releaseProcedure = resolve
    })

    const handler = new RPCHandler({
      ping: os.handler(async ({ signal: procedureSignal }) => {
        signal = procedureSignal
        await procedureBlock
        signal?.throwIfAborted()

        return 'pong'
      }),
    })

    const ws = {
      addEventListener: vi.fn((event: string, callback: any) => {
        if (event === 'message') {
          onMessage = callback
        }

        if (event === 'close') {
          onClose = callback
        }
      }),
      send: vi.fn(() => undefined),
    }

    handler.upgrade(ws as any)

    const request = await createRequestMessage()
    onMessage?.({ data: request as string })

    await vi.waitFor(() => {
      expect(signal).toBeDefined()
    })

    expect(ws.send).not.toHaveBeenCalled()

    onClose?.()
    releaseProcedure!()

    await vi.waitFor(() => {
      expect(signal?.aborted).toBe(true)
    })

    expect(ws.send).not.toHaveBeenCalled()
  })

  it('ignore invalid message format', async () => {
    const handler = createHandler()
    const { serverPort } = createPort()
    const result = await handler.message(serverPort as any, { invalid: true })
    expect(result.matched).toBe(false)
  })
})
