import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as p from '@clack/prompts';
import {
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isImportSpecifier,
  isInterfaceDeclaration,
  isNamedImports,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
  isVariableDeclaration,
  isVariableStatement,
  type CallExpression,
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
    routerType: findRouterType(program, sourceFiles),
  };
}

/**
 * The router type `createTRPCReact<AppRouter>()` or `createTRPCNext` was
 * given, and the file that exports it, so files that only import the hooks
 * can still type `createTRPCClient<AppRouter>()`.
 */
export type RouterTypeSource =
  | {
      /** The name the module exports it under */
      name: string;
      /** A package or path alias, which any file can import as it is */
      specifier: string;
    }
  | {
      name: string;
      /** A project file, which each file imports by its own relative path */
      file: string;
      /** `.js` if the project imports files with an extension, else `''` */
      extension: string;
    };

function findRouterType(
  program: Program,
  sourceFiles: SourceFile[],
): RouterTypeSource | null {
  for (const sourceFile of sourceFiles) {
    for (const node of sourceFile.statements) {
      if (!isVariableStatement(node)) {
        continue;
      }
      for (const declaration of node.declarationList.declarations) {
        const init = declaration.initializer;
        if (!init || !isTRPCFactoryCall(init, sourceFile)) {
          continue;
        }
        const [typeArgument] = init.typeArguments ?? [];
        if (
          !typeArgument ||
          !isTypeReferenceNode(typeArgument) ||
          !isIdentifier(typeArgument.typeName)
        ) {
          continue;
        }
        const local = typeArgument.typeName.text;
        const found = findTypeSource(program, sourceFile, local);
        if (found) {
          return found;
        }
      }
    }
  }
  return null;
}

function isTRPCFactoryCall(
  node: unknown,
  sourceFile: SourceFile,
): node is CallExpression {
  return (
    isCallExpression(node as never) &&
    isIdentifier((node as CallExpression).expression) &&
    ['createTRPCReact', 'createTRPCNext'].includes(
      (node as CallExpression).expression.getText(sourceFile),
    )
  );
}

/** Where `local`, a type name in `sourceFile`, comes from */
function findTypeSource(
  program: Program,
  sourceFile: SourceFile,
  local: string,
): RouterTypeSource | null {
  for (const node of sourceFile.statements) {
    if (
      (isTypeAliasDeclaration(node) || isInterfaceDeclaration(node)) &&
      node.name.text === local &&
      node.modifiers?.some((mod) => mod.getText(sourceFile) === 'export')
    ) {
      return { name: local, file: sourceFile.fileName, extension: '' };
    }
    if (
      !isImportDeclaration(node) ||
      !isStringLiteral(node.moduleSpecifier) ||
      !node.importClause?.namedBindings ||
      !isNamedImports(node.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of node.importClause.namedBindings.elements) {
      if (!isImportSpecifier(element) || element.name.text !== local) {
        continue;
      }
      const name = (element.propertyName ?? element.name).getText(sourceFile);
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('.')) {
        return { name, specifier };
      }
      const resolved = program.getResolvedModuleFromModuleSpecifier(
        node.moduleSpecifier,
        sourceFile.fileName,
      );
      if (!resolved) {
        return null;
      }
      return {
        name,
        file: resolved.resolvedFileName,
        extension: /\.[cm]?js$/.test(specifier) ? '.js' : '',
      };
    }
  }
  return null;
}

function findSourceAndImportName(sourceFiles: SourceFile[]) {
  const files = sourceFiles.filter((sourceFile) =>
    sourceFile.statements.some(
      (node) =>
        isImportDeclaration(node) &&
        isStringLiteral(node.moduleSpecifier) &&
        (node.moduleSpecifier.text.includes('@trpc/react-query') ||
          node.moduleSpecifier.text === '@trpc/next'),
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
            ['createTRPCReact', 'createTRPCNext'].includes(
              declaration.initializer.expression.getText(sourceFile),
            )
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
