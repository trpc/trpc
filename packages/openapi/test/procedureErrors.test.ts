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
  LimitedErrorShape,
  MultiShapeError,
  NeverClaimsError,
  PlainError,
} from './routers/procedureErrorsRouter-heyapi/types.gen';
import {
  getResponseComponent,
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

function getDefaultResponse(
  from: Document,
  opPath: string,
  method: 'get' | 'post',
) {
  const operation = requireOperation(from, opPath, method);
  const response = operation.responses?.['default'];
  if (!response) {
    throw new Error(`No default response on ${method} ${opPath}`);
  }
  return response;
}

function getErrorResponseName(
  from: Document,
  opPath: string,
  method: 'get' | 'post',
): string {
  const response = getDefaultResponse(from, opPath, method);
  if (!isRef(response)) {
    throw new Error(`Expected a $ref response on ${method} ${opPath}`);
  }
  return response.$ref.replace('#/components/responses/', '');
}

function getErrorSchema(
  from: Document,
  opPath: string,
  method: 'get' | 'post',
): SchemaObject {
  const responseName = getErrorResponseName(from, opPath, method);
  const response = getResponseComponent(from, responseName);
  if (!response) {
    throw new Error(`No response component "${responseName}"`);
  }
  const schema = response.content?.['application/json']?.schema;
  if (!schema) {
    throw new Error(`No schema on ${method} ${opPath}`);
  }
  const envelope = requireSchemaObject(schema, from, 'error envelope');
  const error = envelope.properties?.['error'];
  if (!error) {
    throw new Error('Error envelope has no `error` property');
  }
  return requireSchemaObject(error, from, 'error shape');
}

/** The `oneOf` members of a procedure's error shape, with `$ref`s resolved */
function getErrorVariants(
  from: Document,
  opPath: string,
  method: 'get' | 'post',
): SchemaObject[] {
  const error = getErrorSchema(from, opPath, method);
  return (error.oneOf ?? [error]).map((variant) =>
    requireSchemaObject(variant, from, 'error variant'),
  );
}

/** The keys a variant's `data` adds on top of the ones every shape has */
function getExtraDataKeys(from: Document, variant: SchemaObject): string[] {
  const data = requireSchemaObject(
    variant.properties?.['data'] ?? {},
    from,
    'error data',
  );
  return Object.keys(data.properties ?? {}).filter(
    (key) => !BASE_DATA_KEYS.includes(key),
  );
}

/**
 * A payload matching two branches of a `oneOf` satisfies none of them, so no
 * two branches may describe the same shape.
 */
function expectDistinctVariants(variants: SchemaObject[], label: string) {
  const seen = new Set(variants.map((variant) => JSON.stringify(variant)));
  expect(seen.size, `${label} has a repeated variant`).toBe(variants.length);
}

describe('per-procedure error shapes', () => {
  it('generates a valid document', async () => {
    const problems = await validateOpenApi(JSON.stringify(doc, null, 2));
    expect(problems).toEqual([]);
  });

  it('keeps the shared Error response for procedures without `.errors()`', () => {
    const response = getDefaultResponse(doc, 'plain', 'get');
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

  it('unions the router-wide shape in for procedures with their own `.errors()`', () => {
    const variants = getErrorVariants(doc, 'limited', 'post');
    expect(variants).toHaveLength(2);

    // one variant is the router-wide shape (the handler declined), the other
    // is the handler's own - built from the default shape, so no `requestId`
    const keys = variants.map((variant) => getExtraDataKeys(doc, variant));
    expect(keys).toContainEqual(['kind', 'retryAfterMs']);
    expect(keys).toContainEqual(['requestId']);
  });

  it('unions every shape in a chain of `.errors()` handlers', () => {
    const variants = getErrorVariants(doc, 'chained', 'post');

    // rate-limit + conflict + the router-wide shape both handlers can decline to
    expect(variants.map((variant) => getExtraDataKeys(doc, variant))).toEqual([
      ['requestId'],
      ['kind', 'retryAfterMs'],
      ['kind', 'conflictsWith'],
    ]);
  });

  it('collapses chained handlers that declare the same shape', () => {
    const variants = getErrorVariants(doc, 'chainedDuplicate', 'post');

    // the two handlers are identical, so the union is the same as a single one
    expect(variants.map((variant) => getExtraDataKeys(doc, variant))).toEqual([
      ['requestId'],
      ['kind', 'retryAfterMs'],
    ]);
    expect(variants).toEqual(getErrorVariants(doc, 'limited', 'post'));
  });

  it('treats one handler returning several shapes like a chain of handlers', () => {
    expect(getErrorVariants(doc, 'multiShape', 'post')).toEqual(
      getErrorVariants(doc, 'chained', 'post'),
    );
  });

  it('gives each distinct error shape one response component', () => {
    // procedures raising the same shapes point at the same component instead
    // of each carrying their own copy of the union
    expect(getErrorResponseName(doc, 'chainedDuplicate', 'post')).toBe(
      getErrorResponseName(doc, 'limited', 'post'),
    );
    expect(getErrorResponseName(doc, 'multiShape', 'post')).toBe(
      getErrorResponseName(doc, 'chained', 'post'),
    );
    expect(getErrorResponseName(doc, 'limited', 'post')).not.toBe(
      getErrorResponseName(doc, 'chained', 'post'),
    );
  });

  it('names the shape a component so a client can import it once', () => {
    const envelope = requireSchemaObject(
      requireResponseComponentSchema(doc, 'LimitedError'),
      doc,
      'error envelope',
    );
    expect(envelope.properties?.['error']).toEqual({
      $ref: '#/components/schemas/LimitedErrorShape',
    });
  });

  it('describes each error shape in one place', () => {
    // no operation carries its own copy of a union...
    const operations: [string, 'get' | 'post'][] = [
      ['plain', 'get'],
      ['limited', 'post'],
      ['chained', 'post'],
      ['chainedDuplicate', 'post'],
      ['multiShape', 'post'],
      ['neverClaims', 'post'],
    ];
    for (const [opPath, method] of operations) {
      const response = getDefaultResponse(doc, opPath, method);
      expect(isRef(response), `${opPath} inlines its error response`).toBe(
        true,
      );
    }

    // ...and six procedures raise three shapes between them
    expect(Object.keys(doc.components?.responses ?? {})).toEqual([
      'Error',
      'LimitedError',
      'ChainedError',
    ]);
  });

  it('keeps the shared Error response when a handler never claims an error', () => {
    // the handler only ever returns `undefined`, so the shape never widens
    const response = getDefaultResponse(doc, 'neverClaims', 'post');
    expect(response).toEqual({ $ref: '#/components/responses/Error' });
  });

  it('emits mutually exclusive `oneOf` variants', () => {
    for (const opPath of [
      'limited',
      'chained',
      'chainedDuplicate',
      'multiShape',
    ]) {
      const variants = getErrorVariants(doc, opPath, 'post');
      expectDistinctVariants(variants, opPath);

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

    // the shape is a named component, so a client can import it once instead
    // of reaching into each operation's error type
    expectTypeOf<LimitedError['error']>().toEqualTypeOf<LimitedErrorShape>();

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

  it('still gives procedures with their own `.errors()` their own response', () => {
    const response = getDefaultResponse(defaultDoc, 'limited', 'post');
    expect(response).not.toEqual({ $ref: '#/components/responses/Error' });

    const variants = getErrorVariants(defaultDoc, 'limited', 'post');
    const extraKeys = variants.map((variant) =>
      getExtraDataKeys(defaultDoc, variant),
    );

    // the router-wide shape plus the handler's own
    expect(extraKeys).toContainEqual([]);
    expect(extraKeys).toContainEqual(['kind', 'retryAfterMs']);
  });

  it('emits mutually exclusive `oneOf` variants', () => {
    // the router-wide shape is a named component here, so a handler shape that
    // renders to the same schema reaches the union as a `$ref` alongside the
    // inline copy - one payload would then match both branches and satisfy
    // neither
    for (const opPath of ['limited', 'sanitized']) {
      expectDistinctVariants(
        getErrorVariants(defaultDoc, opPath, 'post'),
        opPath,
      );
    }
  });

  it('collapses a handler shape that renders like the router-wide one', () => {
    // the handler only rewrites `message`, so its shape carries the same keys
    // and the procedure adds nothing to the shared response
    expect(getDefaultResponse(defaultDoc, 'sanitized', 'post')).toEqual({
      $ref: '#/components/responses/Error',
    });
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
