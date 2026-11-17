import type {
  API,
  ASTPath,
  CallExpression,
  Collection,
  FileInfo,
  Options,
  Statement,
  TSTypeParameterInstantiation,
  VariableDeclaration,
} from 'jscodeshift';
import {
  addTodo,
  ensureNamedImport,
  isValueReference,
  quoteOf,
  replaceImportedName,
  type ExpressionKind,
} from '../lib/ast/codemod';

interface TransformOptions extends Options {
  trpcImportName?: string;
}

const nextDocs =
  'https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext';

/**
 * Codemod that replaces `createTRPCReact` and `createTRPCNext` with
 * `createTRPCContext` from `@trpc/tanstack-react-query`:
 *
 * - `trpc.Provider` becomes `TRPCProvider`, and `trpc.createClient()`
 *   `createTRPCClient()`.
 * - `createTRPCNext`'s `config` moves into a `makeTRPCClient()`, and its
 *   `withTRPC` into a `withTRPC()` the same file exports, which `_app` uses
 *   in place of `trpc.withTRPC()`.
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
  let routerType: TSTypeParameterInstantiation | null = null;

  migrateCreateTRPCReact(root);
  migrateCreateTRPCNext(root);
  migrateProviderUsage(root);
  migrateWithTRPCUsage(root);

  return changed ? root.toSource({ quote: quoteOf(file.source) }) : undefined;

  function todoComment(message: string) {
    return j.commentLine(` TODO(@trpc/upgrade): ${message}`, true, false);
  }

  function trpcDeclarations(collection: Collection, factory: string) {
    return collection
      .find(j.VariableDeclarator, {
        id: { type: 'Identifier', name: trpcName },
        init: { type: 'CallExpression', callee: { name: factory } },
      })
      .paths();
  }

  function contextPattern(names: readonly string[]) {
    return j.objectPattern(
      names.map((name) =>
        j.objectProperty.from({
          key: j.identifier(name),
          value: j.identifier(name),
          shorthand: true,
        }),
      ),
    );
  }

  function routerTypeArguments(call: CallExpression) {
    const node = call as CallExpression & {
      typeParameters?: TSTypeParameterInstantiation;
      typeArguments?: TSTypeParameterInstantiation;
    };
    return node.typeParameters ?? node.typeArguments ?? null;
  }

  /** `createTRPCContext<AppRouter>()`, keeping only the router type. */
  function createContextCall(call: CallExpression) {
    const typeArgs = routerTypeArguments(call);
    const next = j.callExpression(j.identifier('createTRPCContext'), []);
    if (typeArgs?.params[0]) {
      routerType = j.tsTypeParameterInstantiation([typeArgs.params[0]]);
      (next as { typeParameters?: unknown }).typeParameters = routerType;
    }
    return next;
  }

  function moveImport(from: string, oldName: string) {
    root
      .find(j.ImportDeclaration, { source: { value: from } })
      .forEach((path) => {
        path.node.specifiers = (path.node.specifiers ?? []).filter(
          (s) => !(j.ImportSpecifier.check(s) && s.imported.name === oldName),
        );
        if (path.node.specifiers.length === 0) {
          j(path).remove();
        }
      });
    ensureNamedImport(
      { j, root },
      {
        source: '@trpc/tanstack-react-query',
        name: 'createTRPCContext',
        typeOnly: false,
      },
    );
  }

  // `export const trpc = createTRPCReact<AppRouter>()`
  // → `export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>()`
  function migrateCreateTRPCReact(collection: Collection) {
    for (const path of trpcDeclarations(collection, 'createTRPCReact')) {
      const call = path.node.init as CallExpression;
      path.node.id = contextPattern([
        'TRPCProvider',
        'useTRPC',
        'useTRPCClient',
      ]);
      path.node.init = createContextCall(call);
      if (call.arguments.length > 0) {
        addTodo(
          j,
          path,
          'createTRPCReact options, such as `overrides` or `abortOnUnmount`, have no direct replacement, see https://trpc.io/docs/client/tanstack-react-query/migrating',
        );
      }
      moveImport('@trpc/react-query', 'createTRPCReact');
      changed = true;
    }
  }

  // `export const trpc = createTRPCNext<AppRouter>({ config, ssr, transformer })`
  // → `createTRPCContext`, `makeTRPCClient`, `makeQueryClient` and `withTRPC`
  function migrateCreateTRPCNext(collection: Collection) {
    for (const path of trpcDeclarations(collection, 'createTRPCNext')) {
      const call = path.node.init as CallExpression;
      const opts = j.ObjectExpression.check(call.arguments[0])
        ? call.arguments[0]
        : null;
      const declaration = path.parent as ASTPath<VariableDeclaration>;
      const statement = j.ExportNamedDeclaration.check(declaration.parent?.node)
        ? (declaration.parent as ASTPath)
        : (declaration as ASTPath);
      if (!opts || declaration.node.declarations.length !== 1) {
        addTodo(j, path, `move from createTRPCNext by hand, see ${nextDocs}`);
        changed = true;
        continue;
      }

      const option = (name: string) =>
        opts.properties.find(
          (p) =>
            (j.ObjectProperty.check(p) ||
              j.Property.check(p) ||
              j.ObjectMethod.check(p)) &&
            j.Identifier.check(p.key) &&
            p.key.name === name,
        );
      const valueOf = (name: string): ExpressionKind | null => {
        const p = option(name);
        if (!p) return null;
        if (j.ObjectMethod.check(p)) {
          return j.functionExpression(
            null,
            p.params,
            p.body,
            p.generator,
            p.async,
          );
        }
        return (p as { value: ExpressionKind }).value;
      };

      const config = valueOf('config');
      const transformer = valueOf('transformer');
      const ssr = valueOf('ssr');
      const usesSSR = !(
        !ssr ||
        ((j.BooleanLiteral.check(ssr) || j.Literal.check(ssr)) &&
          (ssr as { value: unknown }).value === false)
      );

      const routerTypeText = (() => {
        const typeArgs = routerTypeArguments(call);
        return typeArgs?.params[0]
          ? j(typeArgs.params[0] as never).toSource()
          : null;
      })();
      const routerGeneric = routerTypeText ? `<${routerTypeText}>` : '';

      // The original `config`, as a function `makeTRPCClient` calls
      const statements: Statement[] = [];
      const exported = (code: string) =>
        withoutLocations(
          j(code).find(j.Program).get().node.body as Statement[],
        );

      statements.push(
        ...exported(
          `export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext${routerGeneric}();`,
        ),
      );

      let hasQueryClientConfig = false;
      // `getConfig`, unless the file has one, e.g. from `next/config`
      const configName =
        root.find(j.Identifier, { name: 'getConfig' }).size() > 0
          ? 'getTRPCConfig'
          : 'getConfig';
      let configCall = `${configName}()`;
      if (config) {
        const configFunction =
          j.FunctionExpression.check(config) ||
          j.ArrowFunctionExpression.check(config)
            ? config
            : null;
        if (configFunction) {
          j(configFunction)
            .find(j.ObjectProperty, { key: { name: 'queryClientConfig' } })
            .forEach(() => {
              hasQueryClientConfig = true;
            });
          const [param] = configFunction.params;
          const body = j.BlockStatement.check(configFunction.body)
            ? configFunction.body
            : j.blockStatement([j.returnStatement(configFunction.body)]);
          const fn = j.functionDeclaration(j.identifier(configName), [], body);
          if (
            param &&
            (j.Identifier.check(param) || j.ObjectPattern.check(param))
          ) {
            const typed = param;
            typed.typeAnnotation = j.tsTypeAnnotation(
              j.tsTypeLiteral([
                (() => {
                  const ctx = j.tsPropertySignature(
                    j.identifier('ctx'),
                    j.tsTypeAnnotation(
                      j.tsTypeReference(j.identifier('NextPageContext')),
                    ),
                  );
                  ctx.optional = true;
                  return ctx;
                })(),
              ]),
            );
            fn.params = [typed];
            configCall = `${configName}({})`;
            ensureNamedImport(
              { j, root },
              { source: 'next', name: 'NextPageContext', typeOnly: true },
            );
          }
          fn.comments = [
            j.commentBlock(
              '*\n * Was `config` in `createTRPCNext`. It runs in the browser, so `ctx` is\n * always undefined.\n ',
              true,
              false,
            ),
          ];
          statements.push(fn);
          statements.push(
            ...exported(
              `export function makeTRPCClient() {\n  return createTRPCClient${routerGeneric}({ links: ${configCall}.links });\n}`,
            ),
          );
          j(configFunction)
            .find(j.ObjectProperty, { key: { name: 'abortOnUnmount' } })
            .forEach((p) =>
              addTodo(
                j,
                p,
                'pass `trpc: { abortOnUnmount: true }` to each query instead, see https://trpc.io/docs/client/tanstack-react-query/migrating#migrating-abortonunmount',
              ),
            );
        } else {
          statements.push(
            ...exported(
              `export function makeTRPCClient() {\n  return createTRPCClient${routerGeneric}({ links: CONFIG.links });\n}`,
            ),
          );
          j(statements.at(-1) as never)
            .find(j.Identifier, { name: 'CONFIG' })
            .replaceWith(() => config);
        }
      } else {
        statements.push(
          ...exported(
            `// TODO(@trpc/upgrade): add your links\nexport function makeTRPCClient() {\n  return createTRPCClient${routerGeneric}({ links: [] });\n}`,
          ),
        );
      }

      statements.push(
        ...exported(
          `export function makeQueryClient() {\n  return new QueryClient(${hasQueryClientConfig ? `${configCall}.queryClientConfig` : ''});\n}`,
        ),
      );

      // Classic `withTRPC` ran `trpcState` through the transformer.
      const transformerSource = transformer ? j(transformer).toSource() : null;
      const hydrationState = transformerSource
        ? `(pageProps?.trpcState === undefined ? undefined : ${transformerSource}.deserialize(pageProps.trpcState as Parameters<typeof ${transformerSource}.deserialize>[0])) as DehydratedState | undefined`
        : 'pageProps?.trpcState as DehydratedState | undefined';
      statements.push(
        ...exported(
          `/**
 * Was \`trpc.withTRPC\`. Provides the tRPC and query clients to the app, and
 * hydrates the \`trpcState\` a page's \`getStaticProps\` or
 * \`getServerSideProps\` returns.
 */
export function withTRPC<TInitialProps extends object>(
  App: AppType<TInitialProps>,
): AppType<TInitialProps> {
  const WithTRPC: AppType<TInitialProps> = (props) => {
    const [queryClient] = useState(makeQueryClient);
    const [trpcClient] = useState(makeTRPCClient);
    const pageProps = props.pageProps as { trpcState?: unknown } | undefined;
    return createElement(QueryClientProvider, {
      client: queryClient,
      children: createElement(TRPCProvider, {
        trpcClient,
        queryClient,
        children: createElement(HydrationBoundary, {
          state: ${hydrationState},
          children: createElement(App, props),
        }),
      }),
    });
  };
  WithTRPC.getInitialProps = App.getInitialProps;
  return WithTRPC;
}`,
        ),
      );
      // Keep the comments above `export const trpc = …`
      const first = statements[0] as { comments?: unknown[] };
      first.comments = [
        ...((statement.node as { comments?: unknown[] }).comments ?? []),
        ...(usesSSR
          ? [
              todoComment(
                "createTRPCNext had `ssr: true`, which has no replacement. Prefetch each page's queries in `getServerSideProps` instead, see https://trpc.io/docs/client/nextjs/pages-router/ssr",
              ),
            ]
          : []),
        ...(option('responseMeta')
          ? [
              todoComment(
                'set the status and headers in `getServerSideProps` instead of `responseMeta`, see https://trpc.io/docs/client/nextjs/pages-router/ssr',
              ),
            ]
          : []),
      ];
      j(statement).replaceWith(() => statements);

      for (const [source, name] of [
        ['@trpc/client', 'createTRPCClient'],
        ['@tanstack/react-query', 'QueryClient'],
        ['@tanstack/react-query', 'QueryClientProvider'],
        ['@tanstack/react-query', 'HydrationBoundary'],
        ['react', 'createElement'],
        ['react', 'useState'],
      ] as const) {
        ensureNamedImport(
          { j, root },
          { source: source, name: name, typeOnly: false },
        );
      }
      ensureNamedImport(
        { j, root },
        { source: 'next/app', name: 'AppType', typeOnly: true },
      );
      ensureNamedImport(
        { j, root },
        {
          source: '@tanstack/react-query',
          name: 'DehydratedState',
          typeOnly: true,
        },
      );
      moveImport('@trpc/next', 'createTRPCNext');
      // `ssrPrepass` only worked with `ssr: true`
      root
        .find(j.ImportDeclaration, {
          source: { value: '@trpc/next/ssrPrepass' },
        })
        .remove();
      root.find(j.ObjectProperty, { key: { name: 'ssrPrepass' } }).remove();
      changed = true;
    }
  }

  // `<trpc.Provider client={c}>` → `<TRPCProvider trpcClient={c}>`,
  // `trpc.createClient(opts)` → `createTRPCClient<AppRouter>(opts)`
  function migrateProviderUsage(collection: Collection) {
    let used = false;
    collection
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { name: trpcName },
          property: { name: 'createClient' },
        },
      })
      .forEach((path) => {
        const next = j.callExpression(
          j.identifier('createTRPCClient'),
          path.node.arguments,
        );
        if (routerType) {
          (next as { typeParameters?: unknown }).typeParameters = routerType;
        } else {
          addTodo(
            j,
            path,
            'add your router type: `createTRPCClient<AppRouter>()`',
          );
        }
        path.replace(next);
        ensureNamedImport(
          { j, root },
          { source: '@trpc/client', name: 'createTRPCClient', typeOnly: false },
        );
        used = true;
      });

    collection
      .find(j.JSXElement, {
        openingElement: {
          name: {
            type: 'JSXMemberExpression',
            object: { name: trpcName },
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
        used = true;
      });

    if (used) {
      changed = true;
      replaceImportedName(
        { j, root },
        {
          oldName: trpcName,
          newNames: ['TRPCProvider'],
          keepOld: stillUsesTRPC(),
        },
      );
    }
  }

  // `export default trpc.withTRPC(MyApp)` → `export default withTRPC(MyApp)`
  function migrateWithTRPCUsage(collection: Collection) {
    let used = false;
    collection
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { name: trpcName },
          property: { name: 'withTRPC' },
        },
      })
      .forEach((path) => {
        path.node.callee = j.identifier('withTRPC');
        used = true;
      });
    if (used) {
      changed = true;
      replaceImportedName(
        { j, root },
        { oldName: trpcName, newNames: ['withTRPC'], keepOld: stillUsesTRPC() },
      );
    }
  }

  function stillUsesTRPC() {
    return (
      root
        .find(j.Identifier, { name: trpcName })
        .filter((p) => isValueReference(j, p))
        .size() > 0
    );
  }
}

/**
 * Statements parsed from a template keep the template's source locations,
 * which break printing them into another file. Drops them, so they print
 * fresh.
 */
function withoutLocations<T>(value: T): T {
  const seen = new Set<unknown>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) {
      return;
    }
    seen.add(node);
    const record = node as Record<string, unknown>;
    if ('type' in record) {
      record['loc'] = null;
      // Some of these are read-only on some nodes; skip those
      for (const key of ['start', 'end', 'tokens', 'original']) {
        Reflect.deleteProperty(record, key);
      }
    }
    for (const child of Object.values(record)) {
      visit(child);
    }
  };
  visit(value);
  return value;
}

export const parser = 'tsx';
