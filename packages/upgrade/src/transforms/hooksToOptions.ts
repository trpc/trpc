import type {
  API,
  ASTPath,
  Collection,
  FileInfo,
  Identifier,
  MemberExpression,
  Options,
} from 'jscodeshift';
import {
  addTodo,
  declaresAtTop,
  ensureDeclaredAtTop,
  ensureNamedImport,
  findHookScope,
  insertAfterDeclarator,
  isInside,
  isShadowed,
  isValueReference,
  paramBindings,
  quoteOf,
  replaceImportedName,
  rootIdentifierName,
  uniqueName,
  type ExpressionKind,
  type FunctionNode,
} from '../lib/ast/codemod';

interface TransformOptions extends Options {
  trpcImportName?: string;
}

/** `trpc.a.useX(…)` → `useX(trpc.a.fn(…))`, with `useX` from `lib`. */
const hookToOptions = {
  useQuery: { lib: '@tanstack/react-query', fn: 'queryOptions' },
  useSuspenseQuery: { lib: '@tanstack/react-query', fn: 'queryOptions' },
  usePrefetchQuery: { lib: '@tanstack/react-query', fn: 'queryOptions' },
  useInfiniteQuery: {
    lib: '@tanstack/react-query',
    fn: 'infiniteQueryOptions',
  },
  useSuspenseInfiniteQuery: {
    lib: '@tanstack/react-query',
    fn: 'infiniteQueryOptions',
  },
  usePrefetchInfiniteQuery: {
    lib: '@tanstack/react-query',
    fn: 'infiniteQueryOptions',
  },
  useMutation: { lib: '@tanstack/react-query', fn: 'mutationOptions' },
  useSubscription: {
    lib: '@trpc/tanstack-react-query',
    fn: 'subscriptionOptions',
  },
} as const;
type HookName = keyof typeof hookToOptions;

/**
 * `utils.a.<method>(…)` → `queryClient.<queryClientMethod>(trpc.a.<arg>(…))`.
 * `options` passes all the arguments to an options factory, `filter` and
 * `key` take the input first.
 */
const utilMap = {
  fetch: { method: 'fetchQuery', kind: 'options', fn: 'queryOptions' },
  prefetch: { method: 'prefetchQuery', kind: 'options', fn: 'queryOptions' },
  ensureData: {
    method: 'ensureQueryData',
    kind: 'options',
    fn: 'queryOptions',
  },
  fetchInfinite: {
    method: 'fetchInfiniteQuery',
    kind: 'options',
    fn: 'infiniteQueryOptions',
  },
  prefetchInfinite: {
    method: 'prefetchInfiniteQuery',
    kind: 'options',
    fn: 'infiniteQueryOptions',
  },
  invalidate: { method: 'invalidateQueries', kind: 'filter', fn: null },
  refetch: { method: 'refetchQueries', kind: 'filter', fn: null },
  reset: { method: 'resetQueries', kind: 'filter', fn: null },
  cancel: { method: 'cancelQueries', kind: 'filter', fn: null },
  getData: { method: 'getQueryData', kind: 'key', fn: 'queryKey' },
  setData: { method: 'setQueryData', kind: 'key', fn: 'queryKey' },
  getInfiniteData: {
    method: 'getQueryData',
    kind: 'key',
    fn: 'infiniteQueryKey',
  },
  setInfiniteData: {
    method: 'setQueryData',
    kind: 'key',
    fn: 'infiniteQueryKey',
  },
} as const;
type UtilName = keyof typeof utilMap;

const docs = 'https://trpc.io/docs/client/tanstack-react-query/migrating';

/**
 * Codemod that rewrites `@trpc/react-query` hooks, such as
 * `trpc.post.byId.useQuery()` and `trpc.useUtils()`, to TanStack Query hooks
 * with `@trpc/tanstack-react-query` options. What it can't rewrite safely
 * gets a `TODO(@trpc/upgrade)` comment.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/migrating#codemod-migration
 */
