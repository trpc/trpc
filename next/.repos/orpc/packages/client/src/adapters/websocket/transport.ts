import type { Promisable } from '@orpc/shared'
import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { DecodePeerMessageOptions, EncodePeerMessageOptions } from '@standard-server/peer'
import type { ClientContext, ClientOptions } from '../../types'
import type { StandardLinkTransport } from '../standard'
import { AbortError, loadBytes, promiseWithResolvers, runWithSignal, sequential, sleep, toStringOrBytes } from '@orpc/shared'
import { ClientPeer, decodePeerMessage, encodePeerMessage, isServerPeerSendMessage } from '@standard-server/peer'

/**
 * Some env maybe not available WebSocket global, like node 20
 */
const WEBSOCKET_CONNECTING = 0 satisfies WebSocket['CONNECTING']
const WEBSOCKET_OPEN = 1 satisfies WebSocket['OPEN']

export type WebSocketLike = Pick<WebSocket, 'addEventListener' | 'removeEventListener' | 'send' | 'readyState'>

export interface WebSocketLinkTransportAttemptInfo {
  /**
   * Total number of connection attempts for this transport's lifetime.
   * Starts at 1 on the first attempt, increments on every subsequent
   * attempt, and never resets.
   */
  totalAttempt: number

  /**
   * Attempt number within the current (re)connect cycle.
   * Starts at 1, increments on each consecutive failure, and resets to 1
   * once a connection succeeds or the cycle gives up. Use this for backoff calculations.
   */
  attempt: number
}

export interface WebSocketLinkTransportReconnectOptions {
  /**
   * Whether to automatically reconnect when the connection is lost.
   *
   * @default false
   */
  enabled: boolean

  /**
   * Delay before a (re)connect attempt, in milliseconds.
   *
   * @default info => info.attempt === 1 ? 0 : 2_000
   */
  delay?: undefined | ((info: WebSocketLinkTransportAttemptInfo) => number)

  /**
   * Maximum number of consecutive failed attempts before giving up.
   * When reached, calls waiting for the connection fail, and the next
   * call starts a new reconnect cycle.
   * Should greater than 1
   *
   * @default Infinity
   */
  maxAttempt?: undefined | number

  /**
   * Maximum number of connection attempts over the transport's lifetime,
   * successful ones included (see `totalAttempt`).
   * When reached, calls that need a new connection fail instead of connecting.
   *
   * @default Infinity
   */
  maxTotalAttempt?: undefined | number

  /**
   * Whether to proactively reconnect right after the socket closes,
   * rather than waiting for the next call to trigger reconnection.
   * Reduces latency for the next request.
   *
   * @default { enabled: false }
   */
  onClose?: undefined | {
    /**
     * Whether to proactively reconnect right after the socket closes,
     * rather than waiting for the next call to trigger reconnection.
     * Reduces latency for the next request.
     *
     * @default false
     */
    enabled: boolean

    /**
     * Delay before reconnecting after the socket closes, in milliseconds.
     *
     * @default 0
     */
    delay?: number
  }
}

export interface WebSocketLinkTransportOptions<_T extends ClientContext> {
  /**
   * Returns a WebSocket instance for peer communication.
   * Can be async for lazy resolution.
   */
  connect: (info: WebSocketLinkTransportAttemptInfo) => Promisable<WebSocketLike>

  /**
   * Whether to connect immediately on initialization, instead of waiting
   * for the first call. Reduces latency for the first request.
   *
   * @default false
   */
  connectOnInit?: undefined | boolean

  /**
   * Reconnection behavior when the connection is lost.
   *
   * @default { enabled: false }
   */
  reconnect?: undefined | WebSocketLinkTransportReconnectOptions

  /**
   * Options for encoding peer messages. such as `prefix` for distinguishing messages on the same channel..
   */
  encodePeerMessage?: EncodePeerMessageOptions | undefined

  /**
   * Options for decoding peer messages. such as `prefix` for distinguishing messages on the same channel..
   */
  decodePeerMessage?: DecodePeerMessageOptions | undefined
}

export class WebSocketLinkTransport<T extends ClientContext> implements StandardLinkTransport<T> {
  private readonly connect: WebSocketLinkTransportOptions<T>['connect']
  private readonly reconnectEnabled: boolean
  private readonly reconnectDelay: (info: WebSocketLinkTransportAttemptInfo) => number
  private readonly reconnectMaxAttempt: number
  private readonly reconnectMaxTotalAttempt: number
  private readonly reconnectOnCloseEnabled: boolean
  private readonly reconnectOnCloseDelay: number
  private readonly encodePeerMessageOptions: WebSocketLinkTransportOptions<T>['encodePeerMessage']
  private readonly decodePeerMessageOptions: WebSocketLinkTransportOptions<T>['decodePeerMessage']

