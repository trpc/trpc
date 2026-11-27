// oxlint-disable-next-line no-restricted-imports
import { isAbortError } from '../../unstable-core-do-not-import';
import type { NodeHTTPResponse } from './types';

async function writeResponseBodyChunk(
  res: NodeHTTPResponse,
  chunk: Uint8Array,
) {
  // useful for debugging 🙃
  // console.debug('writing', new TextDecoder().decode(chunk));

  if (res.write(chunk) === false) {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: unknown) => {
        reject(err);
        cleanup();
      };
      const onDrain = () => {
        resolve();
        cleanup();
      };
      const cleanup = () => {
        res.off('error', onError);
        res.off('drain', onDrain);
        res.off('close', onDrain);
      };
      res.once('error', onError);
      res.once('drain', onDrain);
      res.once('close', onDrain);
    });
  }
}
/**
 * @internal
 */

export async function writeResponseBody(opts: {
  res: NodeHTTPResponse;
  signal: AbortSignal;
  body: NonNullable<Response['body']>;
}) {
  const { res } = opts;

  try {
    const writableStream = new WritableStream({
      async write(chunk) {
        await writeResponseBodyChunk(res, chunk);
        res.flush?.();
      },
    });

    await opts.body.pipeTo(writableStream, {
      signal: opts.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      return;
    }
    throw err;
  }
}

/**
 * Joins `Vary` header values without repeating a field. A middleware such as
 * `cors()` sets `Vary: Origin` before tRPC answers; replacing it with tRPC's
 * own `Vary` would let a cache serve one origin's CORS headers to another.
 * @internal
 */
export function mergeVary(
  existing: number | string | string[] | undefined,
  added: string | null,
): string {
  const values = [existing ?? [], added ?? []].flat().join(',');
  const fields = new Map<string, string>();
  for (const field of values.split(',')) {
    const name = field.trim();
    // field names are case-insensitive
    if (name && !fields.has(name.toLowerCase())) {
      fields.set(name.toLowerCase(), name);
    }
  }
  return Array.from(fields.values()).join(', ');
}

/**
 * @internal
 */

export async function writeResponse(opts: {
  request: Request;
  response: Response;
  rawResponse: NodeHTTPResponse;
}) {
  const { response, rawResponse } = opts;

  // Only override status code if it hasn't been explicitly set in a procedure etc
  if (rawResponse.statusCode === 200) {
    rawResponse.statusCode = response.status;
  }
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === 'set-cookie') continue;
    rawResponse.setHeader(
      key,
      key === 'vary' ? mergeVary(rawResponse.getHeader(key), value) : value,
    );
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    // keep the cookies a middleware or procedure already set on `res`
    const existing = rawResponse.getHeader('set-cookie') ?? [];
    rawResponse.setHeader('set-cookie', [existing, cookies].flat().map(String));
  }
  try {
    if (response.body) {
      await writeResponseBody({
        res: rawResponse,
        signal: opts.request.signal,
        body: response.body,
      });
    }
  } catch (err) {
    if (!rawResponse.headersSent) {
      rawResponse.statusCode = 500;
    }
    throw err;
  } finally {
    rawResponse.end();
  }
}
