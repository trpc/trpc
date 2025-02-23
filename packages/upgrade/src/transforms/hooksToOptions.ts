/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-console */
import type {
  API,
  ArrowFunctionExpression,
  ASTPath,
  CallExpression,
  FileInfo,
  FunctionDeclaration,
  Identifier,
  MemberExpression,
  Options,
} from 'jscodeshift';
import { replaceMemberExpressionRootIndentifier } from '../lib/ast/modifiers';
import { findParentOfType } from '../lib/ast/walkers';

interface TransformOptions extends Options {
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

/**
 * Map old proxy method to queryClient method
 * 1st item is the queryClient method, 2nd item is the filter/key method to use
 */
const utilMap = {
  fetch: ['fetchQuery', 'queryOptions'],
  fetchInfinite: ['fetchInfiniteQuery', 'infiniteQueryOptions'],
  prefetch: ['prefetchQuery', 'queryOptions'],
  prefetchInfinite: ['prefetchInfiniteQuery', 'infiniteQueryOptions'],
  ensureData: ['ensureQueryData', 'queryOptions'],
  invalidate: ['invalidateQueries', 'DYNAMIC_FILTER'],
  reset: ['resetQueries', 'DYNAMIC_FILTER'],
  refetch: ['refetchQueries', 'DYNAMIC_FILTER'],
  cancel: ['cancelQueries', 'DYNAMIC_FILTER'],
  setData: ['setQueryData', 'queryKey'],
  setInfiniteData: ['setQueryData', 'infiniteQueryKey'],
  getData: ['getQueryData', 'queryKey'],
  getInfiniteData: ['getQueryData', 'infiniteQueryKey'],
  // setMutationDefaults: 'setMutationDefaults',
  // getMutationDefaults: 'getMutationDefaults',
  // isMutating: 'isMutating',
} as const;
type ProxyMethod = keyof typeof utilMap;

export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions,
) {
  const { trpcImportName } = options;
  if (!trpcImportName) {
    throw new Error('trpcImportName is required');
  }

  const j = api.jscodeshift;
  const root = j(file.source);
  let dirtyFlag = false;

  // Traverse all functions, and _do stuff_
  root.find(j.FunctionDeclaration).forEach((path) => {
    replaceHooksWithOptions(path);
    removeSuspenseDestructuring(path);
    migrateUseUtils(path);
  });
  root.find(j.ArrowFunctionExpression).forEach((path) => {
    replaceHooksWithOptions(path);
    removeSuspenseDestructuring(path);
    migrateUseUtils(path);
  });

  if (dirtyFlag) {
    updateTRPCImport();
  }

  /**
   * === HELPER FUNCTIONS BELOW ===
   */

  function isDeclarationInScope(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
    name: string,
  ) {
    return (
      j(path)
        .find(j.VariableDeclarator, {
          id: {
            type: 'Identifier',
            name,
          },
        })
        .size() > 0
    );
  }

  function ensureUseTRPCCall(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
  ) {
    // Check if trpc is already declared in scope
    if (isDeclarationInScope(path, trpcImportName!)) {
      return;
    }

    const variableDeclaration = j.variableDeclaration('const', [
      j.variableDeclarator(
        j.identifier(trpcImportName!),
        j.callExpression(j.identifier('useTRPC'), []),
      ),
    ]);

    if (j.FunctionDeclaration.check(path.node)) {
      path.node.body.body.unshift(variableDeclaration);
      dirtyFlag = true;
    } else if (j.BlockStatement.check(path.node.body)) {
      path.node.body.body.unshift(variableDeclaration);
      dirtyFlag = true;
    }
  }

  function updateTRPCImport() {
    const specifier = root.find(j.ImportSpecifier, {
      imported: { name: trpcImportName },
    });
    if (specifier.size() > 0) {
      specifier.replaceWith(j.importSpecifier(j.identifier('useTRPC')));
      dirtyFlag = true;
    }
  }

  function ensureImported(lib: string, specifier: string) {
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

  function replaceHooksWithOptions(
    fnPath: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
  ) {
    // REplace proxy-hooks with useX(options())
    for (const [hook, { fn, lib }] of Object.entries(hookToOptions)) {
      j(fnPath)
        .find(j.CallExpression, {
          callee: {
            property: { name: hook },
          },
        })
        .forEach((path) => {
          const memberExpr = path.node.callee as MemberExpression;
          if (
            !j.MemberExpression.check(memberExpr) ||
            !j.Identifier.check(memberExpr.property)
          ) {
            console.warn('Failed to identify hook call expression', path.node);
            return;
          }

          // Rename the hook to the options function
          memberExpr.property.name = fn;

          ensureUseTRPCCall(fnPath);

          // Wrap it in the hook call
          j(path).replaceWith(
            j.callExpression(j.identifier(hook), [path.node]),
          );
          ensureImported(lib, hook);

          dirtyFlag = true;
        });
    }
  }

  // Migrate trpc.useUtils() to useQueryClient()
  function migrateUseUtils(
    fnPath: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
  ) {
    j(fnPath)
      .find(j.CallExpression, {
        callee: {
          property: {
            name: (name: string) => ['useContext', 'useUtils'].includes(name),
          },
        },
      })
      .forEach((path) => {
        const isTRPCContextUtil =
          j.MemberExpression.check(path.value.callee) &&
          j.Identifier.check(path.value.callee.object) &&
          path.value.callee.object.name == trpcImportName;

        if (
          isTRPCContextUtil &&
          j.VariableDeclarator.check(path.parentPath.node) &&
          j.Identifier.check(path.parentPath.node.id)
        ) {
          const oldIdentifier = path.parentPath.node.id as Identifier;

          // Find all the references to `utils` and replace with `queryClient[helperMap](trpc.PATH.pathFilter())`
          root
            .find(j.Identifier, { name: oldIdentifier.name })
            .forEach((path) => {
              if (j.MemberExpression.check(path.parent?.parent?.node)) {
                const callExprPath = findParentOfType<CallExpression>(
                  path.parentPath,
                  j.CallExpression,
                );
                if (!callExprPath) {
                  console.warn(
                    `Failed to walk up the tree to find utilMethod call expression, on file: ${file.path}`,
                    callExprPath,
                    { start: path.node.loc?.start, end: path.node.loc?.end },
                  );
                  return;
                }
                const callExpr = callExprPath.node;
                const memberExpr = callExpr.callee as MemberExpression;
                if (
                  !j.CallExpression.check(callExpr) ||
                  !j.MemberExpression.check(memberExpr)
                ) {
                  console.warn(
                    `Failed to walk up the tree to find utilMethod with a \`trpc.PATH.<call>\`, on file: ${file.path}`,
                    callExpr,
                    { start: path.node.loc?.start, end: path.node.loc?.end },
                  );
                  return;
                }

                if (
                  !(
                    j.MemberExpression.check(memberExpr.object) &&
                    j.Identifier.check(memberExpr.property) &&
                    memberExpr.property.name in utilMap
                  )
                ) {
                  console.warn(
                    'Failed to identify utilMethod from proxy call expression',
                    memberExpr,
                  );
                  return;
                }

                // Replace util.PATH.proxyMethod()
                const proxyMethod = memberExpr.property.name as ProxyMethod;
                const replacedPath = replaceMemberExpressionRootIndentifier(
                  j,
                  memberExpr,
                  j.identifier(trpcImportName),
                );
                if (!replacedPath) {
                  console.warn(
                    'Failed to wrap proxy call expression',
                    memberExpr,
                  );
                }

                /**
                 * If no input, use pathFilter
                 * If input is undefined, use pathFilter
                 * If input has cursor, use infiniteQueryFilter
                 * Otherwise, use queryFilter
                 */
                const preferedFilter = utilMap[proxyMethod][1];
                const isNoArgs = !callExpr.arguments.length;
                const isUndefindInputArg =
                  callExpr.arguments.length > 0 &&
                  j.Identifier.check(callExpr.arguments[0]) &&
                  callExpr.arguments[0].name === 'undefined';

                let argToForward: any = undefined;

                if (preferedFilter !== 'DYNAMIC_FILTER') {
                  if (
                    proxyMethod === 'setData' ||
                    proxyMethod === 'setInfiniteData'
                  ) {
                    // First arg goes into queryKey(), second is forwarded to the wrapped method
                    // We can omit the first arg if it's undefined
                    argToForward = callExpr.arguments[1];
                    if (callExpr.arguments[0] && !isUndefindInputArg) {
                      callExpr.arguments = [callExpr.arguments[0]];
                    } else {
                      callExpr.arguments = [];
                    }
                  }

                  memberExpr.property = j.identifier(preferedFilter);
                } else if (isNoArgs || isUndefindInputArg) {
                  memberExpr.property = j.identifier('pathFilter');

                  if (isUndefindInputArg) {
                    callExpr.arguments.shift();
                  }
                } else if (j.ObjectExpression.check(callExpr.arguments[0])) {
                  if (
                    callExpr.arguments[0].properties.find(
                      (p) =>
                        j.ObjectProperty.check(p) &&
                        j.Identifier.check(p.key) &&
                        p.key.name === 'cursor',
                    )
                  ) {
                    memberExpr.property = j.identifier('infiniteQueryFilter');
                  } else {
                    memberExpr.property = j.identifier('queryFilter');
                  }
                }

                // Wrap it in queryClient.utilMethod()
                callExprPath.replace(
                  j.memberExpression(
                    j.identifier('queryClient'),
                    j.callExpression(j.identifier(utilMap[proxyMethod][0]), [
                      callExpr,
                      ...(argToForward ? [argToForward] : []),
                    ]),
                  ),
                );

                ensureUseTRPCCall(fnPath);
              }
            });

          // Replace `const utils = trpc.useUtils()` with `const queryClient = useQueryClient()`
          // If `queryClient` is already declared, just remove the utils declaration
          if (isDeclarationInScope(fnPath, 'queryClient')) {
            j(path).remove();
            j(path.parentPath).remove();
          } else {
            j(path).replaceWith(
              j.callExpression(j.identifier('useQueryClient'), []),
            );
            path.parentPath.node.id = j.identifier('queryClient');
            ensureImported('@tanstack/react-query', 'useQueryClient');
          }
        }

        dirtyFlag = true;
      });
  }

  function removeSuspenseDestructuring(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
  ) {
    // Remove suspense query destructuring
    j(path)
      .find(j.VariableDeclaration)
      .forEach((path) => {
        const declarator = j.VariableDeclarator.check(path.node.declarations[0])
          ? path.node.declarations[0]
          : null;

        if (
          !j.CallExpression.check(declarator?.init) ||
          !j.Identifier.check(declarator.init.callee) ||
          !['useSuspenseQuery', 'useSuspenseInfiniteQuery'].includes(
            declarator.init.callee.name,
          )
        ) {
          return;
        }

        const tuple = j.ArrayPattern.check(declarator?.id)
          ? declarator.id
          : null;
        const dataName = j.Identifier.check(tuple?.elements?.[0])
          ? tuple.elements[0].name
          : null;
        const queryName = j.Identifier.check(tuple?.elements?.[1])
          ? tuple.elements[1].name
          : null;

        if (queryName) {
          declarator.id = j.identifier(queryName);
          dirtyFlag = true;

          if (dataName) {
            j(path).insertAfter(
              j.variableDeclaration('const', [
                j.variableDeclarator(
                  j.identifier(dataName),
                  j.memberExpression(declarator.id, j.identifier('data')),
                ),
              ]),
            );
          }
        } else if (dataName) {
          // const [dataName] = ... => const { data: dataName } = ...
          declarator.id = j.objectPattern([
            j.property('init', j.identifier('data'), j.identifier(dataName)),
          ]);
          dirtyFlag = true;
        }
      });
  }

  return dirtyFlag ? root.toSource() : undefined;
}

export const parser = 'tsx';
