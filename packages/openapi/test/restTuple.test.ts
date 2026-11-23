import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import { memoize } from './memoize';
import { requireEnvelopeDataSchema } from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const restTupleRouterPath = path.resolve(routersDir, 'restTupleRouter.ts');

describe('generateOpenAPIDocument tuple rest elements', () => {
  const getDoc = memoize(() =>
    generateOpenAPIDocument(restTupleRouterPath, {
      exportName: 'RestTupleRouter',
      title: 'Rest Tuple API',
      version: '1.0.0',
    }),
  );

  it('produces a valid OpenAPI document', async () => {
    const doc = await getDoc();
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('turns a trailing rest element into repeated items without a length cap', async () => {
    const doc = await getDoc();
    // `[string, ...number[]]` accepts `['hello']` and `['hello', 1, 2]`;
    // a two-position schema with maxItems 2 rejects both.
    expect(
      requireEnvelopeDataSchema({ doc, procPath: 'trailingRest' }),
    ).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }],
      items: { type: 'number' },
      minItems: 1,
    });
  });

  it('keeps the optional elements before a rest element optional', async () => {
    const doc = await getDoc();
    expect(
      requireEnvelopeDataSchema({ doc, procPath: 'optionalThenRest' }),
    ).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: { type: 'boolean' },
      minItems: 1,
    });
  });

  it('falls back to a permissive schema for a leading rest element', async () => {
    const doc = await getDoc();
    // JSON Schema cannot require the last item to be a number, so accept
    // either element type instead of claiming an exact two-item tuple.
    expect(requireEnvelopeDataSchema({ doc, procPath: 'leadingRest' })).toEqual(
      {
        type: 'array',
        items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        minItems: 1,
      },
    );
  });

  it('leaves tuples without rest elements unchanged', async () => {
    const doc = await getDoc();
    expect(requireEnvelopeDataSchema({ doc, procPath: 'strictPair' })).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
  });
});
