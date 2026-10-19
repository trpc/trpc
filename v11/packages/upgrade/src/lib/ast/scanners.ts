import * as p from '@clack/prompts';
import * as ts from 'typescript';

export function getProgram() {
  const configFile = ts.findConfigFile(process.cwd(), (filepath) =>
    ts.sys.fileExists(filepath),
  );
  if (!configFile) {
    p.log.error('No tsconfig found');
    process.exit(1);
  }

  if (process.env['VERBOSE']) {
    p.log.info(`Using tsconfig: ${configFile}`);
  }

  const { config } = ts.readConfigFile(configFile, (filepath) =>
    ts.sys.readFile(filepath),
  );
  const parsedConfig = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    process.cwd(),
  );
  const program = ts.createProgram({
    options: parsedConfig.options,
    rootNames: parsedConfig.fileNames,
    configFileParsingDiagnostics: parsedConfig.errors,
  });

  return program;
}

export function findSourceAndImportName(program: ts.Program) {
  const files = program.getSourceFiles().filter((sourceFile) => {
    if (sourceFile.isDeclarationFile) return false;
    let found = false;
    ts.forEachChild(sourceFile, (node) => {
      if (!found && ts.isImportDeclaration(node)) {
        const { moduleSpecifier } = node;
        if (
          ts.isStringLiteral(moduleSpecifier) &&
          moduleSpecifier.text.includes('@trpc/react-query')
        ) {
          found = true;
        }
      }
    });
    return found;
  });

  let importName = 'trpc';
  files.forEach((sourceFile) => {
    ts.forEachChild(sourceFile, (node) => {
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some((mod) => mod.getText(sourceFile) === 'export')
      ) {
        node.declarationList.declarations.forEach((declaration) => {
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer) &&
            ts.isIdentifier(declaration.initializer.expression) &&
            declaration.initializer.expression.getText(sourceFile) ===
              'createTRPCReact'
          ) {
            importName = declaration.name.getText(sourceFile);
          }
        });
      }
    });
  });

  return {
    files: files.map((d) => d.fileName),
    importName,
  };
}

export function findTRPCImportReferences(program: ts.Program) {
  const { files: filesImportingTRPC, importName } =
    findSourceAndImportName(program);
  const trpcReferenceSpecifiers = new Map<string, string>();

  program.getSourceFiles().forEach((sourceFile) => {
    if (sourceFile.isDeclarationFile) return;
    ts.forEachChild(sourceFile, (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const resolved = ts.resolveModuleName(
          node.moduleSpecifier.text,
          sourceFile.fileName,
          program.getCompilerOptions(),
          ts.sys,
        );
        if (
          resolved.resolvedModule &&
          filesImportingTRPC.includes(resolved.resolvedModule.resolvedFileName)
        ) {
          trpcReferenceSpecifiers.set(
            resolved.resolvedModule.resolvedFileName,
            node.moduleSpecifier.text,
          );
        }
      }
    });
  });

  const counts: Record<string, number> = {};
  let currentMax = 0;
  const mostUsed = { file: '' };

  [...trpcReferenceSpecifiers.values()].forEach((specifier) => {
    counts[specifier] = (counts[specifier] ?? 0) + 1;
    if (counts[specifier] > currentMax) {
      currentMax = counts[specifier];
      mostUsed.file = specifier;
    }
  });

  return {
    importName,
    mostUsed,
    all: Object.fromEntries(trpcReferenceSpecifiers.entries()),
  };
}
