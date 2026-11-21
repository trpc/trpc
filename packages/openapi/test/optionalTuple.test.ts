import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import { memoize } from './memoize';
import { requireEnvelopeDataSchema } from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const optionalTupleRouterPath = path.resolve(
  routersDir,
  'optionalTupleRouter.ts',
);

describe('generateOpenAPIDocument optional tuple elements', () => {
  const getDoc = memoize(() =>
    generateOpenAPIDocument(optionalTupleRouterPath, {
      exportName: 'OptionalTupleRouter',
      title: 'Optional Tuple API',
      version: '1.0.0',
    }),
  );

  it('produces a valid OpenAPI document', async () => {
    const doc = await getDoc();
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('only requires the elements before the first optional one', async () => {
    const doc = await getDoc();
    // `[string, number?]` may serialise as a 1-element array; a minItems
    // equal to the full length makes consumers reject that payload.
    expect(
      requireEnvelopeDataSchema({ doc, procPath: 'pairWithOptionalMeta' }),
    ).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
      minItems: 1,
      maxItems: 2,
    });
  });

  it('does not mistake an explicit undefined member for an optional one', async () => {
    const doc = await getDoc();
    // Every element of `[string | undefined, number]` is required; only the
    // `?` marker makes an element optional, not a `T | undefined` type.
    expect(
      requireEnvelopeDataSchema({ doc, procPath: 'pairWithExplicitUndefined' }),
    ).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
  });

  it('keeps tuples without optional elements fully required', async () => {
    const doc = await getDoc();
    expect(
      requireEnvelopeDataSchema({ doc, procPath: 'strictTriple' }),
    ).toEqual({
      type: 'array',
      prefixItems: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
      ],
      items: false,
      minItems: 3,
      maxItems: 3,
    });
  });
});
