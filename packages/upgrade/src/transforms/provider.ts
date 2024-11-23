import type { API, FileInfo, Options } from 'jscodeshift';

interface TransformOptions extends Options {
  trpcImportName?: string;
}

export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions,
) {
  const { trpcImportName } = options;
  let routerName: string | undefined = undefined;

  const j = api.jscodeshift;
  const root = j(file.source);
  let dirtyFlag = false;

  // Find the variable declaration for `trpc`
  root.find(j.VariableDeclaration).forEach((path) => {
    const declaration = path.node.declarations[0];
    if (
      j.Identifier.check(declaration.id) &&
      declaration.id.name === trpcImportName
    ) {
      if (
        j.CallExpression.check(declaration.init) &&
        j.Identifier.check(declaration.init.callee) &&
        declaration.init.callee.name === 'createTRPCReact'
      ) {
        // Get router name ( TODO : should probably get this from the TS compiler along with the import path)
        routerName =
          declaration.init.original?.typeParameters?.params?.[0]?.typeName
            ?.name;

        // Replace the `createTRPCReact` call with `createTRPCContext`
        declaration.init.callee.name = 'createTRPCContext';

        // Destructure the result into `TRPCProvider` and `useTRPC`
        declaration.id = j.objectPattern([
          j.property.from({
            kind: 'init',
            key: j.identifier('TRPCProvider'),
            value: j.identifier('TRPCProvider'),
            shorthand: true,
          }),
          j.property.from({
            kind: 'init',
            key: j.identifier('useTRPC'),
            value: j.identifier('useTRPC'),
            shorthand: true,
          }),
        ]);

        dirtyFlag = true;
      }
    }
  });

  // Update the import statement if transformation was successful
  if (dirtyFlag) {
    root
      .find(j.ImportDeclaration, { source: { value: '@trpc/react-query' } })
      .forEach((path) => {
        path.node.source.value = '@trpc/tanstack-react-query';
        path.node.specifiers?.forEach((specifier) => {
          if (
            j.ImportSpecifier.check(specifier) &&
            specifier.imported.name === 'createTRPCReact'
          ) {
            specifier.imported.name = 'createTRPCContext';
          }
        });
      });
  }

  // Replace trpc.createClient with createTRPCClient<TRouter>
  root
    .find(j.CallExpression, {
      callee: {
        object: { name: trpcImportName },
        property: { name: 'createClient' },
      },
    })
    .forEach((path) => {
      path.node.callee = j.identifier('createTRPCClient');
      dirtyFlag = true;

      if (routerName) {
        (path.node as any).typeParameters = j.tsTypeParameterInstantiation([
          j.tsTypeReference(j.identifier(routerName)),
        ]);
      }
    });

  // Replace <trpc.Provider client={...} with <TRPCProvider trpcClient={...}
  root
    .find(j.JSXElement, {
      openingElement: {
        name: {
          object: { name: trpcImportName },
          property: { name: 'Provider' },
        },
      },
    })
    .forEach((path) => {
      path.node.openingElement.name = j.jsxIdentifier('TRPCProvider');
      if (path.node.closingElement) {
        path.node.closingElement.name = j.jsxIdentifier('TRPCProvider');
      }
      path.node.openingElement.attributes?.forEach((attr) => {
        if (j.JSXAttribute.check(attr) && attr.name.name === 'client') {
          attr.name.name = 'trpcClient';
        }
      });
      dirtyFlag = true;
    });

  // Update imports if transformations were applied
  if (dirtyFlag) {
    // Add createTRPCClient to the import from '@trpc/client'
    root
      .find(j.ImportDeclaration, {
        source: { value: '@trpc/client' },
      })
      .forEach((path) => {
        const createTRPCClientImport = j.importSpecifier(
          j.identifier('createTRPCClient'),
        );
        path.node.specifiers?.push(createTRPCClientImport);
      });

    // Replace trpc import with TRPCProvider
    root
      .find(j.ImportSpecifier, {
        imported: { name: trpcImportName },
      })
      .forEach((path) => {
        path.node.name = j.identifier('TRPCProvider');
      });
  }

  return dirtyFlag ? root.toSource() : undefined;
}

export const parser = 'tsx';
