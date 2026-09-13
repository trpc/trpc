import * as path from 'node:path';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import type { Document, SchemaObject } from '../src/types';
import type {
  LimitedError as DefaultFormatterLimitedError,
  PlainError as DefaultFormatterPlainError,
} from './routers/defaultErrorFormatterRouter-heyapi/types.gen';
import type {
  ChainedDuplicateError,
  ChainedError,
  LimitedError,
  MultiShapeError,
  NeverClaimsError,
  PlainError,
} from './routers/procedureErrorsRouter-heyapi/types.gen';
import {
  isRef,
  requireOperation,
  requireResponseComponentSchema,
  requireSchemaObject,
} from './types';
import { validateOpenApi } from './validateOpenApi';

const routerPath = path.resolve(
  __dirname,
  'routers',
  'procedureErrorsRouter.router.ts',
);
const defaultFormatterRouterPath = path.resolve(
  __dirname,
  'routers',
  'defaultErrorFormatterRouter.router.ts',
);

/** Keys every error `data` carries, whatever the shape */
const BASE_DATA_KEYS = ['code', 'httpStatus', 'path', 'stack'];

let doc: Document;

beforeAll(async () => {
  doc = await generateOpenAPIDocument(routerPath, {
    exportName: 'ProcedureErrorsRouter',
  });
});

function getDefaultResponse(opPath: string, method: 'get' | 'post') {
  const operation = requireOperation(doc, opPath, method);
  const response = operation.responses?.['default'];
  if (!response) {
    throw new Error(`No default response on ${method} ${opPath}`);
  }
  return response;
}

function getErrorSchema(opPath: string, method: 'get' | 'post'): SchemaObject {
  const response = getDefaultResponse(opPath, method);
  if (isRef(response)) {
    throw new Error(`Expected an inline response on ${method} ${opPath}`);
  }
  const schema = response.content?.['application/json']?.schema;
  if (!schema) {
    throw new Error(`No schema on ${method} ${opPath}`);
  }
  const envelope = requireSchemaObject(schema, doc, 'error envelope');
  const error = envelope.properties?.['error'];
  if (!error) {
    throw new Error('Error envelope has no `error` property');
  }
  return requireSchemaObject(error, doc, 'error shape');
}

/** The `oneOf` members of a procedure's error shape */
function getErrorVariants(
  opPath: string,
  method: 'get' | 'post',
): SchemaObject[] {
  const error = getErrorSchema(opPath, method);
  return (error.oneOf ?? [error]).map((variant) =>
    requireSchemaObject(variant, doc, 'error variant'),
  );
}

/** The keys a variant's `data` adds on top of the ones every shape has */
function getExtraDataKeys(variant: SchemaObject): string[] {
  const data = requireSchemaObject(
    variant.properties?.['data'] ?? {},
    doc,
    'error data',
  );
  return Object.keys(data.properties ?? {}).filter(
    (key) => !BASE_DATA_KEYS.includes(key),
  );
}

