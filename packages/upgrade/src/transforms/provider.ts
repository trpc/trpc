import { dirname, relative } from 'node:path';
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
  isShadowed,
  isValueReference,
  localSetupName,
  printSource,
  replaceImportedName,
  staticKeyName,
  type ExpressionKind,
} from '../lib/ast/codemod';
import type { RouterTypeSource } from '../lib/ast/scanners';

interface TransformOptions extends Options {
  trpcImportName?: string;
  /** From the file with `createTRPCReact<AppRouter>()`, if the CLI found it */
  routerType?: RouterTypeSource | null;
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
  const j = api.jscodeshift;
  const root = j(file.source);
  // The setup file declares it; other files may import it under another name
  const setup = localSetupName({ j, root }, options.trpcImportName ?? 'trpc');
  const trpcName = setup.name;
  let changed = false;
  for (const path of setup.ambiguous) {
    addTodo(
      j,
      path,
      `more than one import looks like your tRPC setup \`${trpcName}\`, migrate this file by hand`,
    );
    changed = true;
  }
  // Which import to migrate is a guess, so migrate none
  if (setup.ambiguous.length > 0) {
    return printSource({ j, root }, file.source);
  }
  let routerType: TSTypeParameterInstantiation | null = null;

  migrateCreateTRPCReact(root);
  migrateCreateTRPCNext(root);
  migrateProviderUsage(root);
  migrateWithTRPCUsage(root);
  flagServerSideHelpers(root);

  return changed ? printSource({ j, root }, file.source) : undefined;

  /**
   * `<AppRouter>`, imported from where the file with `createTRPCReact`
   * imports it, if the CLI found that.
   */
  function importedRouterType(
    at: ASTPath,
  ): TSTypeParameterInstantiation | null {
    const source = options.routerType;
    if (!source) {
      return null;
    }
    let specifier: string;
    if ('specifier' in source) {
      ({ specifier } = source);
    } else if (source.file === file.path) {
      return j.tsTypeParameterInstantiation([
        j.tsTypeReference(j.identifier(source.name)),
      ]);
    } else {
      specifier = relative(dirname(file.path), source.file)
        .replaceAll('\\', '/')
        // Keep `/index`: `./server` could find a `./server.ts` instead
        .replace(/\.d\.[cm]?ts$|\.[cm]?tsx?$/, '');
      specifier = `${specifier.startsWith('.') ? '' : './'}${specifier}${source.extension}`;
    }
    const local = ensureNamedImport(
      { j, root },
      { source: specifier, name: source.name, typeOnly: true, at },
    );
    return j.tsTypeParameterInstantiation([
      j.tsTypeReference(j.identifier(local)),
    ]);
  }

  function todoComment(message: string) {
    return j.commentLine(` TODO(@trpc/upgrade): ${message}`, true, false);
  }

  /**
   * The names the file calls `factory` by: its own, or an alias such as
   * `import { createTRPCReact as createReact } from '@trpc/react-query'`.
   */
  function factoryNames(factory: string): Set<string> {
    const names = new Set([factory]);
    root
      .find(j.ImportDeclaration)
      .filter((p) =>
        /^@trpc\/(react-query|next)$/.test(String(p.node.source.value)),
      )
      .forEach((p) => {
        for (const specifier of p.node.specifiers ?? []) {
          if (
            j.ImportSpecifier.check(specifier) &&
            specifier.imported.name === factory &&
            j.Identifier.check(specifier.local)
          ) {
            names.add(specifier.local.name);
          }
        }
      });
    return names;
  }

