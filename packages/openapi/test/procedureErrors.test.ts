import * as path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import type { Document, SchemaObject } from '../src/types';
import type {
  LimitedError,
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

function getDefaultResponse(
  doc: Document,
  opPath: string,
  method: 'get' | 'post',
) {
  const operation = requireOperation(doc, opPath, method);
  const response = operation.responses?.['default'];
  if (!response) {
    throw new Error(`No default response on ${method} ${opPath}`);
  }
  return response;
}

function getErrorSchema(
  doc: Document,
  opPath: string,
  method: 'get' | 'post',
): SchemaObject {
  const response = getDefaultResponse(doc, opPath, method);
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

describe('per-procedure error shapes', () => {
  it('generates a valid document', async () => {
    const doc = await generateOpenAPIDocument(routerPath, {
      exportName: 'ProcedureErrorsRouter',
    });
    const problems = await validateOpenApi(JSON.stringify(doc, null, 2));
    expect(problems).toEqual([]);
  });

  it('keeps the shared Error response for procedures without `.errors()`', async () => {
    const doc = await generateOpenAPIDocument(routerPath, {
      exportName: 'ProcedureErrorsRouter',
    });

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

  it('inlines a union for procedures with their own `.errors()`', async () => {
    const doc = await generateOpenAPIDocument(routerPath, {
      exportName: 'ProcedureErrorsRouter',
    });

    const error = getErrorSchema(doc, 'limited', 'post');
    expect(error.oneOf).toHaveLength(2);

    const variants = (error.oneOf ?? []).map((variant) => {
      const shape = requireSchemaObject(variant, doc, 'error variant');
      const data = requireSchemaObject(
        shape.properties?.['data'] ?? {},
        doc,
        'error data',
      );
      return Object.keys(data.properties ?? {});
    });

    // one variant is the router-wide shape (the handler declined), the other
    // is the handler's own - built from the default shape, so no `requestId`
    expect(variants).toContainEqual(
      expect.arrayContaining(['kind', 'retryAfterMs']),
    );
    expect(variants).toContainEqual(expect.arrayContaining(['requestId']));
    expect(variants.find((keys) => keys.includes('kind'))).not.toContain(
      'requestId',
    );
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
  });
});
