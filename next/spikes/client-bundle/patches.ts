// The cuts `cuts.ts` measures: each patches the shipped sources as rolldown
// loads them (exact string replacements, so a cut that no longer applies
// fails), standing in for the feature moving behind its own import.
import { readFileSync } from 'node:fs';
import type { Plugin } from 'rolldown';

type Patch = readonly [file: string, from: string, to: string];

export const cuts: Record<
  string,
  { readonly what: string; readonly patches: readonly Patch[] }
> = {
  'danson-sync': {
    what: "danSON's stream methods out of createSerializer() (a sync danSON for the Promise httpLink)",
    patches: [
      [
        'serializer/index.ts',
        `    serializeDeferred: (value, o) =>
      serializeDeferred(value, { serializers, coerceError: o?.coerceError }),
    deserializeStream: (frames, o) =>
      deserializeStream(frames, { ...output, ...o }),`,
        '    serializeDeferred: undefined as never,\n    deserializeStream: undefined as never,',
      ],
    ],
  },
  sse: {
    what: 'SSE subscriptions out of httpLink (an opt-in sseLink / subscriptions module)',
    patches: [
      [
        'client/links/http/link.ts',
        'const subscription = makeSubscriptions(transport, opts);',
        'const subscription = (op: Operation): any => Stream.die(op);',
      ],
    ],
  },
  batch: {
    what: 'batching (the data loader) out of httpLink (an opt-in batch link or module)',
    patches: [
      [
        'client/links/http/link.ts',
        `const batched = makeBatcher<Operation>({
    // Calls without an \`initKey\` are unbatchable, so they never get here.
    key: transport.batchKey,
    maxItems,
    send: transport.sendBatch,
  });`,
        'const batched = (op: Operation): any => transport.single(op);',
      ],
      [
        'client/links/http/transport.ts',
        '    sendBatch,\n    readError,',
        '    sendBatch: undefined as never,\n    readError,',
      ],
    ],
  },
  frames: {
    what: 'binary frames (`binary: true`) out of the default link',
    patches: [
      [
        'client/links/http/transport.ts',
        '? decodeRecords(bytes)',
        '? (bytes as never)',
      ],
    ],
  },
  streamed: {
    what: 'streamed outputs (JSONL, resume) on single calls out of the default link',
    patches: [
      [
        'client/links/http/transport.ts',
        'if (streamed(reply)) {\n      const frames',
        'if (false as boolean) {\n      const frames',
      ],
    ],
  },
  json: {
    what: 'jsonSerializer without deferred values (serializeDeferred / deserializeStream)',
    patches: [
      [
        'serializer/framed.ts',
        `export const jsonSerializer: Serializer<JsonForm> = framedSerializer(
  'json',
  'none',
  {
    serialize: (value) => {
      const text = JSON.stringify(value);
      return text === undefined ? undefined : JSON.parse(text);
    },
    deserialize: (value) => value,
  },
);`,
        `export const jsonSerializer: Serializer<JsonForm> = {
  name: 'json',
  kind: 'none',
  serialize: (value) => {
    const text = JSON.stringify(value);
    return text === undefined ? {} : { json: JSON.parse(text) };
  },
  deserialize: (value) => value.json as never,
  serializeDeferred: () => { throw new DansonError('deferred'); },
  deserializeStream: () => Effect.die(new DansonError('deferred')),
};`,
      ],
    ],
  },
  iterable: {
    what: 'subscribe() without Stream.toAsyncIterable (a hand-rolled iterator over runForEach)',
    patches: [
      [
        'internal/effects.ts',
        `  if (!signal) return Stream.toAsyncIterable(stream);
  return {`,
        `  return {
    [Symbol.asyncIterator]() {
      const buffer: A[] = [];
      let end: { error?: unknown } | undefined;
      let wake: (() => void) | undefined;
      const fiber = Effect.runFork(
        Stream.runForEach(stream, (a) => Effect.sync(() => { buffer.push(a); wake?.(); })).pipe(
          Effect.catchCause((cause) => Effect.sync(() => { end = { error: cause }; })),
          Effect.ensuring(Effect.sync(() => { end ??= {}; wake?.(); })),
        ),
      );
      const onAbort = () => void Effect.runFork(Fiber.interrupt(fiber));
      signal?.addEventListener('abort', onAbort, { once: true });
      return {
        async next(): Promise<IteratorResult<A>> {
          while (buffer.length === 0 && !end) await new Promise<void>((r) => (wake = r));
          if (buffer.length > 0) return { done: false, value: buffer.shift()! };
          if (end?.error) throw end.error;
          return { done: true, value: undefined };
        },
        async return(): Promise<IteratorResult<A>> {
          await Effect.runPromise(Fiber.interrupt(fiber));
          return { done: true, value: undefined };
        },
      };
    },
  };
  return {`,
      ],
      [
        'internal/effects.ts',
        "import { Effect, Stream } from 'effect';",
        "import { Effect, Fiber, Stream } from 'effect';",
      ],
    ],
  },
  fetch: {
    what: 'raw fetch instead of effect/http HttpClient in the transport',
    patches: [
      [
        'client/links/http/transport.ts',
        `import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  Url,
  type HttpClientResponse,
  type HttpMethod,
} from 'effect/http';`,
        `const HttpClientError = { isHttpClientError: (_: unknown): _ is any => false };
const Url = { UrlError: class {} };
const HttpBody = {
  formData: (form: FormData): any => ({ body: form }),
  raw: (body: string, opts: { contentType: string }): any => ({ body, type: opts.contentType }),
};
const HttpClientRequest = {
  make: (method: string) => (url: string, o: { headers: Headers }): any => ({ method, url, headers: o.headers }),
  setBody: (request: any, body: { body: BodyInit; type?: string }): any => {
    if (body.type) request.headers.set('content-type', body.type);
    return { ...request, body: body.body };
  },
};
const toResponse = (web: Response): any => ({
  status: web.status,
  headers: { 'content-type': web.headers.get('content-type') ?? undefined },
  text: Effect.tryPromise({ try: () => web.text(), catch: (cause) => cause }),
  stream: Stream.fromReadableStream({ evaluate: () => web.body!, onError: (cause) => cause }),
});`,
      ],
      [
        'client/links/http/transport.ts',
        `  const client = HttpClient.withScope(
    Effect.runSync(
      Effect.provide(
        Effect.service(HttpClient.HttpClient),
        FetchHttpClient.layer,
      ),
    ),
  );`,
        '',
      ],
      [
        'client/links/http/transport.ts',
        `      return client.execute(prepared.request).pipe(
        Effect.map((response): Reply => ({ response, web: web! })),
        Effect.provideService(
          FetchHttpClient.Fetch,
          fetch as typeof globalThis.fetch,
        ),
        Effect.provideService(FetchHttpClient.RequestInit, prepared.init),
        // Calls carry their own span's trace headers (\`op.trace\`).
        Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
        Effect.mapError(toHttpError),
      );`,
        `      const request = prepared.request as any;
      return Effect.flatMap(Effect.scope, (scope) => {
        const controller = new AbortController();
        return Scope.addFinalizer(scope, Effect.sync(() => controller.abort())).pipe(
          Effect.andThen(
            Effect.tryPromise({
              try: () =>
                fetch(new URL(request.url, globalThis.location?.href), {
                  ...prepared.init,
                  method: request.method,
                  headers: request.headers,
                  body: request.body,
                  signal: controller.signal,
                }),
              catch: toHttpError,
            }),
          ),
          Effect.map((res): Reply => ({ response: toResponse(res), web: web ?? res })),
        );
      });`,
      ],
    ],
  },
};

export const patching = (names: readonly string[]): Plugin => {
  const byFile = new Map<string, Patch[]>();
  for (const name of names) {
    for (const patch of cuts[name]!.patches)
      byFile.set(patch[0], [...(byFile.get(patch[0]) ?? []), patch]);
  }
  return {
    name: 'cuts',
    load(id) {
      const rel = /packages\/trpc\/src\/(.*)$/.exec(id)?.[1];
      const patches = rel ? byFile.get(rel) : undefined;
      if (!patches) return undefined;
      let code = readFileSync(id, 'utf8');
      for (const [file, from, to] of patches) {
        if (!code.includes(from))
          throw new Error(
            `cut no longer applies to ${file}: ${from.slice(0, 60)}`,
          );
        code = code.replace(from, to);
      }
      return { code, moduleType: 'ts' };
    },
  };
};
