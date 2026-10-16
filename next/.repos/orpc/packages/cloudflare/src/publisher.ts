import type { PublisherOptions, PublisherSubscribeListenerOptions } from '@orpc/publisher'
import type { Public } from '@orpc/shared'
import { RPCJsonSerializer } from '@orpc/client'
import { Publisher } from '@orpc/publisher'
import { isTypescriptObject, promiseWithResolvers, stringifyJSON } from '@orpc/shared'
import { unwrapEvent, withEventMeta } from '@standard-server/core'

export interface DurablePublisherOptions extends PublisherOptions {
  /**
   * Prefix for events, to avoid naming conflicts with other publishers in the same Durable Object Namespace.
   *
   * @default ''
   */
  prefix?: string

  /**
   * Serializer for serialize and deserialize payloads.
   *
   * @default RPCJsonSerializer
   */
  serializer?: undefined | Public<RPCJsonSerializer>

  /**
   * Custom function to get the Durable Object stub for publishing.
   *
   * @default ((namespace, event) => namespace.getByName(event))
   */
  getStubByName?: (namespace: DurableObjectNamespace, event: string) => DurableObjectStub
}

/**
 * Publisher adapter for Cloudflare Durable Objects. Routes publishes and
 * subscriptions to a `DurablePublisherObject` per event, delivering events over WebSockets.
 *
 * @see {@link https://orpc.dev/docs/helpers/publisher#adapters | Publisher Helpers - Adapters}
 */
export class DurablePublisher<T extends Record<string, object>> extends Publisher<T> {
  private readonly prefix: string
  private readonly serializer: Public<RPCJsonSerializer>
  private readonly getStubByName: Exclude<DurablePublisherOptions['getStubByName'], undefined>

  constructor(
    private readonly namespace: DurableObjectNamespace<any>,
    { prefix, getStubByName, ...options }: DurablePublisherOptions = {},
  ) {
    super(options)
    this.prefix = prefix ?? ''
    this.serializer = options.serializer ?? new RPCJsonSerializer()
    this.getStubByName = getStubByName ?? ((namespace, event) => namespace.getByName(event))
  }

  async publish<K extends keyof T & string>(event: K, payload: T[K]): Promise<void> {
    const stub = this.getStubByName(this.namespace, this.prefix + event)

    const [data, meta] = unwrapEvent(payload)
    const { json, meta: jsonMeta } = this.serializer.serialize(data)

    const response = await stub.fetch('http://localhost/publish', {
      method: 'POST',
      body: stringifyJSON({
        data: { json, meta: jsonMeta },
        meta,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    if (!response.ok) {
      const reason = await response.text()
      throw new Error(`Failed to publish event: ${response.status} ${reason || response.statusText}`, {
        cause: response,
      })
    }
  }

  protected async subscribeListener<K extends keyof T & string>(event: K, listener: (payload: T[K]) => void, options?: PublisherSubscribeListenerOptions): Promise<() => Promise<void>> {
    const stub = this.getStubByName(this.namespace, this.prefix + event)

    const headers = new Headers({ upgrade: 'websocket' })
    if (options?.lastEventId !== undefined) {
      headers.set('last-event-id', options.lastEventId)
    }
    const response = await stub.fetch('http://localhost/subscribe', {
      headers,
    })

    const websocket = response.webSocket

    if (!websocket) {
      throw new Error('Failed to open subscription websocket to publisher durable object', {
        cause: response,
      })
    }

    // The Durable Object sends missed events first and their count in this header,
    // so wait for them all to reach the listener before this resolves
    const replayedEvents = Number(response.headers.get('orpc-replayed-events'))
    let pendingReplayedEvents = Number.isInteger(replayedEvents) && replayedEvents > 0 ? replayedEvents : 0
    const replayed = promiseWithResolvers<void>()

    if (pendingReplayedEvents === 0) {
      replayed.resolve()
    }

    const reportError = (error: Error) => {
      if (pendingReplayedEvents > 0) {
        replayed.reject(error) // no-op once the subscription already rejected
      }
      else {
        options?.onError?.(error)
      }
    }

    websocket.addEventListener('message', (event) => {
      try {
        const serialized = JSON.parse(event.data)
        let payload = this.serializer.deserialize(serialized.data)
        if (isTypescriptObject(payload) && serialized.meta) {
          payload = withEventMeta(payload, serialized.meta)
        }

        listener(payload as T[K])
      }
      catch (error) {
        options?.onError?.(
          new Error('Failed to deserialize message from publisher durable object', {
            cause: error,
          }),
        )
      }

      if (pendingReplayedEvents > 0 && --pendingReplayedEvents === 0) {
        replayed.resolve() // no-op if the replay already failed
      }
    })

    websocket.addEventListener('close', (event) => {
      if (pendingReplayedEvents > 0 || (event.code !== 1000 && event.code !== 1001)) {
        reportError(
          new Error(`WebSocket closed unexpectedly: ${event.code} ${event.reason}`, {
            cause: event,
          }),
        )
      }
    })

    websocket.addEventListener('error', (event) => {
      reportError(
        new Error(`Subscription websocket error`, {
          cause: event,
        }),
      )
    })

    websocket.accept()

    await replayed.promise.catch((error) => {
      websocket.close()
      throw error
    })

    return async () => {
      websocket.close()
    }
  }
}