  constructor(options: WebSocketLinkTransportOptions<T>) {
    this.connect = options.connect
    this.reconnectEnabled = options.reconnect?.enabled ?? false
    this.reconnectDelay = options.reconnect?.delay ?? (info => info.attempt === 1 ? 0 : 2_000)
    this.reconnectMaxAttempt = options.reconnect?.maxAttempt ?? Infinity
    this.reconnectMaxTotalAttempt = options.reconnect?.maxTotalAttempt ?? Infinity
    this.reconnectOnCloseEnabled = this.reconnectEnabled && (options.reconnect?.onClose?.enabled ?? false)
    this.reconnectOnCloseDelay = options.reconnect?.onClose?.delay ?? 0

    this.encodePeerMessageOptions = options.encodePeerMessage
    this.decodePeerMessageOptions = options.decodePeerMessage

    if (options.connectOnInit) {
      this.getConnectedPeer().catch(() => {})
    }
  }

  async send(standardRequest: StandardRequest, _path: string[], _options: ClientOptions<T>): Promise<StandardLazyResponse> {
    const peer = await runWithSignal(
      standardRequest.signal,
      () => this.getConnectedPeer(),
    )

    return peer.request(standardRequest)
  }

  private totalAttempt = 0
  private attempt = 0
  private current: undefined | Promise<void | { websocket: WebSocketLike, peer: ClientPeer }>
  private async getConnectedPeer(): Promise<ClientPeer> {
    const current = this.current
    const resolved = await current

    if (resolved && (!this.reconnectEnabled || resolved.websocket.readyState === WEBSOCKET_OPEN)) {
      return resolved.peer
    }

    if (current !== this.current) {
      return this.getConnectedPeer()
    }

    if (this.totalAttempt >= this.reconnectMaxTotalAttempt) {
      throw new AbortError(`WebSocket reconnect stopped after ${this.totalAttempt} total attempt(s)`)
    }

    this.current = (async () => {
      this.totalAttempt += 1
      this.attempt += 1

      const info: WebSocketLinkTransportAttemptInfo = { totalAttempt: this.totalAttempt, attempt: this.attempt }

      await sleep(this.reconnectDelay(info))
      const websocket = await this.connect(info)

      if (websocket.readyState !== WEBSOCKET_CONNECTING && websocket.readyState !== WEBSOCKET_OPEN) {
        throw new AbortError('WebSocket is already closing or closed')
      }

      let closeReason: undefined | AbortError

      const peer = new ClientPeer(async (message) => {
        // `send` silently discards data once the socket is closed, so requests would never settle
        if (closeReason) {
          throw closeReason
        }

        const encoded = await encodePeerMessage(message, this.encodePeerMessageOptions)
        return websocket.send(encoded)
      })

      let connectingResolvers: undefined | { promise: Promise<void>, resolve: () => void }
      if (websocket.readyState === WEBSOCKET_CONNECTING) {
        connectingResolvers = promiseWithResolvers()
        websocket.addEventListener('open', () => {
          connectingResolvers?.resolve()
        })
      }

      /**
       * Message order is important: loading -> decode -> .message.
       * This flow must stay synchronous, or we need to use `sequential` helper
       */
      websocket.addEventListener('message', sequential(async (event: MessageEvent) => {
        // For better compatibility avoid control or depend on websocket.binaryType
        const message = event.data instanceof Blob ? await loadBytes(event.data) : toStringOrBytes(event.data)
        const result = decodePeerMessage(message, this.decodePeerMessageOptions)
        if (result.matched && isServerPeerSendMessage(result.message)) {
          // Not awaited: `peer.message` runs handling message may be slow,
          // and awaiting it would block decoding of subsequent messages.
          peer.message(result.message)
        }
      }))

      websocket.addEventListener('close', async (event) => {
        closeReason = new AbortError(`WebSocket closed (code ${event.code}: ${event.reason})`)
        connectingResolvers?.resolve()
        await peer.close(closeReason)
      })

      // EventEmitter-based implementations like `ws` throw an unhandled `error` event,
      // so a refused connection or malformed frame would crash the process. `close` always follows and handles cleanup.
      websocket.addEventListener('error', () => {})

      await connectingResolvers?.promise

      if (closeReason) {
        throw closeReason
      }

      if (this.reconnectOnCloseEnabled) {
        websocket.addEventListener('close', () => {
          sleep(this.reconnectOnCloseDelay)
            .then(() => this.getConnectedPeer())
            .catch(() => {})
        })
      }

      this.attempt = 0
      return { websocket, peer }
    })().catch((error) => {
      if (!this.reconnectEnabled) {
        throw error
      }

      if (this.attempt >= this.reconnectMaxAttempt) {
        const attempt = this.attempt
        this.attempt = 0
        this.current = undefined
        throw new AbortError(`WebSocket reconnect failed after ${attempt} attempt(s)`, { cause: error })
      }
    })

    return this.getConnectedPeer()
  }
}
