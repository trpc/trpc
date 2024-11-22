import type {
  API,
  ArrowFunctionExpression,
  ASTPath,
  FileInfo,
  FunctionDeclaration,
  Options,
} from 'jscodeshift';

interface TransformOptions extends Options {
  trpcFile?: string;
  trpcImportName?: string;
}

const hookToOptions = {
  useQuery: { lib: '@tanstack/react-query', fn: 'queryOptions' },
  useSuspenseQuery: { lib: '@tanstack/react-query', fn: 'queryOptions' },
  useInfiniteQuery: {
    lib: '@tanstack/react-query',
    fn: 'infiniteQueryOptions',
  },
  useSuspenseInfiniteQuery: {
    lib: '@tanstack/react-query',
    fn: 'infiniteQueryOptions',
  },
  useMutation: { lib: '@tanstack/react-query', fn: 'mutationOptions' },
  useSubscription: {
    lib: '@trpc/tanstack-react-query',
    fn: 'subscriptionOptions',
  },
} as const;

export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions,
) {
  const { trpcFile, trpcImportName } = options;

  const j = api.jscodeshift;
  const root = j(file.source);
  let dirtyFlag = false;

  function addUseTRPCToFunction(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
  ) {
    const body = j.BlockStatement.check(path.node.body)
      ? path.node.body.body
      : [path.node.body];

    body.unshift(
      j.variableDeclaration('const', [
        j.variableDeclarator(
          j.identifier(trpcImportName),
          j.callExpression(j.identifier('useTRPC'), []),
        ),
      ]),
    );
    dirtyFlag = true;
  }

  function ensureImported(lib: string, specifier: string) {
    // Upsert RQ import
    if (
      root
        .find(j.ImportDeclaration, {
          source: { value: lib },
        })
        .find(j.ImportSpecifier, { imported: { name: specifier } })
        .size() === 0
    ) {
      root
        .find(j.ImportDeclaration)
        .at(-1)
        .insertAfter(
          j.importDeclaration(
            [j.importSpecifier(j.identifier(specifier))],
            j.literal(lib),
          ),
        );
      dirtyFlag = true;
    }
  }

  // Update trpc import to useTRPC - skip if it's `trpc.createClient`
  root
    .find(j.ImportDeclaration, { source: { value: trpcFile } })
    .forEach((path) => {
      const trpcSpecifier = path.node.specifiers?.find((specifier) => {
        return (
          j.ImportSpecifier.check(specifier) &&
          specifier.imported.name === trpcImportName
        );
      });

      if (trpcSpecifier) {
        path.node.specifiers = path.node.specifiers?.map((specifier) => {
          if (
            j.ImportSpecifier.check(specifier) &&
            specifier.imported.name === trpcImportName
          ) {
            return j.importSpecifier(j.identifier('useTRPC'));
          }
          return specifier;
        });
        dirtyFlag = true;
      }
    });

  root.find(j.FunctionDeclaration).forEach((path) => {
    const usesTrpc =
      j(path).find(j.Identifier, { name: trpcImportName }).size() > 0;

    if (usesTrpc) {
      addUseTRPCToFunction(path);
    }
  });

  root.find(j.ArrowFunctionExpression).forEach((path) => {
    const usesTrpc =
      j(path)
        .find(j.MemberExpression, {
          object: { name: trpcImportName },
          property: { name: (name: string) => name !== 'createClient' },
        })
        .size() > 0;
    if (usesTrpc) {
      addUseTRPCToFunction(path);
    }
  });

  // REplace proxy-hooks with useX(options())
  for (const [hook, { fn, lib }] of Object.entries(hookToOptions)) {
    root
      .find(j.CallExpression, {
        callee: {
          property: { name: hook },
          object: { object: { object: { name: 'trpc' } } },
        },
      })
      .forEach((path) => {
        const memberExpr = path.node.callee;
        memberExpr.property.name = fn;

        const useQueryFunction = j.callExpression(j.identifier(hook), [
          path.node,
        ]);
        j(path).replaceWith(useQueryFunction);

        ensureImported(lib, hook);
        dirtyFlag = true;
      });
  }

  // Remove suspense query destructuring
  root.find(j.VariableDeclaration).forEach((path) => {
    const declarator = j.VariableDeclarator.check(path.node.declarations[0])
      ? path.node.declarations[0]
      : null;

    if (
      !j.CallExpression.check(declarator?.init) ||
      !j.Identifier.check(declarator.init.callee) ||
      declarator.init.callee.name !== 'useSuspenseQuery'
    ) {
      return;
    }

    const tuple = j.ArrayPattern.check(declarator?.id) ? declarator.id : null;
    const dataName = j.Identifier.check(tuple?.elements?.[0])
      ? tuple.elements[0].name
      : null;
    const queryName = j.Identifier.check(tuple?.elements?.[1])
      ? tuple.elements[1].name
      : null;

    if (declarator && dataName && queryName) {
      declarator.id = j.identifier(queryName);
      j(path).insertAfter(
        j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier(dataName),
            j.memberExpression(j.identifier(queryName), j.identifier('data')),
          ),
        ]),
      );
    }
  });

  return dirtyFlag ? root.toSource() : undefined;
}

export const parser = 'tsx';

// https://go.codemod.com/ddX54TM
