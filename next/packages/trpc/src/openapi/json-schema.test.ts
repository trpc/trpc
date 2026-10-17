import {
  createOpenApiHandler,
  generateOpenApi,
  openapi,
} from '@trpc12/trpc/openapi';
import {
  initTrpc,
  type AnyRouter,
  type StandardSchemaV1,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

const t = initTrpc().concat(openapi());

// A schema library that only speaks JSON Schema: it accepts anything and
// describes it with whatever JSON Schema it was given.
const described = (schema: Record<string, unknown>) => ({
  '~standard': {
    version: 1 as const,
    vendor: 'json-schema-only',
    validate: (value: unknown) => ({ value }),
    jsonSchema: { input: () => schema, output: () => schema },
  },
});
// A Standard Schema without a JSON Schema at all.
const opaque: StandardSchemaV1 = {
  '~standard': {
    version: 1 as const,
    vendor: 'opaque',
    validate: (value: unknown) => ({ value }),
  },
};

const router = {
  coerce: t.procedure
    .meta({ route: { method: 'GET', path: '/coerce' } })
    .input(
      described({
        $defs: { Count: { type: 'integer' } },
        definitions: { Flag: { type: 'boolean' } },
        type: 'object',
        properties: {
          count: { $ref: '#/$defs/Count' },
          flag: { $ref: '#/definitions/Flag' },
          missing: { $ref: '#/$defs/Missing' },
          remote: { $ref: 'https://example.com/schema.json' },
          untypedObject: {
            anyOf: [
              { type: 'null' },
              { properties: { n: { type: 'number' } } },
            ],
          },
          untypedArray: {
            anyOf: [{ type: 'null' }, { items: { type: 'number' } }],
          },
          wrapped: { items: { type: 'number' } },
          anything: { anyOf: [{ type: 'number' }, {}] },
          legacy: { anyOf: [{ type: 'number' }, { type: 'file' }] },
          unmatched: { oneOf: [true, { type: 'integer' }] },
        },
      }),
    )
    .query((opts) => opts.input),
  parts: t.procedure
    .meta({
      route: { method: 'GET', path: '/parts', inputStructure: 'detailed' },
    })
    .input(
      described({
        allOf: [
          {
            type: 'object',
            properties: {
              query: {
                type: 'object',
                properties: { page: { type: 'number' } },
              },
            },
          },
          {
            type: 'object',
            properties: {
              headers: {
                type: 'object',
                properties: { 'x-id': { type: 'string' } },
              },
            },
          },
        ],
      }),
    )
    .query((opts) => opts.input),
  anyBody: t.procedure
    .meta({ route: { method: 'POST', path: '/any/{id}' } })
    .input(
      described({
        anyOf: [
          { type: 'object', properties: { id: { type: 'string' } } },
          { type: 'null' },
        ],
      }),
    )
    .mutation((opts) => opts.input),
  optionalBody: t.procedure
    .meta({ route: { method: 'POST', path: '/optional/{id}' } })
    .input(
      described({
        type: 'object',
        properties: { id: { type: 'string' }, note: { type: 'string' } },
      }),
    )
    .mutation((opts) => opts.input),
  merged: t.procedure
    .meta({ route: { method: 'GET', path: '/merged' } })
    .input(
      described({
        allOf: [
          { type: 'object', properties: { a: { type: 'number' } } },
          { required: ['a'] },
        ],
      }),
    )
    .query((opts) => opts.input),
  errors: t.procedure
    .meta({
      route: {
        method: 'GET',
        path: '/errors',
        description: 'Fails in every documented way',
        deprecated: true,
      },
    })
    .errors({
      CONFLICT: {},
      ALREADY_EXISTS: { status: 409 },
      ODD: {},
      OPAQUE: { data: opaque },
    })
    .query((opts) => opts.errors.ODD()),
  hidden: t.procedure
    .meta({ route: { method: 'GET', path: '/hidden' } })
    .query(() => 'shh'),
} satisfies AnyRouter;

const handler = createOpenApiHandler({ router });
const api = (path: string, init?: RequestInit) =>
  handler.fetch(new Request(`http://localhost/api${path}`, init));

test('query strings are coerced by any JSON Schema, refs and untyped schemas included', async () => {
  const query = [
    'count=3',
    'flag=true',
    'missing=4',
    'remote=5',
    'untypedObject[n]=6',
    'untypedArray[]=7',
    'wrapped=8',
    'anything=x',
    'legacy=y',
    'unmatched=z',
  ].join('&');
  const res = await api(`/coerce?${query}`);
  expect(await res.json()).toEqual({
    count: 3,
    flag: true,
    // Refs that don't resolve leave the value as sent.
    missing: '4',
    remote: '5',
    untypedObject: { n: 6 },
    untypedArray: [7],
    wrapped: [8],
    anything: 'x',
    legacy: 'y',
    unmatched: 'z',
  });
});

test('detailed parts are found through allOf, and missing parts pass through', async () => {
  const res = await api('/parts?page=2', { headers: { 'x-id': 'ada' } });
  expect(await res.json()).toMatchObject({
    query: { page: 2 },
    headers: { 'x-id': 'ada' },
  });
});

test('generateOpenApi documents bodies, errors and filters any JSON Schema can describe', async () => {
  const doc = generateOpenApi(router, {
    info: { title: 'JSON Schema', version: '1.0.0' },
    filter: (opts) => opts.path !== 'hidden',
  });
  expect(doc.paths).not.toHaveProperty('/api/hidden');

  const body = (path: string) =>
    (
      doc.paths[path]!['post']!['requestBody'] as {
        required: boolean;
        content: Record<string, { schema: unknown }>;
      }
    ).content['application/json']!.schema;
  // A body without properties is documented whole.
  expect(body('/api/any/{id}')).toEqual({
    anyOf: [
      { type: 'object', properties: { id: { type: 'string' } } },
      { type: 'null' },
    ],
  });
  // Without `required`, the body stays without it once the params are out.
  expect(body('/api/optional/{id}')).toEqual({
    type: 'object',
    properties: { note: { type: 'string' } },
  });
  expect(
    (
      doc.paths['/api/optional/{id}']!['post']!['requestBody'] as {
        required: boolean;
      }
    ).required,
  ).toBe(false);

  expect(doc.paths['/api/merged']!['get']!['parameters']).toEqual([
    {
      name: 'a',
      in: 'query',
      required: false,
      schema: { type: 'number' },
    },
  ]);

  const errors = doc.paths['/api/errors']!['get']!;
  expect(errors['description']).toBe('Fails in every documented way');
  expect(errors['deprecated']).toBe(true);
  const responses = errors['responses'] as Record<
    string,
    { description: string; content: Record<string, { schema: any }> }
  >;
  // Codes sharing a status are alternatives; unknown codes are 400.
  expect(responses['409']!.description).toBe('CONFLICT | ALREADY_EXISTS');
  expect(
    responses['409']!.content['application/json']!.schema.anyOf,
  ).toHaveLength(2);
  expect(responses['400']!.description).toBe('ODD | OPAQUE');
  // Data without a JSON Schema is documented as anything.
  expect(
    responses['400']!.content['application/json']!.schema.anyOf[1].properties
      .data,
  ).toEqual({});

  const res = await api('/errors');
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: 'ODD' });
});
