// Size proxy only: the smallest Promise client shape (proxy, link chain, HTTP
// terminal, typed error). Not an API proposal.

export interface Op {
  readonly path: string;
  readonly type: 'query' | 'mutation';
  readonly input: unknown;
  readonly signal?: AbortSignal | undefined;
}

export class TrpcClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
  }
}

export type Next = (op: Op) => Promise<unknown>;
export type Link = (op: Op, next: Next) => Promise<unknown>;

export interface Codec {
  readonly stringify: (value: unknown) => string;
  readonly parse: (text: string) => unknown;
}

const jsonCodec: Codec = { stringify: JSON.stringify, parse: JSON.parse };

export function httpTerminal(url: string, codec: Codec = jsonCodec): Next {
  return async (op) => {
    const target = `${url}/${op.path}`;
    let res: Response;
    try {
      res =
        op.type === 'query'
          ? await fetch(
              `${target}?input=${encodeURIComponent(codec.stringify(op.input))}`,
              { signal: op.signal },
            )
          : await fetch(target, {
              method: 'POST',
              body: codec.stringify(op.input),
              headers: { 'content-type': 'application/json' },
              signal: op.signal,
            });
    } catch (cause) {
      throw new TrpcClientError('NETWORK', 'fetch failed', cause);
    }
    const body = codec.parse(await res.text()) as
      | { result: { data: unknown } }
      | { error: { code: string; message: string } };
    if ('error' in body) {
      throw new TrpcClientError(body.error.code, body.error.message);
    }
    return body.result.data;
  };
}

export function retryLink(times: number): Link {
  return async (op, next) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await next(op);
      } catch (err) {
        if (
          attempt >= times ||
          !(err instanceof TrpcClientError) ||
          err.code !== 'NETWORK'
        ) {
          throw err;
        }
      }
    }
  };
}

function chain(links: readonly Link[], terminal: Next): Next {
  return links.reduceRight<Next>(
    (next, link) => (op) => link(op, next),
    terminal,
  );
}

export function createClient(opts: {
  links?: readonly Link[];
  terminal: Next;
}): unknown {
  const run = chain(opts.links ?? [], opts.terminal);
  const proxy = (path: readonly string[]): unknown =>
    new Proxy(() => {}, {
      get: (_t, key) =>
        typeof key === 'string' ? proxy([...path, key]) : undefined,
      apply: (_t, _this, args: unknown[]) => {
        const method = path.at(-1);
        const input = args[0];
        const signal = (args[1] as { signal?: AbortSignal } | undefined)
          ?.signal;
        return run({
          path: path.slice(0, -1).join('.'),
          type: method === 'mutate' ? 'mutation' : 'query',
          input,
          signal,
        });
      },
    });
  return proxy([]);
}
