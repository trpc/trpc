import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as p from '@clack/prompts';
import {
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isStringLiteral,
  isVariableDeclaration,
  isVariableStatement,
  type SourceFile,
} from 'typescript/ast';
import { API, type Program } from 'typescript/sync';

function findConfigFile(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/**
 * Reads the project around the current directory, then stops the TypeScript
 * compiler process it started.
 */
export function scanProject() {
  const configFile = findConfigFile(process.cwd());
  if (!configFile) {
    p.log.error('No tsconfig found');
    process.exit(1);
  }

  if (process.env['VERBOSE']) {
    p.log.info(`Using tsconfig: ${configFile}`);
  }

  using api = new API({ cwd: process.cwd() });
  const parsedConfig = api.parseConfigFile(configFile);
  const program = api.createProgram(
    parsedConfig.fileNames,
    parsedConfig.options,
  );

  const fileNames = program.getSourceFileNames();
  const sourceFiles = fileNames
    .filter((fileName) => !DECLARATION_FILE.test(fileName))
    .map((fileName) => program.getSourceFile(fileName))
    .filter(
      (sourceFile): sourceFile is SourceFile =>
        !!sourceFile && !sourceFile.isDeclarationFile,
    );

  return {
    fileNames,
    references: findTRPCImportReferences(program, sourceFiles),
  };
}

function findSourceAndImportName(sourceFiles: SourceFile[]) {
  const files = sourceFiles.filter((sourceFile) =>
    sourceFile.statements.some(
      (node) =>
        isImportDeclaration(node) &&
        isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.includes('@trpc/react-query'),
    ),
  );

  let importName = 'trpc';
  files.forEach((sourceFile) => {
    sourceFile.statements.forEach((node) => {
      if (
        isVariableStatement(node) &&
        node.modifiers?.some((mod) => mod.getText(sourceFile) === 'export')
      ) {
        node.declarationList.declarations.forEach((declaration) => {
          if (
            isVariableDeclaration(declaration) &&
            declaration.initializer &&
            isCallExpression(declaration.initializer) &&
            isIdentifier(declaration.initializer.expression) &&
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
    files: files.map((d) => d.fileName as string),
    importName,
  };
}

function findTRPCImportReferences(program: Program, sourceFiles: SourceFile[]) {
  const { files: filesImportingTRPC, importName } =
    findSourceAndImportName(sourceFiles);
  const trpcReferenceSpecifiers = new Map<string, string>();

  sourceFiles.forEach((sourceFile) => {
    sourceFile.statements.forEach((node) => {
      if (isImportDeclaration(node) && isStringLiteral(node.moduleSpecifier)) {
        const resolved = program.getResolvedModuleFromModuleSpecifier(
          node.moduleSpecifier,
          sourceFile.fileName,
        );
        if (
          resolved &&
          filesImportingTRPC.includes(resolved.resolvedFileName)
        ) {
          trpcReferenceSpecifiers.set(
            resolved.resolvedFileName,
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
