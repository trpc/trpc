import * as path from 'node:path';
import {
  getLanguageService,
  LogLevel,
  ReferenceValidationMode,
} from '@swagger-api/apidom-ls';
import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { OpenAPIDocument } from './generate';
import { generateOpenAPIDocument } from './generate';

const languageService = getLanguageService({
  logLevel: LogLevel.ERROR,
  validationContext: {
    referenceValidationContinueOnError: true,
    referenceValidationMode: ReferenceValidationMode.APIDOM_INDIRECT_EXTERNAL,
  },
});

async function validateOpenAPI(spec: string) {
  const document = TextDocument.create('file:///spec', 'json', 1, spec);
  const diagnostics = await languageService.doValidation(document);

  return diagnostics.map((d) => ({
    line: d.range.start.line + 1,
    character: d.range.start.character + 1,
    message: d.message,
    severity: d.severity,
    code: d.code,
    source: d.source,
  }));
}

const testRouterPath = path.resolve(__dirname, '__testRouter.ts');

describe('generateOpenAPIDocument', () => {
  it('throws when the export is not found', () => {
    expect(() =>
      generateOpenAPIDocument(testRouterPath, { exportName: 'NonExistent' }),
    ).toThrow(/NonExistent/);
  });

  it('throws when the file does not exist', () => {
    expect(() => generateOpenAPIDocument('/non/existent/file.ts')).toThrow();
  });

  describe('router json generation', () => {
    let doc: OpenAPIDocument;

    beforeAll(() => {
      doc = generateOpenAPIDocument(testRouterPath, {
        title: 'Test API',
        version: '1.0.0',
      });
    });

    it('returns a valid tRPC OpenAPI 3.0 document', () => {
      expect(doc.openapi).toBe('3.0.3');
      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('1.0.0');

      // Keys should be formatted tRPC style as `path.to.procedure`
      for (const key of Object.keys(doc.paths)) {
        expect(key).not.toMatch(/..+\/.+/);
      }
      expect(Object.keys(doc.paths)).toContain('/user.create');
    });

    it('matches snapshot', () => {
      const doc = generateOpenAPIDocument(testRouterPath);

      // Note to LLMs/Agents, you can read packages/server/src/openapi/__testRouter.ts.json
      // to understand the output after a snapshot update
      expect(JSON.stringify(doc, null, 2)).toMatchFileSnapshot(
        testRouterPath + '.json',
      );
    });

    it('produces a spec with no validation errors when validated', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);

      expect(problems).toEqual([]);
    });
  });
});
