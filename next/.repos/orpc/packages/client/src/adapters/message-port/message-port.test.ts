import { onMessagePortClose, onMessagePortMessage, postMessagePortMessage } from './message-port'

describe('postMessagePortMessage', () => {
  it('posts message without transfer', () => {
    const port = { postMessage: vi.fn() } as any

    postMessagePortMessage(port, 'hello')

    expect(port.postMessage).toHaveBeenCalledTimes(1)
    expect(port.postMessage).toHaveBeenCalledWith('hello')
  })

  it('posts message with transfer', () => {
    const port = { postMessage: vi.fn() } as any
    const transferable = new Uint8Array([1, 2, 3]).buffer

    postMessagePortMessage(port, 'hello', [transferable])

    expect(port.postMessage).toHaveBeenCalledTimes(1)
    expect(port.postMessage).toHaveBeenCalledWith('hello', [transferable])
  })
})

describe('onMessagePortMessage', () => {
  it('uses addEventListener for MessagePort', () => {
    const callback = vi.fn()
    const port = {
      addEventListener: vi.fn(),
    } as any

    onMessagePortMessage(port, callback)

    expect(port.addEventListener).toHaveBeenCalledWith('message', expect.any(Function))

    const handler = port.addEventListener.mock.calls[0]![1]
    handler({ data: 'hello' })

    expect(callback).toHaveBeenCalledWith('hello')
  })

  it('uses on for MessagePortMainLike', () => {
    const callback = vi.fn()
    const port = {
      on: vi.fn(),
    } as any

    onMessagePortMessage(port, callback)

    expect(port.on).toHaveBeenCalledWith('message', expect.any(Function))

    const handler = port.on.mock.calls[0]![1]

    handler({ data: 'hello' })
    expect(callback).toHaveBeenCalledWith('hello')

    // event?.data handles undefined event
    handler(undefined)
    expect(callback).toHaveBeenCalledWith(undefined)
  })

  it('uses onMessage.addListener for BrowserPortLike', () => {
    const callback = vi.fn()
    const port = {
      onMessage: { addListener: vi.fn() },
    } as any

    onMessagePortMessage(port, callback)

    expect(port.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function))

    const handler = port.onMessage.addListener.mock.calls[0]![0]
    handler('hello')

    expect(callback).toHaveBeenCalledWith('hello')
  })

  it('throws on unsupported port', () => {
    const callback = vi.fn()
    const port = {} as any

    expect(() => onMessagePortMessage(port, callback)).toThrow(
      'Cannot find a addEventListener/on/onMessage method on the port',
    )
  })
})

describe('onMessagePortClose', () => {
  it('uses addEventListener for MessagePort', () => {
    const callback = vi.fn()
    const port = {
      addEventListener: vi.fn(),
    } as any

    onMessagePortClose(port, callback)

    expect(port.addEventListener).toHaveBeenCalledWith('close', expect.any(Function))

    const handler = port.addEventListener.mock.calls[0]![1]
    handler()

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('uses on for MessagePortMainLike', () => {
    const callback = vi.fn()
    const port = {
      on: vi.fn(),
    } as any

    onMessagePortClose(port, callback)

    expect(port.on).toHaveBeenCalledWith('close', expect.any(Function))

    const handler = port.on.mock.calls[0]![1]
    handler()

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('uses onDisconnect.addListener for BrowserPortLike', () => {
    const callback = vi.fn()
    const port = {
      onDisconnect: { addListener: vi.fn() },
    } as any

    onMessagePortClose(port, callback)

    expect(port.onDisconnect.addListener).toHaveBeenCalledWith(expect.any(Function))

    const handler = port.onDisconnect.addListener.mock.calls[0]![0]
    handler()

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('throws on unsupported port', () => {
    const callback = vi.fn()
    const port = {} as any

    expect(() => onMessagePortClose(port, callback)).toThrow(
      'Cannot find a addEventListener/on/onDisconnect method on the port',
    )
  })
})