describe('per-procedure error shapes', () => {
  it('generates a valid document', async () => {
    const problems = await validateOpenApi(JSON.stringify(doc, null, 2));
    expect(problems).toEqual([]);
  });

  it('keeps the shared Error response for procedures without `.errors()`', () => {
    const response = getDefaultResponse('plain', 'get');
    expect(response).toEqual({ $ref: '#/components/responses/Error' });

    // ...and that shared response is the router-wide shape
    const shared = requireSchemaObject(
      requireResponseComponentSchema(doc, 'Error'),
      doc,
      'Error response',
    );
    const error = requireSchemaObject(
      shared.properties?.['error'] ?? {},
      doc,
      'error shape',
    );
    const data = requireSchemaObject(
      error.properties?.['data'] ?? {},
      doc,
      'error data',
    );
    expect(Object.keys(data.properties ?? {})).toContain('requestId');
    expect(Object.keys(data.properties ?? {})).not.toContain('kind');
  });

  it('inlines a union for procedures with their own `.errors()`', () => {
    const variants = getErrorVariants('limited', 'post');
    expect(variants).toHaveLength(2);

    // one variant is the router-wide shape (the handler declined), the other
    // is the handler's own - built from the default shape, so no `requestId`
    const keys = variants.map(getExtraDataKeys);
    expect(keys).toContainEqual(['kind', 'retryAfterMs']);
    expect(keys).toContainEqual(['requestId']);
  });

  it('unions every shape in a chain of `.errors()` handlers', () => {
    const variants = getErrorVariants('chained', 'post');

    // rate-limit + conflict + the router-wide shape both handlers can decline to
    expect(variants.map(getExtraDataKeys)).toEqual([
      ['requestId'],
      ['kind', 'retryAfterMs'],
      ['kind', 'conflictsWith'],
    ]);
  });

  it('collapses chained handlers that declare the same shape', () => {
    const variants = getErrorVariants('chainedDuplicate', 'post');

    // the two handlers are identical, so the union is the same as a single one
    expect(variants.map(getExtraDataKeys)).toEqual([
      ['requestId'],
      ['kind', 'retryAfterMs'],
    ]);
    expect(variants).toEqual(getErrorVariants('limited', 'post'));
  });

  it('treats one handler returning several shapes like a chain of handlers', () => {
    expect(getErrorVariants('multiShape', 'post')).toEqual(
      getErrorVariants('chained', 'post'),
    );
  });

  it('keeps the shared Error response when a handler never claims an error', () => {
    // the handler only ever returns `undefined`, so the shape never widens
    const response = getDefaultResponse('neverClaims', 'post');
    expect(response).toEqual({ $ref: '#/components/responses/Error' });
  });

  it('emits mutually exclusive `oneOf` variants', () => {
    for (const opPath of [
      'limited',
      'chained',
      'chainedDuplicate',
      'multiShape',
    ]) {
      const variants = getErrorVariants(opPath, 'post');

      // a repeated branch would let one payload match more than one of them
      const seen = new Set(variants.map((v) => JSON.stringify(v)));
      expect(seen.size, `${opPath} has a repeated variant`).toBe(
        variants.length,
      );

      for (const variant of variants) {
        // ...and closed shapes keep a payload from matching a sibling branch
        const data = requireSchemaObject(
          variant.properties?.['data'] ?? {},
          doc,
          'error data',
        );
        expect(variant.additionalProperties).toBe(false);
        expect(data.additionalProperties).toBe(false);
        // every variant is a complete error shape, not just the extra keys
        expect(Object.keys(variant.properties ?? {}).sort()).toEqual([
          'code',
          'data',
          'message',
        ]);
      }
    }
  });

  it('flows through to the generated client types', () => {
    // the plain procedure only ever sees the router-wide shape
    expectTypeOf<PlainError['error']['data']>().toMatchTypeOf<{
      requestId: string;
    }>();

    const limited = {} as LimitedError['error']['data'];
    if ('kind' in limited) {
      expectTypeOf(limited.kind).toEqualTypeOf<'RATE_LIMIT'>();
      expectTypeOf(limited.retryAfterMs).toEqualTypeOf<number>();
    } else {
      expectTypeOf(limited.requestId).toEqualTypeOf<string>();
    }

    // a chain narrows down to whichever handler claimed the error
    const chained = {} as ChainedError['error']['data'];
    if (!('kind' in chained)) {
      expectTypeOf(chained.requestId).toEqualTypeOf<string>();
    } else if (chained.kind === 'RATE_LIMIT') {
      expectTypeOf(chained.retryAfterMs).toEqualTypeOf<number>();
    } else {
      expectTypeOf(chained.kind).toEqualTypeOf<'CONFLICT'>();
      expectTypeOf(chained.conflictsWith).toEqualTypeOf<string>();
    }

    // the collapsed and never-claiming cases are indistinguishable from the
    // single-handler and no-handler ones
    expectTypeOf<ChainedDuplicateError>().toEqualTypeOf<LimitedError>();
    expectTypeOf<NeverClaimsError>().toEqualTypeOf<PlainError>();
    expectTypeOf<MultiShapeError>().toEqualTypeOf<ChainedError>();
  });
});

describe('with the default error formatter', () => {
  // the router-wide shape is `DefaultErrorShape`, which a `.errors()` shape
  // built from `opts.shape` is structurally assignable to - so a shape
  // comparison by assignability alone would drop the per-procedure schema
  let defaultDoc: Document;

  beforeAll(async () => {
    defaultDoc = await generateOpenAPIDocument(defaultFormatterRouterPath, {
      exportName: 'DefaultErrorFormatterRouter',
    });
  });

  it('keeps the shared Error response for procedures without `.errors()`', () => {
    const operation = requireOperation(defaultDoc, 'plain', 'get');
    expect(operation.responses?.['default']).toEqual({
      $ref: '#/components/responses/Error',
    });
  });

  it('still inlines a union for procedures with their own `.errors()`', () => {
    const operation = requireOperation(defaultDoc, 'limited', 'post');
    const response = operation.responses?.['default'];
    expect(response).not.toEqual({ $ref: '#/components/responses/Error' });

    if (!response || isRef(response)) {
      throw new Error('Expected an inline response on POST limited');
    }
    const envelope = requireSchemaObject(
      response.content?.['application/json']?.schema ?? {},
      defaultDoc,
      'error envelope',
    );
    const error = requireSchemaObject(
      envelope.properties?.['error'] ?? {},
      defaultDoc,
      'error shape',
    );

    const variants = (error.oneOf ?? [error]).map((variant) =>
      requireSchemaObject(variant, defaultDoc, 'error variant'),
    );
    const extraKeys = variants.map((variant) => {
      const data = requireSchemaObject(
        variant.properties?.['data'] ?? {},
        defaultDoc,
        'error data',
      );
      return Object.keys(data.properties ?? {}).filter(
        (key) => !BASE_DATA_KEYS.includes(key),
      );
    });

    // the router-wide shape plus the handler's own
    expect(extraKeys).toContainEqual([]);
    expect(extraKeys).toContainEqual(['kind', 'retryAfterMs']);
  });

  it('generates a valid document', async () => {
    const problems = await validateOpenApi(JSON.stringify(defaultDoc, null, 2));
    expect(problems).toEqual([]);
  });

  it('flows through to the generated client types', () => {
    // @ts-expect-error - `kind` is only added by the procedure-level handler
    type _ = DefaultFormatterPlainError['error']['data']['kind'];

    const limited = {} as DefaultFormatterLimitedError['error']['data'];
    if ('kind' in limited) {
      expectTypeOf(limited.kind).toEqualTypeOf<'RATE_LIMIT'>();
      expectTypeOf(limited.retryAfterMs).toEqualTypeOf<number>();
    }
  });
});
