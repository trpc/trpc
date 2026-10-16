import type { APIGatewayProxyEventV2, AwsLambdaGlobal, HttpResponseStream } from '@standard-server/aws-lambda'
import type { StandardHandlerPlugin } from '../standard'
import { Buffer } from 'node:buffer'
import { Writable } from 'node:stream'
import { os } from '../../builder'
import { RPCHandler } from './rpc-handler'

class TestResponseStream extends Writable implements HttpResponseStream {
  chunks: Buffer[] = []
  metadata: { statusCode: number, headers: Record<string, string>, cookies: string[] } | undefined

  get text(): string {
    return Buffer.concat(this.chunks).toString()
  }

  setContentType(): void {
    // noop
  }

  override _write(chunk: any, _encoding: BufferEncoding, callback: () => void): void {
    this.chunks.push(Buffer.from(chunk))
    callback()
  }
}

function createEvent(override: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    rawPath: '/ping',
    rawQueryString: '',
    headers: {
      'host': 'example.com',
      'content-type': 'application/json',
    },
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ json: null }),
    isBase64Encoded: false,
    ...override,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  vi.stubGlobal('awslambda', {
    streamifyResponse: handler => handler,
    HttpResponseStream: {
      from(responseStream, metadata) {
        (responseStream as TestResponseStream).metadata = metadata
        return responseStream
      },
    },
  } satisfies AwsLambdaGlobal)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rpcHandler', () => {
  it('accepts context and prefix options in handle method', async () => {
    const handler = new RPCHandler({
      ping: os
        .$context<{ userId: string }>()
        .handler(({ context }) => context.userId),
    })

    const responseStream = new TestResponseStream()
    const result = await handler.handle(createEvent({ rawPath: '/api/v1/ping' }), responseStream, {
      context: { userId: 'u_123' },
      prefix: '/api/v1',
    })

    expect(result.matched).toBe(true)
    expect(responseStream.metadata?.statusCode).toBe(200)
    expect(responseStream.text).toContain('u_123')

    const mismatchStream = new TestResponseStream()
    const mismatchResult = await handler.handle(createEvent({ rawPath: '/invalid/ping' }), mismatchStream, {
      context: { userId: 'u_123' },
      prefix: '/api/v1',
    })

    expect(mismatchResult.matched).toBe(false)
    expect(mismatchStream.metadata).toBeUndefined()
    expect(mismatchStream.text).toBe('')
  })

  it('supports standard handler plugins', async () => {
    const plugin: StandardHandlerPlugin<any> = {
      name: 'test',
      init(options) {
        return {
          ...options,
          routingInterceptors: [
            async () => ({ matched: true, response: { status: 200, headers: {}, body: 'intercepted' } }),
          ],
        }
      },
    }

    const handler = new RPCHandler({}, { plugins: [plugin] })

    const responseStream = new TestResponseStream()
    const result = await handler.handle(createEvent({ requestContext: { http: { method: 'GET' } }, body: undefined }), responseStream)

    expect(result.matched).toBe(true)
    expect(responseStream.text).toBe('"intercepted"')
  })

  it('treats GET requests as unmatched by default', async () => {
    const handler = new RPCHandler({
      ping: os.handler(() => 'pong'),
    })

    const responseStream = new TestResponseStream()
    const result = await handler.handle(createEvent({
      requestContext: { http: { method: 'GET' } },
      rawQueryString: `data=${encodeURIComponent(JSON.stringify({ json: null }))}`,
      body: undefined,
    }), responseStream)

    expect(result.matched).toBe(false)
  })

  it('allows GET requests when allowMethods includes GET', async () => {
    const handler = new RPCHandler(
      {
        ping: os.handler(() => 'pong'),
      },
      {
        allowMethods: ['GET'],
      },
    )

    const responseStream = new TestResponseStream()
    const result = await handler.handle(createEvent({
      requestContext: { http: { method: 'GET' } },
      rawQueryString: `data=${encodeURIComponent(JSON.stringify({ json: null }))}`,
      body: undefined,
    }), responseStream)

    expect(result.matched).toBe(true)
    expect(responseStream.metadata?.statusCode).toBe(200)
    expect(responseStream.text).toContain('pong')
  })
})
