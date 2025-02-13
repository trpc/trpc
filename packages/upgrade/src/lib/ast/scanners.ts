import {
  forEachChild,
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isStringLiteral,
  isVariableDeclaration,
  isVariableStatement,
  resolveModuleName,
  sys,
  type Program,
} from 'typescript';

export function findSourceAndImportName(program: Program) {
  const files = program.getSourceFiles().filter((sourceFile) => {
    if (sourceFile.isDeclarationFile) return false;
    let found = false;
    forEachChild(sourceFile, (node) => {
      if (!found && isImportDeclaration(node)) {
        const { moduleSpecifier } = node;
        if (
          isStringLiteral(moduleSpecifier) &&
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
    forEachChild(sourceFile, (node) => {
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
    files: files.map((d) => d.fileName),
    importName,
  };
}

export function findTRPCImportReferences(program: Program) {
  const { files: filesImportingTRPC, importName } =
    findSourceAndImportName(program);
  const trpcReferenceSpecifiers = new Map<string, string>();

  program.getSourceFiles().forEach((sourceFile) => {
    if (sourceFile.isDeclarationFile) return;
    forEachChild(sourceFile, (node) => {
      if (isImportDeclaration(node) && isStringLiteral(node.moduleSpecifier)) {
        const resolved = resolveModuleName(
          node.moduleSpecifier.text,
          sourceFile.fileName,
          program.getCompilerOptions(),
          sys,
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
    counts[specifier] = (counts[specifier] || 0) + 1;
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