export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions,
) {
  const trpcName = options.trpcImportName ?? 'trpc';
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = false;
  /** Functions that now start with `const trpc = useTRPC()` */
  const scopes = new Set<ASTPath<FunctionNode>>();
  /** Names to import from the module `trpc` came from. */
  const fromTRPCModule = new Set<string>();

  const isTRPCPath = (node: ExpressionKind) =>
    j.MemberExpression.check(node) && rootIdentifierName(j, node) === trpcName;

  function useTRPCIn(scope: ASTPath<FunctionNode>) {
    ensureDeclaredAtTop(j, scope, { name: trpcName, init: 'useTRPC' });
    fromTRPCModule.add('useTRPC');
    scopes.add(scope);
  }

  /** Imports `name` from `lib` and returns the local name to call it by. */
  function importFrom(lib: string, name: string) {
    return ensureNamedImport(
      { j, root },
      { source: lib, name, typeOnly: false },
    );
  }

  /** A `TODO(@trpc/upgrade)` comment, which also counts as a change to save. */
  function todo(path: ASTPath, message: string) {
    addTodo(j, path, message);
    changed = true;
  }

  /** `useSuspenseQuery(…)` calls this transform made, to fix their `[data, query]` */
  const migratedSuspenseCalls = new Set<unknown>();

  /** `a.b` → `trpc.a.b`, from property names. */
  function trpcMember(path: readonly string[]): ExpressionKind {
    return path.reduce<ExpressionKind>(
      (object, name) =>
        /^[A-Za-z_$][\w$]*$/.test(name)
          ? j.memberExpression(object, j.identifier(name))
          : j.memberExpression(object, j.stringLiteral(name), true),
      j.identifier(trpcName),
    );
  }

  function isUndefined(node: unknown) {
    return j.Identifier.check(node) && node.name === 'undefined';
  }

  migrateGetQueryKey(root);
  migrateUseUtils(root);
  migrateUseQueries(root);
  migrateHooks(root);
  removeSuspenseDestructuring(root);

  if (!changed) {
    return undefined;
  }

  if (scopes.size > 0) {
    // Keep importing `trpc` if something outside the migrated components
    // still uses it, e.g. `trpc.withTRPC(App)`.
    const leftovers = root
      .find(j.Identifier, { name: trpcName })
      .filter(
        (path) =>
          isValueReference(j, path) &&
          ![...scopes].some((scope) => isInside(path, scope)),
      );
    leftovers.forEach((path) =>
      todo(
        path,
        `\`${trpcName}\` is now \`const ${trpcName} = useTRPC()\` inside components and hooks, see ${docs}`,
      ),
    );
    replaceImportedName(
      { j, root },
      {
        oldName: trpcName,
        newNames: [...fromTRPCModule],
        keepOld: leftovers.size() > 0,
      },
    );
  }

  return root.toSource({ quote: quoteOf(file.source) });

  // `getQueryKey(trpc.a.b, input, type)` → `trpc.a.b.queryKey(input)`
  function migrateGetQueryKey(collection: Collection) {
    collection
      .find(j.CallExpression, { callee: { name: 'getQueryKey' } })
      .forEach((path) => {
        const [procedure, input, type] = path.node.arguments;
        if (!procedure || !isTRPCPath(procedure as ExpressionKind)) {
          return;
        }
        const scope = findHookScope(j, path);
        if (!scope) {
          todo(path, `move this into a component or hook, see ${docs}`);
          return;
        }
        const typeName =
          j.StringLiteral.check(type) || j.Literal.check(type)
            ? String((type as { value: unknown }).value)
            : 'any';
        const hasInput = input && !isUndefined(input);
        if (typeName === 'any' && hasInput) {
          // The classic key matched queries and infinite queries alike
          todo(
            path,
            `use \`trpc.x.queryKey(input)\` or \`trpc.x.infiniteQueryKey(input)\`, see ${docs}`,
          );
          return;
        }
        const fn =
          typeName === 'infinite'
            ? 'infiniteQueryKey'
            : typeName === 'query'
              ? 'queryKey'
              : 'pathKey';
        path.replace(
          j.callExpression(
            j.memberExpression(procedure as ExpressionKind, j.identifier(fn)),
            hasInput && fn !== 'pathKey' ? [input] : [],
          ),
        );
        useTRPCIn(scope);
        changed = true;
      });
    if (
      changed &&
      collection
        .find(j.Identifier, { name: 'getQueryKey' })
        .filter((p) => isValueReference(j, p))
        .size() === 0
    ) {
      collection
        .find(j.ImportSpecifier, { imported: { name: 'getQueryKey' } })
        .forEach((p) => {
          const declaration = p.parent;
          j(p).remove();
          if ((declaration.node.specifiers ?? []).length === 0) {
            j(declaration).remove();
          }
        });
    }
  }

  // `trpc.a.useQuery(input, opts)` → `useQuery(trpc.a.queryOptions(input, opts))`
  function migrateHooks(collection: Collection) {
    collection
      .find(j.CallExpression, {
        callee: { type: 'MemberExpression', property: { type: 'Identifier' } },
      })
      .filter((path) => {
        const callee = path.node.callee as MemberExpression;
        return (
          (callee.property as Identifier).name in hookToOptions &&
          isTRPCPath(callee.object)
        );
      })
      .forEach((path) => {
        const callee = path.node.callee as MemberExpression;
        const hook = (callee.property as Identifier).name as HookName;
        const scope = findHookScope(j, path);
        if (!scope) {
          todo(
            path,
            `\`${hook}\` must be called in a component or hook, see ${docs}`,
          );
          return;
        }
        const { fn, lib } = hookToOptions[hook];
        callee.property = j.identifier(fn);
        const call = j.callExpression(j.identifier(importFrom(lib, hook)), [
          path.node,
        ]);
        if (
          hook === 'useSuspenseQuery' ||
          hook === 'useSuspenseInfiniteQuery'
        ) {
          migratedSuspenseCalls.add(call);
        }
        path.replace(call);
        useTRPCIn(scope);
        changed = true;
      });
  }

  // `trpc.useQueries((t) => [t.a(input)])` → `useQueries({ queries: [trpc.a.queryOptions(input)] })`
  function migrateUseQueries(collection: Collection) {
    collection
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: trpcName },
          property: {
            name: (name: string) =>
              name === 'useQueries' || name === 'useSuspenseQueries',
          },
        },
      })
      .forEach((path) => {
        const hook = (
          (path.node.callee as MemberExpression).property as Identifier
        ).name as 'useQueries' | 'useSuspenseQueries';
        const scope = findHookScope(j, path);
        const [callback, ...rest] = path.node.arguments;
        const param =
          (j.ArrowFunctionExpression.check(callback) ||
            j.FunctionExpression.check(callback)) &&
          j.Identifier.check(callback.params[0])
            ? callback.params[0].name
            : null;
        const body =
          j.ArrowFunctionExpression.check(callback) &&
          !j.BlockStatement.check(callback.body)
            ? callback.body
            : (j.ArrowFunctionExpression.check(callback) ||
                  j.FunctionExpression.check(callback)) &&
                j.BlockStatement.check(callback.body) &&
                callback.body.body.length === 1 &&
                j.ReturnStatement.check(callback.body.body[0])
              ? callback.body.body[0].argument
              : null;
        if (!scope || !param || !body || rest.length > 0) {
          todo(
            path,
            `rewrite \`trpc.${hook}\` as \`${hook}({ queries: [trpc.x.queryOptions(input)] })\`, see ${docs}`,
          );
          return;
        }

        // `t.a.b(input, opts)` → `trpc.a.b.queryOptions(input, opts)`, only
        // if that's all `t` is used for, not e.g. `buildQueries(t)`
        const procedureCalls = j(body)
          .find(j.CallExpression, { callee: { type: 'MemberExpression' } })
          .filter((p) => rootIdentifierName(j, p.node.callee) === param);
        const paramReferences = j(body)
          .find(j.Identifier, { name: param })
          .filter((p) => isValueReference(j, p));
        if (paramReferences.size() !== procedureCalls.size()) {
          todo(
            path,
            `rewrite \`trpc.${hook}\` as \`${hook}({ queries: [trpc.x.queryOptions(input)] })\`, see ${docs}`,
          );
          return;
        }
        procedureCalls.forEach((p) => {
          const callee = p.node.callee as MemberExpression;
          let innermost: MemberExpression = callee;
          while (j.MemberExpression.check(innermost.object)) {
            innermost = innermost.object;
          }
          innermost.object = j.identifier(trpcName);
          p.node.callee = j.memberExpression(
            callee,
            j.identifier('queryOptions'),
          );
        });
        const replacement = j.callExpression(
          j.identifier(importFrom('@tanstack/react-query', hook)),
          [
            j.objectExpression([
              j.objectProperty(j.identifier('queries'), body),
            ]),
          ],
        );
        useTRPCIn(scope);
        changed = true;

        if (hook === 'useQueries') {
          path.replace(replacement);
          return;
        }

        // Classic `useSuspenseQueries` returned `[data, queries]`
        const declarator = path.parent?.node;
        if (
          j.VariableDeclarator.check(declarator) &&
          j.ArrayPattern.check(declarator.id) &&
          declarator.id.elements.every(
            (e) => e === null || j.Identifier.check(e),
          )
        ) {
          const [dataId, queriesId] = declarator.id.elements;
          const queriesName =
            queriesId?.name ?? uniqueName(j, scope, 'queries');
          declarator.id = j.identifier(queriesName);
          path.replace(replacement);
          if (dataId) {
            insertAfterDeclarator(
              j,
              path.parent,
              j.variableDeclaration('const', [
                j.variableDeclarator(
                  j.identifier(dataId.name),
                  j.callExpression(
                    j.memberExpression(
                      j.identifier(queriesName),
                      j.identifier('map'),
                    ),
                    [
                      j.arrowFunctionExpression(
                        [j.identifier('query')],
                        j.memberExpression(
                          j.identifier('query'),
                          j.identifier('data'),
                        ),
                      ),
                    ],
                  ),
                ),
              ]),
            );
          }
          return;
        }
        path.replace(replacement);
        todo(
          path,
          '`useSuspenseQueries` returns the queries now, not `[data, queries]`',
        );
      });
  }

  // `const utils = trpc.useUtils()` → `const queryClient = useQueryClient()`
  function migrateUseUtils(collection: Collection) {
    collection
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: trpcName },
          property: {
            name: (name: string) =>
              name === 'useUtils' || name === 'useContext',
          },
        },
      })
      .forEach((path) => {
        const declarator = path.parent?.node;
        const scope = findHookScope(j, path);
        if (
          !scope ||
          !j.VariableDeclarator.check(declarator) ||
          !j.Identifier.check(declarator.id)
        ) {
          todo(
            path,
            `replace \`trpc.useUtils()\` with \`useQueryClient()\` and \`trpc.x.queryFilter()\`, see ${docs}`,
          );
          return;
        }
        const utilsName = declarator.id.name;
        // A `queryClient` parameter is something else: pick another name
        const paramBindsQueryClient = paramBindings(j, scope.node.params).has(
          'queryClient',
        );
        const reuseQueryClient =
          utilsName !== 'queryClient' &&
          !paramBindsQueryClient &&
          declaresAtTop(j, scope, 'queryClient');
        const queryClientName = paramBindsQueryClient
          ? uniqueName(j, scope, 'queryClient')
          : 'queryClient';

        // `const` and `let` only reach the end of their block, `var` the
        // whole function
        const isVar =
          j.VariableDeclaration.check(path.parent?.parent?.node) &&
          path.parent.parent.node.kind === 'var';
        let declaringBlock: ASTPath = path;
        while (
          declaringBlock.node !== scope.node &&
          (isVar || !j.BlockStatement.check(declaringBlock.node))
        ) {
          declaringBlock = declaringBlock.parent;
        }
        const references = j(declaringBlock)
          .find(j.Identifier, { name: utilsName })
          .filter(
            (p) =>
              p.node !== declarator.id &&
              isValueReference(j, p) &&
              !isShadowed(j, p, { scope, name: utilsName, declarator }),
          )
          .paths()
          // Innermost and last first, so a call inside another's arguments
          // is rewritten before the call around it moves it.
          .sort(
            (a, b) =>
              (b.node.loc?.start.line ?? 0) - (a.node.loc?.start.line ?? 0) ||
              (b.node.loc?.start.column ?? 0) - (a.node.loc?.start.column ?? 0),
          );

        let usesTRPC = false;
        let usesClient = false;
        const dependencyLists: Array<{ elements: unknown[] }> = [];
        for (const reference of references) {
          const parent = reference.parent?.node;
          const result = migrateUtilsReference(
            reference,
            scope,
            queryClientName,
          );
          usesTRPC = result.usesTRPC || usesTRPC;
          usesClient = result.usesClient || usesClient;
          if (result.bare && j.ArrayExpression.check(parent)) {
            dependencyLists.push(parent);
          }
        }
        // `[utils]` also changed when the tRPC client, and so the proxy, did
        for (const name of [
          ...(usesClient ? ['trpcClient'] : []),
          ...(usesTRPC ? [trpcName] : []),
        ]) {
          for (const list of dependencyLists) {
            if (
              !list.elements.some(
                (e) => j.Identifier.check(e) && e.name === name,
              )
            ) {
              list.elements.unshift(j.identifier(name));
            }
          }
        }

        if (reuseQueryClient) {
          // Only this declarator: `const utils = …, other = …` keeps `other`
          const declaration = path.parent.parent.node as {
            declarations: unknown[];
          };
          declaration.declarations = declaration.declarations.filter(
            (d) => d !== declarator,
          );
          if (declaration.declarations.length === 0) {
            j(path.parent.parent).remove();
          }
        } else {
          declarator.id = j.identifier(queryClientName);
          const useQueryClient = importFrom(
            '@tanstack/react-query',
            'useQueryClient',
          );
          path.replace(j.callExpression(j.identifier(useQueryClient), []));
        }
        if (usesTRPC) {
          useTRPCIn(scope);
        } else {
          scopes.add(scope);
        }
        changed = true;
      });
  }

  function migrateUtilsReference(
    reference: ASTPath<Identifier>,
    scope: ASTPath<FunctionNode>,
    queryClientName: string,
  ): { usesTRPC: boolean; usesClient: boolean; bare: boolean } {
    const none = { usesTRPC: false, usesClient: false, bare: false };
    // Walk up `utils.a.b.method` and note the property names.
    const names: string[] = [];
    let top: ASTPath = reference;
    for (;;) {
      const parent = top.parent?.node;
      if (!j.MemberExpression.check(parent) || parent.object !== top.node) {
        break;
      }
      if (!parent.computed && j.Identifier.check(parent.property)) {
        names.push(parent.property.name);
      } else if (
        parent.computed &&
        (j.StringLiteral.check(parent.property) ||
          j.Literal.check(parent.property)) &&
        typeof (parent.property as { value: unknown }).value === 'string'
      ) {
        names.push((parent.property as { value: string }).value);
      } else {
        break;
      }
      top = top.parent;
    }

    if (names.length === 0) {
      // `[utils]` in a dependency list, `doSomething(utils)`
      reference.replace(j.identifier(queryClientName));
      return { ...none, bare: true };
    }

    if (names[0] === 'client') {
      let clientMember: ASTPath = reference;
      clientMember = clientMember.parent;
      clientMember.replace(j.identifier('trpcClient'));
      ensureDeclaredAtTop(j, scope, {
        name: 'trpcClient',
        init: 'useTRPCClient',
      });
      fromTRPCModule.add('useTRPCClient');
      return { ...none, usesClient: true };
    }

    const method = names.at(-1);
    if (method === undefined) {
      return none;
    }
    const call = top.parent?.node;
    const isCall = j.CallExpression.check(call) && call.callee === top.node;
    if (!(method in utilMap) || !isCall) {
      todo(
        reference,
        `\`${['utils', ...names].join('.')}\` has no automatic replacement, see ${docs}`,
      );
      return none;
    }

    const util = utilMap[method as UtilName];
    const procedurePath = names.slice(0, -1);
    const args = call.arguments as ExpressionKind[];
    const queryClientCall = (arg: ExpressionKind, rest: ExpressionKind[]) =>
      j.callExpression(
        j.memberExpression(
          j.identifier(queryClientName),
          j.identifier(util.method),
        ),
        [arg, ...rest],
      );
    const definedArgs = (list: Array<ExpressionKind | undefined>) => {
      const result = [...list];
      while (result.length > 0 && result.at(-1) === undefined) {
        result.pop();
      }
      return result as ExpressionKind[];
    };

    let replacement: ExpressionKind;
    if (util.kind === 'options') {
      if (procedurePath.length === 0) {
        todo(reference, `\`utils.${method}\` needs a procedure, see ${docs}`);
        return none;
      }
      replacement = queryClientCall(
        j.callExpression(
          j.memberExpression(trpcMember(procedurePath), j.identifier(util.fn)),
          args,
        ),
        [],
      );
    } else if (util.kind === 'filter') {
      const [input, filters, queryOptions] = args;
      const noInput = !input || isUndefined(input);
      // An input with a `cursor` is an infinite query's
      const isInfinite =
        j.ObjectExpression.check(input) &&
        input.properties.some(
          (p) =>
            (j.ObjectProperty.check(p) || j.Property.check(p)) &&
            j.Identifier.check(p.key) &&
            p.key.name === 'cursor',
        );
      const filter = noInput
        ? j.callExpression(
            j.memberExpression(
              trpcMember(procedurePath),
              j.identifier('pathFilter'),
            ),
            definedArgs([filters]),
          )
        : j.callExpression(
            j.memberExpression(
              trpcMember(procedurePath),
              j.identifier(isInfinite ? 'infiniteQueryFilter' : 'queryFilter'),
            ),
            definedArgs([input, filters]),
          );
      replacement = queryClientCall(filter, definedArgs([queryOptions]));
    } else {
      if (procedurePath.length === 0) {
        todo(reference, `\`utils.${method}\` needs a procedure, see ${docs}`);
        return none;
      }
      const [input, ...rest] = args;
      const key = j.callExpression(
        j.memberExpression(trpcMember(procedurePath), j.identifier(util.fn)),
        input && !isUndefined(input) ? [input] : [],
      );
      replacement = queryClientCall(key, rest);
    }
    top.parent.replace(replacement);
    return { ...none, usesTRPC: true };
  }

  // `const [data, query] = useSuspenseQuery(…)` → `const query = …; const data = query.data`
  function removeSuspenseDestructuring(collection: Collection) {
    collection.find(j.VariableDeclarator).forEach((path) => {
      const declarator = path.node;
      if (
        !migratedSuspenseCalls.has(declarator.init) ||
        !j.ArrayPattern.check(declarator.id)
      ) {
        return;
      }
      const [dataElement, queryElement] = declarator.id.elements;
      if (j.Identifier.check(queryElement)) {
        declarator.id = j.identifier(queryElement.name);
        if (dataElement) {
          insertAfterDeclarator(
            j,
            path,
            j.variableDeclaration('const', [
              j.variableDeclarator(
                dataElement as Identifier,
                j.memberExpression(
                  j.identifier(queryElement.name),
                  j.identifier('data'),
                ),
              ),
            ]),
          );
        }
      } else if (dataElement && !queryElement) {
        declarator.id = j.objectPattern([
          j.objectProperty.from({
            key: j.identifier('data'),
            value: dataElement as Identifier,
            shorthand:
              j.Identifier.check(dataElement) && dataElement.name === 'data',
          }),
        ]);
      } else {
        return;
      }
      changed = true;
    });
  }
}

export const parser = 'tsx';
