import {
  experimental_createOpenApiHandler,
  experimental_generateOpenApi,
  experimental_openapi,
  type OpenApiDocument,
  type OpenApiInfo,
  type OpenApiOperation,
} from '@trpc12/trpc/openapi';
import {
  createFetchHandler,
  experimental_byteStream,
  initTrpc,
  type experimental_ByteStream,
} from '@trpc12/trpc/server';
import { Effect, Schema, Stream } from 'effect';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

// A document is only right if a client that knows nothing but the document
// can call the server with it. Each test below builds every request from the
// generated document alone (a sample of each parameter's and body's schema,
// encoded by OpenAPI's serialization rules) and calls the real handler. Every
// procedure echoes its input (a byte stream as its text), so the response
// must be a sample of the documented success response.

const t = initTrpc().concat(experimental_openapi());

const echo = <S extends z.ZodType>(schema: S) =>
  t.procedure.input(schema).output(schema);

const text = (bytes: experimental_ByteStream) =>
  bytes.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => '',
      (all, part) => all + part,
    ),
  );

const Flat = z.object({
  text: z.string(),
  count: z.number().int(),
  ratio: z.number(),
  flag: z.boolean(),
  tags: z.array(z.string()),
  note: z.string().optional(),
});
const Filter = z.object({
  filter: z.object({ name: z.string(), min: z.number() }),
});
const Deep = z.object({
  items: z.array(z.object({ id: z.string(), at: z.array(z.number()) })),
  parent: z.object({ child: z.object({ name: z.string().nullable() }) }),
});

const router = t.router({
  query: {
    none: t.procedure.output(z.literal('ok')).query(() => 'ok' as const),
    flat: echo(Flat).query((opts) => opts.input),
    filter: echo(Filter).query((opts) => opts.input),
    deep: echo(Deep).query((opts) => opts.input),
    scalar: echo(z.string()).query((opts) => opts.input),
    byId: echo(z.object({ id: z.string(), expand: z.boolean() }))
      .meta({ route: { method: 'GET', path: '/items/{id}' } })
      .query((opts) => opts.input),
  },
  mutation: {
    none: t.procedure.output(z.literal('ok')).mutation(() => 'ok' as const),
    create: echo(Flat.extend(Deep.shape)).mutation((opts) => opts.input),
    scalar: echo(z.number()).mutation((opts) => opts.input),
    update: echo(z.object({ id: z.string(), title: z.string() }))
      .meta({ route: { method: 'PATCH', path: '/items/{id}' } })
      .mutation((opts) => opts.input),
  },
  subscription: {
    echo: echo(z.object({ room: z.string() })).subscription(
      async function* (opts) {
        yield opts.input;
      },
    ),
  },
  stream: {
    upload: t.procedure
      .input(experimental_byteStream())
      .output(z.string())
      .mutation((opts) => text(opts.input)),
    put: t.procedure
      .meta({
        route: {
          method: 'PUT',
          path: '/uploads/{name}',
          inputStructure: 'detailed',
        },
      })
      .input(
        Schema.Struct({
          params: Schema.Struct({ name: Schema.String }),
          body: experimental_byteStream(),
        }),
      )
      .output(z.object({ name: z.string(), body: z.string() }))
      .mutation((opts) =>
        Effect.map(text(opts.input.body), (body) => ({
          name: opts.input.params.name,
          body,
        })),
      ),
  },
});

type Schema = Record<string, unknown>;

const STRING = 'a b&c=d+é?%#';

/**
 * One valid value of a JSON Schema, the same every time. Optional
 * properties are filled too, so a value sent as several parameters comes
 * back whole.
 */
function sample(schema: unknown, doc: OpenApiDocument): unknown {
  if (typeof schema !== 'object' || schema === null) return null;
  const s = schema as Schema;
  if (typeof s['$ref'] === 'string') {
    const name = s['$ref'].slice('#/components/schemas/'.length);
    return sample(doc.components.schemas[name], doc);
  }
  if ('const' in s) return s['const'];
  if (Array.isArray(s['enum'])) return s['enum'][0];
  const options = (s['anyOf'] ?? s['oneOf']) as Schema[] | undefined;
  if (options) {
    return sample(options.find((o) => o['type'] !== 'null') ?? options[0], doc);
  }
  if (Array.isArray(s['allOf'])) {
    return Object.assign(
      {},
      ...(s['allOf'] as Schema[]).map((part) => sample(part, doc)),
    );
  }
  const type = Array.isArray(s['type'])
    ? (s['type'] as string[]).find((t) => t !== 'null')
    : s['type'];
  switch (type) {
    case 'string':
      return STRING;
    case 'integer':
      return 3;
    case 'number':
      return 2.5;
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'array':
      return [sample(s['items'], doc), sample(s['items'], doc)];
    default: {
      const properties = (s['properties'] ?? {}) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          sample(value, doc),
        ]),
      );
    }
  }
}

interface Parameter extends Record<string, unknown> {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  schema?: unknown;
  content?: Record<string, { schema: unknown }>;
  style?: string;
  explode?: boolean;
}

