import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import { memoize } from './memoize';
import {
  requireEnvelopeDataSchema,
  requireInputSchema,
  requireProperty,
  requireSchemaObject,
} from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const nullableEnumRouterPath = path.resolve(
  routersDir,
  'nullableEnumRouter.ts',
);

describe('generateOpenAPIDocument nullable literal unions', () => {
  const getDoc = memoize(() =>
    generateOpenAPIDocument(nullableEnumRouterPath, {
      exportName: 'NullableEnumRouter',
      title: 'Nullable Enum API',
      version: '1.0.0',
    }),
  );

  it('produces a valid OpenAPI document', async () => {
    const doc = await getDoc();
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('lists null in the enum of a nullable string literal union', async () => {
    const doc = await getDoc();
    // `enum` alone decides which values are valid, so without `null` in it
    // validators reject a null result and generated clients drop `| null`.
    expect(requireEnvelopeDataSchema({ doc, procPath: 'status' })).toEqual({
      type: ['string', 'null'],
      enum: ['active', 'archived', null],
    });
  });

  it('lists null in the enum of a nullable number literal union', async () => {
    const doc = await getDoc();
    expect(requireEnvelopeDataSchema({ doc, procPath: 'priority' })).toEqual({
      type: ['number', 'null'],
      enum: [1, 2, 3, null],
    });
  });

  it('lists null in the enum of a nullable enum input', async () => {
    const doc = await getDoc();
    const input = requireSchemaObject(
      requireInputSchema(doc, 'filter'),
      doc,
      'filter input',
    );
    expect(requireProperty(input, 'status')).toEqual({
      type: ['string', 'null'],
      enum: ['active', 'archived', null],
    });
  });

  it('keeps a non-nullable literal union unchanged', async () => {
    const doc = await getDoc();
    expect(
      requireEnvelopeDataSchema({ doc, procPath: 'requiredStatus' }),
    ).toEqual({
      type: 'string',
      enum: ['active', 'archived'],
    });
  });
});
