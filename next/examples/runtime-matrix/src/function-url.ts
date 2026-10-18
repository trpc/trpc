/**
 * A local stand-in for a Lambda function URL: each HTTP request becomes a
 * payload 2.0 event for `lambda.ts`, and the result goes back the way a
 * function URL sends it. With `streaming`, it reads the streaming handler's
 * prelude (status and headers, then eight null bytes) and forwards the body
 * as it's written, as `InvokeMode: RESPONSE_STREAM` does.
 * `PORT=3000 node src/function-url.ts [buffered|streaming]`.
 */
import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type {
  LambdaContext,
  LambdaResponseStream,
  LambdaV2Event,
  LambdaV2Result,
} from '@trpc12/trpc/aws-lambda';
import { main, streaming } from './lambda.ts';

const mode = process.argv[2] === 'streaming' ? 'streaming' : 'buffered';

async function toEvent(req: IncomingMessage): Promise<LambdaV2Event> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (name !== 'cookie' && value !== undefined) {
      headers[name] = Array.isArray(value) ? value.join(',') : value;
    }
  }
  return {
    version: '2.0',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    cookies: req.headers.cookie?.split('; '),
    // Function URLs base64-encode bodies they don't know to be text.
    body: body.length > 0 ? body.toString('base64') : undefined,
    isBase64Encoded: body.length > 0,
    requestContext: {
      http: { method: req.method ?? 'GET' },
      domainName: req.headers.host,
    },
  };
}

function context(): LambdaContext {
  const deadline = Date.now() + 30_000;
  return {
    awsRequestId: randomUUID(),
    getRemainingTimeInMillis: () => deadline - Date.now(),
  };
}

interface Prelude {
  statusCode: number;
  headers: Record<string, string>;
  cookies: string[];
}

function responseStream(res: ServerResponse): LambdaResponseStream {
  const separator = Buffer.alloc(8);
  let prelude: Buffer | undefined = Buffer.alloc(0);
  return {
    write(chunk) {
      if (prelude === undefined) return res.write(chunk);
      prelude = Buffer.concat([prelude, chunk]);
      const end = prelude.indexOf(separator);
      if (end === -1) return true;
      const meta = JSON.parse(prelude.subarray(0, end).toString()) as Prelude;
      const rest = prelude.subarray(end + separator.length);
      prelude = undefined;
      res.writeHead(meta.statusCode, {
        ...meta.headers,
        'set-cookie': meta.cookies,
      });
      res.flushHeaders();
      return rest.length > 0 ? res.write(rest) : true;
    },
    end: () => res.end(),
    once: (event, listener) => res.once(event, listener),
  };
}

const server = createServer((req, res) => {
  void (async () => {
    const event = await toEvent(req);
    if (mode === 'streaming') {
      return streaming(event, responseStream(res), context());
    }
    const result = (await main(event, context())) as LambdaV2Result;
    res.writeHead(result.statusCode, {
      ...result.headers,
      'set-cookie': result.cookies,
    });
    res.end(
      result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body,
    );
  })();
});

server.listen(Number(process.env['PORT'] ?? 3000), '127.0.0.1', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  console.log(`listening on http://127.0.0.1:${port}/trpc (${mode})`);
});
process.on('SIGTERM', () => server.close());