  function trpcDeclarations(collection: Collection, factory: string) {
    const names = factoryNames(factory);
    return (
      collection
        .find(j.VariableDeclarator, {
          id: { type: 'Identifier', name: trpcName },
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: (name: string) => names.has(name),
            },
          },
        })
        // A setup is top-level, where nothing can hide the factory's name;
        // inside a function, `createReact` could be a parameter
        .filter((p) => {
          const statement = p.parent?.parent;
          return (
            j.Program.check(statement?.node) ||
            (j.ExportNamedDeclaration.check(statement?.node) &&
              j.Program.check(statement.parent?.node))
          );
        })
        .paths()
    );
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
    // Another `createTRPCNext(…)` in the file still needs it, by any name
    const names = factoryNames(oldName);
    const stillUsed =
      root
        .find(j.Identifier, { name: (name: string) => names.has(name) })
        .filter((p) => isValueReference(j, p))
        .size() > 0;
    root
      .find(j.ImportDeclaration, { source: { value: from } })
      .filter(() => !stillUsed)
      .forEach((path) => {
        path.node.specifiers = (path.node.specifiers ?? []).filter(
          (s) => !(j.ImportSpecifier.check(s) && s.imported.name === oldName),
        );
        if (path.node.specifiers.length === 0) {
          j(path).remove();
        }
      });
    return ensureNamedImport(
      { j, root },
      {
        source: '@trpc/tanstack-react-query',
        name: 'createTRPCContext',
        typeOnly: false,
        at: null,
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
      const contextCall = createContextCall(call);
      path.node.init = contextCall;
      if (call.arguments.length > 0) {
        addTodo(
          j,
          path,
          'createTRPCReact options, such as `overrides` or `abortOnUnmount`, have no direct replacement, see https://trpc.io/docs/client/tanstack-react-query/migrating',
        );
      }
      const createTRPCContext = moveImport(
        '@trpc/react-query',
        'createTRPCReact',
      );
      contextCall.callee = j.identifier(createTRPCContext);
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
      const hasSpread = (opts?.properties ?? []).some(
        (p) => j.SpreadElement.check(p) || j.SpreadProperty.check(p),
      );
      // A spread could hold the transformer or config, which we'd miss
      if (!opts || hasSpread || declaration.node.declarations.length !== 1) {
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
            staticKeyName(j, p) === name,
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
      const transformer = inputTransformer(valueOf('transformer'));
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
      // The generated code calls imports by their local names, e.g. `QC` for
      // `import { QueryClient as QC }`. Imported where a template uses them.
      const value = (source: string, name: string) =>
        ensureNamedImport(
          { j, root },
          { source, name, typeOnly: false, at: null },
        );
      const type = (source: string, name: string) =>
        ensureNamedImport(
          { j, root },
          { source, name, typeOnly: true, at: null },
        );
      const rq = '@tanstack/react-query';

      statements.push(
        ...exported(
          `export const { TRPCProvider, useTRPC, useTRPCClient } = ${value('@trpc/tanstack-react-query', 'createTRPCContext')}${routerGeneric}();`,
        ),
      );

      let queryClientConfig: 'yes' | 'no' | 'unknown' = 'no';
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
          // Whether every return is an object literal we can read, so we know
          // if `queryClientConfig` is there; otherwise check at runtime.
          const returns = j.BlockStatement.check(configFunction.body)
            ? j(configFunction.body)
                .find(j.ReturnStatement)
                // Not the returns of functions nested in it
                .filter((p) => !insideFunction(p))
                .nodes()
                .map((node) => node.argument)
            : [configFunction.body];
          // `{ links, ...shared }` could hold it too
          const isKnownObject = (r: unknown) =>
            j.ObjectExpression.check(r) &&
            !r.properties.some(
              (p) => j.SpreadElement.check(p) || j.SpreadProperty.check(p),
            );
          queryClientConfig = returns.every(isKnownObject)
            ? returns.some(
                (r) =>
                  j.ObjectExpression.check(r) &&
                  r.properties.some(
                    (p) =>
                      (j.ObjectProperty.check(p) || j.Property.check(p)) &&
                      staticKeyName(j, p) === 'queryClientConfig',
                  ),
              )
              ? 'yes'
              : 'no'
            : 'unknown';
          const [param] = configFunction.params;
          const body = j.BlockStatement.check(configFunction.body)
            ? configFunction.body
            : j.blockStatement([j.returnStatement(configFunction.body)]);
          const fn = j.functionDeclaration(j.identifier(configName), [], body);
          // `config(opts)`, `config({ ctx })` or `config({ ctx } = {})`
          const typed = j.AssignmentPattern.check(param) ? param.left : param;
          if (
            param &&
            (j.Identifier.check(typed) || j.ObjectPattern.check(typed))
          ) {
            typed.typeAnnotation = j.tsTypeAnnotation(
              j.tsTypeLiteral([
                (() => {
                  const contextType = j.tsTypeReference(
                    j.identifier(type('next', 'NextPageContext')),
                  );
                  const ctx = j.tsPropertySignature(
                    j.identifier('ctx'),
                    j.tsTypeAnnotation(contextType),
                  );
                  ctx.optional = true;
                  return ctx;
                })(),
              ]),
            );
            fn.params = [param];
            configCall = `${configName}({})`;
          } else if (param) {
            // Keep it, so its names stay bound, and type it by hand
            fn.params = [param];
            configCall = `${configName}({})`;
            fn.comments = [
              todoComment('type this parameter: `{ ctx?: NextPageContext }`'),
            ];
          }
          fn.comments = [
            j.commentBlock(
              '*\n * Was `config` in `createTRPCNext`. `withTRPC` calls it once per mount,\n * on the server and in the browser, without `ctx`.\n ',
              true,
              false,
            ),
            ...(fn.comments ?? []),
          ];
          statements.push(fn);
          statements.push(
            ...exported(
              `export function makeTRPCClient() {\n  return ${value('@trpc/client', 'createTRPCClient')}${routerGeneric}({ links: ${configCall}.links });\n}`,
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
          // `config: clientConfig`, a function defined elsewhere. Pass it
          // `{}` unless this file shows it takes nothing.
          const name = j.Identifier.check(config) ? config.name : null;
          const declared = name
            ? [
                ...root.find(j.FunctionDeclaration, { id: { name } }).nodes(),
                ...root
                  .find(j.VariableDeclarator, { id: { name } })
                  .nodes()
                  .map((d) => d.init)
                  .filter(
                    (init) =>
                      j.FunctionExpression.check(init) ||
                      j.ArrowFunctionExpression.check(init),
                  ),
              ]
            : [];
          const takesNothing =
            declared.length > 0 &&
            declared.every(
              (fn) => (fn as { params: unknown[] }).params.length === 0,
            );
          configCall = `${j(config).toSource()}(${takesNothing ? '' : '{}'})`;
          queryClientConfig = 'unknown';
          statements.push(
            ...exported(
              `export function makeTRPCClient() {\n  return ${value('@trpc/client', 'createTRPCClient')}${routerGeneric}({ links: ${configCall}.links });\n}`,
            ),
          );
        }
      } else {
        statements.push(
          ...exported(
            `// TODO(@trpc/upgrade): add your links\nexport function makeTRPCClient() {\n  return ${value('@trpc/client', 'createTRPCClient')}${routerGeneric}({ links: [] });\n}`,
          ),
        );
      }

      statements.push(
        ...exported(
          queryClientConfig === 'yes'
            ? `export function makeQueryClient() {\n  return new ${value(rq, 'QueryClient')}(${configCall}.queryClientConfig);\n}`
            : queryClientConfig === 'unknown'
              ? (() => {
                  const queryClient = value(rq, 'QueryClient');
                  const queryClientConfig = type(rq, 'QueryClientConfig');
                  // Not a name the line uses, e.g. \`QueryClient as config\`
                  // or \`config: config\`
                  const taken = new Set([
                    queryClient,
                    queryClientConfig,
                    ...(configCall.match(/[A-Za-z_$][\w$]*/g) ?? []),
                  ]);
                  let local = 'config';
                  for (let i = 2; taken.has(local); i++) {
                    local = `config${i}`;
                  }
                  return `export function makeQueryClient() {\n  const ${local} = ${configCall};\n  return new ${queryClient}(\n    'queryClientConfig' in ${local}\n      ? (${local}.queryClientConfig as ${queryClientConfig})\n      : undefined,\n  );\n}`;
                })()
              : `export function makeQueryClient() {\n  return new ${value(rq, 'QueryClient')}();\n}`,
        ),
      );

      // Classic `withTRPC` ran `trpcState` through the transformer.
      let transformerSource = transformer ? j(transformer).toSource() : null;
      // `typeof x.deserialize` needs a name, not e.g. `getTransformer()`,
      // and not one the generated `WithTRPC` declares itself
      const wrapperLocals = [
        'props',
        'queryClient',
        'trpcClient',
        'pageProps',
        'state',
      ];
      if (
        transformerSource &&
        (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(transformerSource) ||
          wrapperLocals.includes(transformerSource.split('.')[0] ?? ''))
      ) {
        // `hydrationTransformer`, or `hydrationTransformer2`… if the file
        // already uses the name
        const used = new Set(
          root
            .find(j.Identifier)
            .nodes()
            .map((node) => node.name),
        );
        let hoisted = 'hydrationTransformer';
        for (let i = 2; used.has(hoisted); i++) {
          hoisted = `hydrationTransformer${i}`;
        }
        statements.push(
          ...exported(`const ${hoisted} = ${transformerSource};`),
        );
        transformerSource = hoisted;
      }
      const dehydratedState = type(rq, 'DehydratedState');
      // A typed `const`, not a cast: superjson's `deserialize<T>` infers `T`
      // from it, and lint flags a cast that changes nothing
      const hydrationState = transformerSource
        ? `const state: ${dehydratedState} | undefined =
      !pageProps?.trpcState
        ? undefined
        : ${transformerSource}.deserialize(
            pageProps.trpcState as Parameters<typeof ${transformerSource}.deserialize>[0],
          );`
        : `const state = pageProps?.trpcState as ${dehydratedState} | undefined;`;
      const appTypeName = type('next/app', 'AppType');
      const useStateName = value('react', 'useState');
      const createElementName = value('react', 'createElement');
      statements.push(
        ...exported(
          `/**
 * Was \`trpc.withTRPC\`. Provides the tRPC and query clients to the app, and
 * hydrates the \`trpcState\` a page's \`getStaticProps\` or
 * \`getServerSideProps\` returns.
 */
export function withTRPC<TInitialProps extends object>(
  App: ${appTypeName}<TInitialProps>,
): ${appTypeName}<TInitialProps> {
  const WithTRPC: ${appTypeName}<TInitialProps> = (props) => {
    const [queryClient] = ${useStateName}(makeQueryClient);
    const [trpcClient] = ${useStateName}(makeTRPCClient);
    const pageProps = props.pageProps as { trpcState?: unknown } | undefined;
    ${hydrationState}
    return ${createElementName}(${value(rq, 'QueryClientProvider')}, {
      client: queryClient,
      children: ${createElementName}(TRPCProvider, {
        trpcClient,
        queryClient,
        children: ${createElementName}(${value(rq, 'HydrationBoundary')}, {
          state,
          children: ${createElementName}(App, props),
        }),
      }),
    });
  };
  const appGetInitialProps = App.getInitialProps?.bind(App);
  if (appGetInitialProps) {
    // Like classic \`withTRPC\`: Next.js gets \`{ pageProps }\`, never \`undefined\`
    WithTRPC.getInitialProps = async (ctx) => {
      const initialProps = (await appGetInitialProps(ctx)) as {
        pageProps?: unknown;
      };
      return {
        pageProps: initialProps.pageProps ?? {},
      } as unknown as TInitialProps;
    };
  }
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
        // `overrides`, `abortOnUnmount`… must not vanish without a word
        ...opts.properties
          // No spreads here: a setup with one is left for hand migration
          .map((p) => staticKeyName(j, p as { key: unknown }))
          .filter(
            (key) =>
              ![
                'config',
                'transformer',
                'ssr',
                'responseMeta',
                'ssrPrepass',
              ].includes(key ?? ''),
          )
          .map((key) =>
            todoComment(
              key === 'overrides'
                ? 'move `overrides` to your QueryClient, e.g. a `MutationCache` `onSuccess`, see https://trpc.io/docs/client/tanstack-react-query/migrating#migrating-overrides'
                : key === 'abortOnUnmount'
                  ? 'pass `trpc: { abortOnUnmount: true }` to each query instead, see https://trpc.io/docs/client/tanstack-react-query/migrating#migrating-abortonunmount'
                  : `createTRPCNext's \`${key ?? 'computed'}\` option has no direct replacement, see https://trpc.io/docs/client/tanstack-react-query/migrating`,
            ),
          ),
      ];
      j(statement).replaceWith(() => statements);

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
  /**
   * A transformer may be `{ input, output }`. Classic `withTRPC` read
   * `trpcState` with `input`, so hydration needs that half: from an object
   * literal, or a top-level `const` holding one.
   */
  function inputTransformer(
    transformer: ExpressionKind | null,
  ): ExpressionKind | null {
    const inputOf = (object: unknown) => {
      if (!j.ObjectExpression.check(object)) return null;
      const input = object.properties.find(
        (p) =>
          (j.ObjectProperty.check(p) || j.Property.check(p)) &&
          staticKeyName(j, p) === 'input',
      );
      return input ? (input as { value: ExpressionKind }).value : null;
    };
    if (j.Identifier.check(transformer)) {
      const declared = root
        .find(j.VariableDeclarator, { id: { name: transformer.name } })
        .filter((p) => {
          const statement = p.parent?.parent;
          return (
            p.parent?.node.kind === 'const' &&
            (j.Program.check(statement?.node) ||
              (j.ExportNamedDeclaration.check(statement?.node) &&
                j.Program.check(statement.parent?.node)))
          );
        })
        .paths()[0];
      return inputOf(declared?.node.init)
        ? j.memberExpression(
            j.identifier(transformer.name),
            j.identifier('input'),
          )
        : transformer;
    }
    const input = inputOf(transformer);
    if (!input) return transformer;
    // `{ input: a, ...overrides }`: a spread may replace `input` at runtime
    const hasSpread =
      j.ObjectExpression.check(transformer) &&
      transformer.properties.some(
        (p) => j.SpreadElement.check(p) || j.SpreadProperty.check(p),
      );
    return hasSpread
      ? j.memberExpression(transformer as ExpressionKind, j.identifier('input'))
      : input;
  }

  /**
   * Whether `trpc` at `path` is the top-level setup this transform replaces.
   * A setup inside a function stays as it is, so its uses must too.
   */
  function migratable(path: ASTPath): boolean {
    const local = isShadowed(j, path, {
      scope: root.paths()[0] as ASTPath,
      name: trpcName,
      declarator: null,
    });
    if (local) {
      addTodo(
        j,
        path,
        `migrate by hand: this \`${trpcName}\` is not a top-level setup`,
      );
      changed = true;
    }
    return !local;
  }

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
      .filter(migratable)
      .forEach((path) => {
        const next = j.callExpression(
          j.identifier(
            ensureNamedImport(
              { j, root },
              {
                source: '@trpc/client',
                name: 'createTRPCClient',
                typeOnly: false,
                at: path,
              },
            ),
          ),
          path.node.arguments,
        );
        const typeParameters = routerType ?? importedRouterType(path);
        if (typeParameters) {
          (next as { typeParameters?: unknown }).typeParameters =
            typeParameters;
        } else {
          addTodo(
            j,
            path,
            'add your router type: `createTRPCClient<AppRouter>()`',
          );
        }
        path.replace(next);
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
      .filter(migratable)
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

  /**
   * `createServerSideHelpers` comes from `@trpc/react-query/server`, which
   * keeps the deprecated package installed. Its replacement prefetches into
   * a QueryClient, so each use needs rewriting by hand.
   */
  function flagServerSideHelpers(collection: Collection) {
    collection
      .find(j.ImportDeclaration, {
        source: { value: '@trpc/react-query/server' },
      })
      .forEach((path) => {
        addTodo(
          j,
          path,
          'prefetch with `createTRPCOptionsProxy` and `dehydrate` instead of `createServerSideHelpers` from the deprecated `@trpc/react-query`, see https://trpc.io/docs/client/nextjs/pages-router/server-side-helpers',
        );
        changed = true;
      });
  }

  // `export default trpc.withTRPC(MyApp)` → `export default withTRPC(MyApp)`
  function migrateWithTRPCUsage(collection: Collection) {
    let used = false;
    // `pages/_app`, or a file typed with `next/app`'s `AppType`
    const isAppFile =
      /(^|[\\/])_app\.[cm]?[jt]sx?$/.test(file.path) ||
      root.find(j.ImportDeclaration, { source: { value: 'next/app' } }).size() >
        0;
    collection
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { name: trpcName },
          property: { name: 'withTRPC' },
        },
      })
      .filter(migratable)
      .forEach((path) => {
        // The generated `withTRPC` wraps an App; classic one wrapped pages too
        if (!isAppFile) {
          addTodo(
            j,
            path,
            `the new \`withTRPC\` wraps your App: call it in \`pages/_app\`, and drop it here, see ${nextDocs}`,
          );
          changed = true;
          return;
        }
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
/** Whether a function lies between `path` and the root of its tree. */
function insideFunction(path: ASTPath): boolean {
  for (let current = path.parent; current; current = current.parent) {
    const type = (current.node as { type: string }).type;
    if (
      type === 'FunctionExpression' ||
      type === 'ArrowFunctionExpression' ||
      type === 'FunctionDeclaration' ||
      type === 'ObjectMethod'
    ) {
      return true;
    }
  }
  return false;
}

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
