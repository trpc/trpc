import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import { memoize } from './memoize';
import { requireEnvelopeDataSchema } from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const templateLiteralRouterPath = path.resolve(
  routersDir,
  'templateLiteralRouter.ts',
);

describe('generateOpenAPIDocument template literal outputs', () => {
  const getDoc = memoize(() =>
    generateOpenAPIDocument(templateLiteralRouterPath, {
      exportName: 'TemplateLiteralRouter',
      title: 'Template Literal API',
      version: '1.0.0',
    }),
  );

  it('produces a valid OpenAPI document', async () => {
    const doc = await getDoc();
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('documents a template literal output as a string in result.data', async () => {
    const doc = await getDoc();
    // `user_${string}` should serialise as { type: 'string' } so that
    // generated clients (Swagger UI, hey-api) keep the result.data field.
    expect(requireEnvelopeDataSchema({ doc, procPath: 'userId' })).toEqual({
      type: 'string',
    });
  });

  it('documents a union of template literals as a string in result.data', async () => {
    const doc = await getDoc();
    expect(requireEnvelopeDataSchema({ doc, procPath: 'eventName' })).toEqual({
      type: 'string',
    });
  });

  it('strips brand objects from branded template literals', async () => {
    const doc = await getDoc();
    // Like branded plain strings, only the string itself reaches the schema.
    expect(requireEnvelopeDataSchema({ doc, procPath: 'branded' })).toEqual({
      type: 'string',
    });
  });
});
