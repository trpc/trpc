import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import type { Document } from '../src/types';
import {
  requireOutputData,
  requireProperty,
  requireSchemaObject,
} from './types';
import { validateOpenApi } from './validateOpenApi';

const routerPath = path.resolve(
  __dirname,
  'routers/nodeModulesJsDocRouter.router.ts',
);

describe('JSDoc source filtering', () => {
  let doc: Document;

  beforeAll(async () => {
    doc = await generateOpenAPIDocument(routerPath, {
      exportName: 'NodeModulesJsDocRouter',
      title: 'JSDoc Source Filtering',
      version: '1.0.0',
    });
  });

  it('produces a valid OpenAPI spec', async () => {
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);
    expect(problems).toEqual([]);
  });

  it('keeps JSDoc from monorepo packages linked via node_modules', () => {
    const output = requireOutputData({ doc, procPath: 'monorepoImport' });
    const requestInfoSchema = requireSchemaObject(
      requireProperty(output, 'requestInfo'),
      doc,
      'monorepoImport.requestInfo',
    );
    const acceptSchema = requireSchemaObject(
      requireProperty(requestInfoSchema, 'accept'),
      doc,
      'TRPCRequestInfo.accept',
    );

    expect(acceptSchema.description).toBe('The `trpc-accept` header');
  });

  it('ignores JSDoc from external packages resolved from local node_modules', () => {
    const output = requireOutputData({
      doc,
      procPath: 'localNodeModulesImport',
    });
    const diagnosticSchema = requireSchemaObject(
      requireProperty(output, 'diagnostic'),
      doc,
      'localNodeModulesImport.diagnostic',
    );

    const rangeSchema = requireSchemaObject(
      requireProperty(diagnosticSchema, 'range'),
      doc,
      'Diagnostic.range',
    );
    const messageSchema = requireSchemaObject(
      requireProperty(diagnosticSchema, 'message'),
      doc,
      'Diagnostic.message',
    );

    expect(rangeSchema.description).toBeUndefined();
    expect(messageSchema.description).toBeUndefined();
  });

  it('ignores JSDoc from external packages resolved from root node_modules', () => {
    const output = requireOutputData({
      doc,
      procPath: 'rootNodeModulesImport',
    });
    const aliasOptionsSchema = requireSchemaObject(
      requireProperty(output, 'aliasOptions'),
      doc,
      'rootNodeModulesImport.aliasOptions',
    );

    expect(aliasOptionsSchema.description).toBeUndefined();
  });
});
