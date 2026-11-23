import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import { memoize } from './memoize';
import { requireEnvelopeDataSchema } from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const overlappingUnionRouterPath = path.resolve(
  routersDir,
  'overlappingUnionRouter.ts',
);

describe('generateOpenAPIDocument overlapping union members', () => {
  const getDoc = memoize(() =>
    generateOpenAPIDocument(overlappingUnionRouterPath, {
      exportName: 'OverlappingUnionRouter',
      title: 'Overlapping Union API',
      version: '1.0.0',
    }),
  );

  it('produces a valid OpenAPI document', async () => {
    const doc = await getDoc();
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('documents Date | string as a string', async () => {
    const doc = await getDoc();
    // Every string matches both `string` and `date-time`, and `oneOf` rejects
    // a value that matches more than one member.
    expect(requireEnvelopeDataSchema({ doc, procPath: 'updatedAt' })).toEqual({
      type: 'string',
    });
  });

  it('documents Date | string | null as a nullable string', async () => {
    const doc = await getDoc();
    expect(requireEnvelopeDataSchema({ doc, procPath: 'deletedAt' })).toEqual({
      type: ['string', 'null'],
    });
  });

  it('documents string literals widened with string & {} as a string', async () => {
    const doc = await getDoc();
    expect(requireEnvelopeDataSchema({ doc, procPath: 'size' })).toEqual({
      type: 'string',
    });
  });

  it('keeps members of different types in oneOf', async () => {
    const doc = await getDoc();
    expect(
      requireEnvelopeDataSchema({ doc, procPath: 'literalOrNumber' }),
    ).toEqual({
      oneOf: [{ type: 'number' }, { type: 'string', const: 'auto' }],
    });
  });
});
