import { AbortError, sleep } from '@orpc/shared'
import { decodePeerMessage, encodePeerMessage } from '@standard-server/peer'
import { createORPCClient } from '../../client'
import { RPCLink } from './rpc-link'

describe('rpcLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  let onMessage: any
  let onClose: any

  const createPort = () => {
    const port = {
      addEventListener: vi.fn((event: string, callback: any) => {
        if (event === 'message')
          onMessage = callback
        if (event === 'close')
          onClose = callback
      }),
      postMessage: vi.fn(),
    }

    return port
  }

  const createResponseMessage = async ({
    id,
    body = { json: 'pong' },
    status = 200,
    prefix,
  }: { id: string, body?: unknown, status?: number, prefix?: string }) => {
    return encodePeerMessage({
      id,
      kind: 'response',
      json: { body, status, headers: {} },
    }, prefix ? { prefix } : undefined)
  }

  const decodeRequest = (sent: any, prefix?: string) => {
    return decodePeerMessage(sent, prefix ? { prefix } : undefined) as {
      matched: true
      message: { id: string, kind: string, json: any }
    }
  }

  it.each([
    ['string', async (encoded: string | Uint8Array) => encoded],
    ['bytes', async (encoded: string | Uint8Array) => new TextEncoder().encode(encoded as string)],
  ])('handles %s response', async (_type, transform) => {
    const port = createPort()
    const orpc = createORPCClient(new RPCLink({ port })) as any

    const promise = expect(orpc.ping('input')).resolves.toEqual('pong')

    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(1))

    const decoded = decodeRequest(port.postMessage.mock.calls[0]![0])

    expect(decoded.matched).toBe(true)
    expect(decoded.message.kind).toBe('request')
    expect(decoded.message.id).toBeTypeOf('string')
    expect(decoded.message.json).toEqual({
      url: '/ping',
      body: { json: 'input' },
    })

    const raw = await createResponseMessage({ id: decoded.message.id })
    onMessage({ data: await transform(raw) })

    await promise
  })

  it('aborts pending requests on close', async () => {
    const port = createPort()
    const orpc = createORPCClient(new RPCLink({ port })) as any

    const promise = expect(orpc.ping('input')).rejects.toThrow(new AbortError('MessagePort closed'))

    await sleep(0)

    onClose()

    await promise
  })

  it('rejects calls made after close', async () => {
    const port = createPort()
    const orpc = createORPCClient(new RPCLink({ port })) as any

    onClose()

    await expect(orpc.ping('input')).rejects.toThrow(new AbortError('MessagePort closed'))
    expect(port.postMessage).not.toHaveBeenCalled()
  })

  it('can encode messages with prefix', async () => {
    const port = createPort()
    const orpc = createORPCClient(new RPCLink({
      port,
      encodePeerMessage: { prefix: 'orpc:' },
    })) as any

    const promise = expect(orpc.ping('input')).resolves.toEqual('pong')

    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(1))

    const decoded = decodeRequest(port.postMessage.mock.calls[0]![0], 'orpc:')

    expect(decoded.matched).toBe(true)
    expect(decoded.message.kind).toBe('request')

    onMessage({ data: await createResponseMessage({ id: decoded.message.id }) })

    await promise
  })

  it('can decode messages with prefix and ignore messages with mismatched prefix', async () => {
    const port = createPort()
    const orpc = createORPCClient(new RPCLink({
      port,
      decodePeerMessage: { prefix: 'orpc:' },
    })) as any

    const promise = expect(orpc.ping('input')).resolves.toEqual('pong')

    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(1))

    const decoded = decodeRequest(port.postMessage.mock.calls[0]![0])
    const id = decoded.message.id

    // Message with wrong prefix — should be ignored
    onMessage({ data: await createResponseMessage({ id, prefix: 'wrong:' }) })

    // Correct message — should be processed
    onMessage({ data: await createResponseMessage({ id, prefix: 'orpc:' }) })

    await promise
  })

  it('can receive and send un-encoded messages with transfer option (structured clone)', async () => {
    const port = createPort()
    const transferable = new Uint8Array([1, 2, 3]).buffer
    const transfer = vi.fn(async () => [transferable])
    const orpc = createORPCClient(new RPCLink({
      port,
      experimental_transfer: transfer,
    })) as any

    const promise = expect(orpc.ping('input')).resolves.toEqual('pong')

    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(1))

    const message = port.postMessage.mock.calls[0]![0]

    expect(port.postMessage).toHaveBeenCalledWith(
      message,
      [transferable],
    )

    onMessage({
      data: {
        id: message.id,
        kind: 'response',
        json: { body: { json: 'pong' }, status: 200, headers: {} },
      },
    })

    await promise
  })

  it('ignore invalid messages', async () => {
    const port = createPort()
    const orpc = createORPCClient(new RPCLink({ port })) as any

    const promise = expect(orpc.ping('input')).resolves.toEqual('pong')

    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(1))

    const decoded = decodeRequest(port.postMessage.mock.calls[0]![0])
    const id = decoded.message.id

    // Invalid message — should be ignored
    onMessage({ data: { invalid: true } })

    // Correct message — should be processed
    onMessage({ data: await createResponseMessage({ id }) })

    await promise
  })
})
