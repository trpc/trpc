import * as path from 'node:path';
import {
  getLanguageService,
  LogLevel,
  ReferenceValidationMode,
} from '@swagger-api/apidom-ls';
import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
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
  it('returns a valid OpenAPI 3.0 document', () => {
    const doc = generateOpenAPIDocument(testRouterPath, {
      title: 'Test API',
      version: '1.0.0',
    });
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toBe('Test API');
    expect(doc.info.version).toBe('1.0.0');
  });

  it('produces a document', () => {
    const doc = generateOpenAPIDocument(testRouterPath);

    expect(JSON.stringify(doc, null, 2)).toMatchFileSnapshot(
      testRouterPath + '.json',
    );
  });

  it('throws when the export is not found', () => {
    expect(() =>
      generateOpenAPIDocument(testRouterPath, { exportName: 'NonExistent' }),
    ).toThrow(/NonExistent/);
  });

  it('throws when the file does not exist', () => {
    expect(() => generateOpenAPIDocument('/non/existent/file.ts')).toThrow();
  });

  it('produces a spec with no validation errors when validated', async () => {
    const doc = generateOpenAPIDocument(testRouterPath, {
      title: 'Test API',
      version: '1.0.0',
    });
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenAPI(spec);

    expect(problems).toEqual([]);
  });
});
