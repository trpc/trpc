import { getLanguageService, LogLevel } from '@swagger-api/apidom-ls';
import { TextDocument } from 'vscode-languageserver-textdocument';
import 'vscode-languageserver-types';

const languageService = getLanguageService({
  logLevel: LogLevel.ERROR,
});

export async function validateOpenApi(spec: string) {
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