/** A parameter's value by OpenAPI's rules: `content` is serialized by its media type, `schema` by `style`. */
function addQuery(params: URLSearchParams, p: Parameter, value: unknown) {
  if (p.content) {
    const [type] = Object.keys(p.content);
    expect(type).toBe('application/json');
    params.append(p.name, JSON.stringify(value));
    return;
  }
  const scalar = (v: unknown) => {
    // OpenAPI leaves nested values in a query parameter undefined.
    expect(typeof v).not.toBe('object');
    return String(v);
  };
  if (Array.isArray(value)) {
    expect(p.explode ?? true).toBe(true);
    for (const v of value) params.append(p.name, scalar(v));
  } else if (typeof value === 'object' && value !== null) {
    expect(p.style).toBe('deepObject');
    for (const [k, v] of Object.entries(value)) {
      params.append(`${p.name}[${k}]`, scalar(v));
    }
  } else {
    params.append(p.name, scalar(value));
  }
}

function toRequest(
  doc: OpenApiDocument,
  path: string,
  method: string,
  op: OpenApiOperation,
): Request {
  let pathname = path;
  const query = new URLSearchParams();
  const headers = new Headers();
  for (const p of (op.parameters ?? []) as ReadonlyArray<Parameter>) {
    const schema = p.content ? Object.values(p.content)[0]!.schema : p.schema;
    const value = sample(schema, doc);
    if (p.in === 'path') {
      pathname = pathname.replace(
        `{${p.name}}`,
        encodeURIComponent(String(value)),
      );
    } else if (p.in === 'header') {
      headers.set(p.name, String(value));
    } else if (p.in === 'query') {
      addQuery(query, p, value);
    } else {
      expect.unreachable(`a ${p.in} parameter`);
    }
  }
  let body: BodyInit | undefined;
  if (op.requestBody) {
    const content = op.requestBody['content'] as Record<
      string,
      { schema: unknown }
    >;
    const [type, media] = Object.entries(content)[0]!;
    headers.set('content-type', type);
    const value = sample(media.schema, doc);
    if (type === 'application/octet-stream') {
      expect(media.schema).toEqual({ type: 'string', format: 'binary' });
      body = new TextEncoder().encode(String(value));
    } else {
      expect(type).toBe('application/json');
      body = JSON.stringify(value);
    }
  }
  const search = query.size > 0 ? `?${query}` : '';
  return new Request(`http://localhost${pathname}${search}`, {
    method: method.toUpperCase(),
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

/** The documented success response: its status, media type and a sample of its schema. */
function expected(doc: OpenApiDocument, op: OpenApiOperation) {
  const [status, response] = Object.entries(op.responses).find(([code]) =>
    code.startsWith('2'),
  )!;
  const content = response['content'] as Record<string, { schema: unknown }>;
  const [type, media] = Object.entries(content)[0]!;
  return {
    status: Number(status),
    type,
    body: sample(media.schema, doc),
  };
}

/** The data of the first `message` event of a `text/event-stream` body (an event without `event:` is one). */
const firstEvent = (text: string): unknown => {
  const event = text
    .split('\n\n')
    .find(
      (block) =>
        /^data:/m.test(block) &&
        (/^event: message$/m.test(block) || !/^event:/m.test(block)),
    );
  const data = /^data: (.*)$/m.exec(event ?? '')?.[1];
  return data === undefined ? undefined : JSON.parse(data);
};

const operations = (doc: OpenApiDocument) =>
  Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({
      name: `${method.toUpperCase()} ${path}`,
      path,
      method,
      op,
    })),
  );

const procedurePaths = Object.entries(router).flatMap(([group, procedures]) =>
  Object.keys(procedures).map((name) => `${group}.${name}`),
);

// REST maps an input onto path, query and body parameters, which OpenAPI
// can't describe for a scalar or deeply nested query input.
const inRestDoc = (path: string) =>
  !['query.deep', 'query.scalar'].includes(path);
// RPC sends a byte stream only as the whole input.
const inRpcDoc = (path: string) => path !== 'stream.put';

const info: OpenApiInfo = { title: 'Contract', version: '1.0.0' };
const rpcDoc = experimental_generateOpenApi(router, { info, target: 'rpc' });
const restDoc = experimental_generateOpenApi(router, {
  info,
  filter: (opts) => inRestDoc(opts.path),
});

test('the contract documents describe every procedure', () => {
  const ids = (doc: OpenApiDocument) =>
    operations(doc)
      .map((o) => o.op.operationId)
      .sort();
  expect(ids(rpcDoc)).toEqual(procedurePaths.filter(inRpcDoc).sort());
  expect(ids(restDoc)).toEqual(procedurePaths.filter(inRestDoc).sort());
});

async function call(
  handler: { fetch: (request: Request) => Promise<Response> },
  doc: OpenApiDocument,
  operation: ReturnType<typeof operations>[number],
) {
  const res = await handler.fetch(
    toRequest(doc, operation.path, operation.method, operation.op),
  );
  const want = expected(doc, operation.op);
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  expect({
    status: res.status,
    type,
    body: type.startsWith('text/event-stream')
      ? firstEvent(text)
      : JSON.parse(text),
  }).toEqual({
    status: want.status,
    type: expect.stringContaining(want.type),
    body: want.body,
  });
}

test.for(operations(rpcDoc))(
  "target: 'rpc': $name answers what the document says to a request built from it",
  async (operation) => {
    await using handler = createFetchHandler({ router });
    await call(handler, rpcDoc, operation);
  },
);

test.for(operations(restDoc))(
  "target: 'openapi': $name answers what the document says to a request built from it",
  async (operation) => {
    await using handler = experimental_createOpenApiHandler({ router });
    await call(handler, restDoc, operation);
  },
);
