import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import { memoize } from './memoize';
import { requireOutputData } from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const undefinedPropertyRouterPath = path.resolve(
  routersDir,
  'undefinedPropertyRouter.ts',
);

describe('generateOpenAPIDocument properties that accept undefined', () => {
  const getDoc = memoize(() =>
    generateOpenAPIDocument(undefinedPropertyRouterPath, {
      exportName: 'UndefinedPropertyRouter',
      title: 'Undefined Property API',
      version: '1.0.0',
    }),
  );

  it('produces a valid OpenAPI document', async () => {
    const doc = await getDoc();
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('does not require a property whose type includes undefined', async () => {
    const doc = await getDoc();
    // `JSON.stringify({ id: '1', nickname: undefined })` is `{"id":"1"}`
    expect(
      requireOutputData({ doc, procPath: 'userWithUndefinedNickname' }),
    ).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string' },
        nickname: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    });
  });

  it('describes it the same as an optional property', async () => {
    const doc = await getDoc();
    expect(
      requireOutputData({ doc, procPath: 'userWithUndefinedNickname' }),
    ).toEqual(requireOutputData({ doc, procPath: 'userWithOptionalNickname' }));
  });
});
