import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import type { Document } from '../src/types';
import { memoize } from './memoize';
import {
  getRequestBody,
  requireProperty,
  requireResponseSchema,
  requireSchemaObject,
} from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const optionalInputRouterPath = path.resolve(
  routersDir,
  'optionalInputRouter.ts',
);

const getDoc = memoize(() =>
  generateOpenAPIDocument(optionalInputRouterPath, {
    exportName: 'OptionalInputRouter',
    title: 'Optional Input API',
    version: '1.0.0',
  }),
);

function getResultObject(doc: Document, procPath: string) {
  const envelope = requireSchemaObject(
    requireResponseSchema({ doc, procPath }),
    doc,
  );
  return requireSchemaObject(requireProperty(envelope, 'result'), doc);
}

describe('generateOpenAPIDocument optional procedure input', () => {
  it('produces a valid OpenAPI document', async () => {
    const doc = await getDoc();
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('does not require the body of a mutation whose input is optional', async () => {
    const doc = await getDoc();
    // A client may omit the input; it then sends no body at all.
    expect(getRequestBody(doc, 'optional')?.required).toBe(false);
  });

  it('does not require the body of a mutation whose input is nullish', async () => {
    const doc = await getDoc();
    expect(getRequestBody(doc, 'nullish')?.required).toBe(false);
  });

  it('does not require the body of a mutation whose input is any', async () => {
    const doc = await getDoc();
    // `any` accepts `undefined` without an explicit `undefined` union member.
    expect(getRequestBody(doc, 'any')?.required).toBe(false);
  });

  it('does not require the body of a mutation whose input is unknown', async () => {
    const doc = await getDoc();
    // `unknown` accepts `undefined` without an explicit `undefined` union member.
    expect(getRequestBody(doc, 'unknown')?.required).toBe(false);
  });

  it('still requires the body of a mutation whose input is not optional', async () => {
    const doc = await getDoc();
    expect(getRequestBody(doc, 'required')?.required).toBe(true);
  });

  it('still requires the body of a mutation whose input only accepts null', async () => {
    const doc = await getDoc();
    // `null` is sent as a body, so only `undefined` can make the input optional.
    expect(getRequestBody(doc, 'nullable')?.required).toBe(true);
  });
});

describe('generateOpenAPIDocument optional procedure output', () => {
  it('does not require the data of a response whose output is optional', async () => {
    const doc = await getDoc();
    // JSON drops a property set to `undefined`, so a procedure that returns
    // nothing answers `{ "result": {} }`.
    expect(getResultObject(doc, 'optionalOutput').required).toBeUndefined();
  });

  it('does not require the data of a response whose output is nullish', async () => {
    const doc = await getDoc();
    expect(getResultObject(doc, 'nullishOutput').required).toBeUndefined();
  });

  it('still requires the data of a response whose output is not optional', async () => {
    const doc = await getDoc();
    expect(getResultObject(doc, 'requiredOutput').required).toEqual(['data']);
  });
});
