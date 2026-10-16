import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { PROMOTED } from './promoted.ts';

/**
 * Something the codemod couldn't rewrite: a manual step, at a position.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface UpgradeNote {
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  readonly message: string;
}

/**
 * Options for {@link upgradeSource}.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface UpgradeOptions {
  /** `experimental_*` names promoted to stable, old to new. @default PROMOTED */
  readonly promoted?: Readonly<Record<string, string>> | undefined;
}

/**
 * What {@link upgradeSource} returns.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface UpgradeResult {
  readonly code: string;
  readonly changed: boolean;
  readonly notes: ReadonlyArray<UpgradeNote>;
}

interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: any;
}

interface ModuleMap {
  readonly to: string;
  readonly names: Readonly<Record<string, string>>;
}

const GUIDE = 'see docs/migrating-from-v11.md';
const TRPCDEV = /^(@trpcdev\/[^/]+|trpcdev)(\/|$)/;

const MODULES: Readonly<Record<string, ModuleMap>> = {
  '@trpc/server': {
    to: 'trpcdev/server',
    names: {
      initTRPC: 'initTrpc',
      TRPCError: 'TrpcError',
      TRPC_ERROR_CODE_KEY: 'BuiltinErrorCode',
      AnyTRPCRouter: 'AnyRouter',
      AnyTRPCProcedure: 'AnyProcedure',
      inferRouterError: 'inferRouterErrors',
    },
  },
  '@trpc/server/adapters/fetch': {
    to: 'trpcdev/server',
    names: {
      fetchRequestHandler: 'createFetchHandler',
      FetchCreateContextFnOptions: 'CreateContextOpts',
    },
  },
  '@trpc/client': {
    to: 'trpcdev/client',
    names: {
      createTRPCClient: 'createTrpcClient',
      createTRPCProxyClient: 'createTrpcClient',
      TRPCClientError: 'TrpcError',
      httpBatchLink: 'httpLink',
      httpBatchStreamLink: 'httpLink',
      unstable_httpBatchStreamLink: 'httpLink',
      httpSubscriptionLink: 'httpLink',
      unstable_httpSubscriptionLink: 'httpLink',
    },
  },
  '@trpc/tanstack-react-query': {
    to: '@trpcdev/tanstack-react-query',
    names: {
      createTRPCContext: 'createTrpcContext',
      createTRPCOptionsProxy: 'createTrpcQueryUtils',
    },
  },
};

/** What `createTRPCContext()` returns, renamed wherever a file uses them. */
const PROJECT_RENAMES: Readonly<Record<string, string>> = {
  TRPCProvider: 'TrpcProvider',
  useTRPC: 'useTrpc',
  useTRPCClient: 'useTrpcClient',
};

const MODULE_NOTES: Readonly<Record<string, string>> = {
  '@trpc/server/observable':
    'observable() subscriptions: return an async generator or an Effect Stream',
  '@trpc/server/adapters/standalone':
    'adapters: serve createFetchHandler() with serve() from trpcdev/http (docs/platforms.md)',
  '@trpc/server/adapters/express':
    'adapters: mount createFetchHandler() with toNodeHandler from trpcdev/http (docs/platforms.md)',
  '@trpc/server/adapters/ws':
    'adapters: handler.websocket(socket, { request }) or serve() from trpcdev/http (docs/platforms.md)',
  '@trpc/react-query':
    '@trpc/react-query has no v12 version: move to @trpcdev/tanstack-react-query',
  '@trpc/next':
    '@trpc/next has no v12 version: use createFetchHandler in a route handler',
};

const NAME_NOTES: Readonly<Record<string, string>> = {
  TRPCLink:
    'TRPCLink: keep the link with fromV11Link(link) from trpcdev/interop, or rewrite it with link() as an Effect Stream function',
};

const ROOT_OPTION_NOTES: Readonly<Record<string, string>> = {
  transformer:
    'transformer: drop it here; pass the same createSyncSerializer(transformer) to the handler and every link',
  errorFormatter:
    'errorFormatter: declare errors with .errors() or TrpcError.Tagged; createV11Handler({ errorFormatter }) keeps old clients working',
  isDev: 'isDev: use the handler option exposeUnexpectedErrors',
  isServer: 'isServer is gone',
  allowOutsideOfServer: 'allowOutsideOfServer is gone',
  sse: 'sse: a handler option, createFetchHandler({ sse: { pingMs } })',
  jsonl: 'jsonl: streaming needs no options in v12',
};

const own = <T>(record: Readonly<Record<string, T>>, key: string) =>
  Object.hasOwn(record, key) ? record[key] : undefined;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

function walk(
  node: Node,
  visit: (node: Node, parent: Node | undefined, key: string) => boolean | void,
  parent?: Node,
  key = '',
): void {
  if (visit(node, parent, key) === false) return;
  for (const [k, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) walk(item, visit, node, k);
    } else if (isNode(value)) {
      walk(value, visit, node, k);
    }
  }
}

const keyName = (prop: Node): string | undefined =>
  prop.type === 'Property' && !prop.computed
    ? prop.key.type === 'Identifier'
      ? prop.key.name
      : typeof prop.key.value === 'string'
        ? prop.key.value
        : undefined
    : undefined;

/** Whether an `Identifier` names a binding rather than a property. */
const isReference = (parent: Node | undefined, key: string) => {
  if (!parent) return true;
  switch (parent.type) {
    case 'MemberExpression':
      return key !== 'property' || parent.computed;
    case 'Property':
      return key !== 'key' || parent.computed;
    case 'MethodDefinition':
    case 'PropertyDefinition':
    case 'TSPropertySignature':
    case 'TSMethodSignature':
    case 'TSQualifiedName':
      return key !== 'key' && key !== 'right';
    case 'ImportSpecifier':
    case 'ExportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return false;
    default:
      return true;
  }
};

/**
 * Rewrites one v11 source file for v12: `@trpc/*` imports, `initTRPC`,
 * `TRPCError`, `mergeRouters`, `createCaller`, `fetchRequestHandler`, the
 * HTTP links and their `transformer`, and `createTRPCContext`'s names.
 * What needs a person (an `errorFormatter`, observables, adapters) is
 * left as is and reported in `notes`.
 *
 * @example
 * ```ts
 * const { code, notes } = upgradeSource(source, 'server.ts');
 * ```
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export function upgradeSource(
  source: string,
  filename: string,
  opts: UpgradeOptions = {},
): UpgradeResult {
  const promoted = opts.promoted ?? PROMOTED;
  const unchanged: UpgradeResult = { code: source, changed: false, notes: [] };
  if (
    !source.includes('@trpc/') &&
    !Object.keys(promoted).some((name) => source.includes(name)) &&
    !Object.keys(PROJECT_RENAMES).some((name) => source.includes(name))
  ) {
    return unchanged;
  }
  const parsed = parseSync(filename, source);
  if (parsed.errors.length > 0) {
    return {
      ...unchanged,
      notes: [
        {
          line: 1,
          column: 1,
          message: `not parsed: ${parsed.errors[0]!.message}`,
        },
      ],
    };
  }
  const program = parsed.program as unknown as Node;
  const s = new MagicString(source);
  const notes: UpgradeNote[] = [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  const note = (at: number, message: string) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= at) line++;
    notes.push({ line: line + 1, column: at - lineStarts[line]! + 1, message });
  };
  const text = (node: Node) => source.slice(node.start, node.end);

  /** Ranges rewritten as a whole; renames inside them are skipped. */
  const taken: Array<[number, number]> = [];
  const isTaken = (node: Node) =>
    taken.some(([a, b]) => node.start >= a && node.end <= b);
  const take = (start: number, end: number, replacement: string) => {
    s.overwrite(start, end, replacement);
    taken.push([start, end]);
  };

  /** Local name → v12 name, for bindings imported from `@trpc/*`. */
  const renames = new Map<string, string>(Object.entries(PROJECT_RENAMES));
  /** Local name → the v11 name it was imported as. */
  const imported = new Map<string, string>();
  /** v12 module → names to import from it. */
  const added = new Map<string, Set<string>>();
  const ensure = (module: string, name: string) => {
    const names = added.get(module) ?? new Set<string>();
    names.add(name);
    added.set(module, names);
  };
  const rebuilt = new Map<
    string,
    { node: Node; names: Set<string>; typeOnly: boolean }
  >();

  for (const statement of program['body'] as Node[]) {
    const isImport = statement.type === 'ImportDeclaration';
    const isReexport =
      statement.type === 'ExportNamedDeclaration' && statement['source'];
    if (!isImport && !isReexport) continue;
    const from = statement['source'].value as string;
    if (TRPCDEV.test(from)) {
      for (const spec of statement['specifiers'] as Node[]) {
        const key = isImport ? spec['imported'] : spec['local'];
        const next = key?.type === 'Identifier' && own(promoted, key.name);
        if (!next) continue;
        const sameName =
          spec[isImport ? 'local' : 'exported'].start === key.start;
        if (isImport && sameName) renames.set(key.name, next);
        s.overwrite(
          key.start,
          key.end,
          !isImport && sameName ? `${next} as ${key.name}` : next,
        );
      }
      continue;
    }
    if (!from.startsWith('@trpc/')) continue;
    const map = own(MODULES, from);
    if (!map) {
      note(
        statement.start,
        own(MODULE_NOTES, from) ?? `${from}: no v12 module, ${GUIDE}`,
      );
      continue;
    }
    const names = new Set<string>();
    let canRebuild = true;
    for (const spec of statement['specifiers'] as Node[]) {
      if (spec.type !== 'ImportSpecifier' && spec.type !== 'ExportSpecifier') {
        canRebuild = false;
        continue;
      }
      const name: string = isImport
        ? (spec['imported'].name ?? spec['imported'].value)
        : spec['local'].name;
      const local: string = isImport
        ? spec['local'].name
        : spec['exported'].name;
      const next = own(map.names, name) ?? name;
      const nameNote = own(NAME_NOTES, name);
      if (nameNote) note(spec.start, nameNote);
      const kind =
        spec['importKind'] === 'type' || spec['exportKind'] === 'type'
          ? 'type '
          : '';
      names.add(
        local === name || !isImport
          ? `${kind}${next}${!isImport && local !== name ? ` as ${local}` : ''}`
          : `${kind}${next} as ${local}`,
      );
      if (isImport) {
        imported.set(local, name);
        if (local === name && next !== name) renames.set(local, next);
      }
    }
    if (!canRebuild) {
      note(statement.start, `default or namespace import of ${from}: ${GUIDE}`);
      s.overwrite(
        statement['source'].start,
        statement['source'].end,
        `'${map.to}'`,
      );
      continue;
    }
    rebuilt.set(`${statement.start}`, {
      node: statement,
      names,
      typeOnly:
        statement['importKind'] === 'type' ||
        statement['exportKind'] === 'type',
    });
    taken.push([statement.start, statement.end]);
  }

  const isImportedAs = (node: Node, v11Name: string) =>
    node.type === 'Identifier' && imported.get(node.name) === v11Name;

  const objectArg = (call: Node): Node | undefined => {
    const arg = call['arguments'][0];
    return arg?.type === 'ObjectExpression' ? arg : undefined;
  };

  /** `{ a, req, b }` → `{ a, b }`. */
  const removeProperty = (object: Node, prop: Node) => {
    const props = object['properties'] as Node[];
    const i = props.indexOf(prop);
    const end = i + 1 < props.length ? props[i + 1]!.start : prop.end;
    const start =
      i + 1 < props.length || i === 0 ? prop.start : props[i - 1]!.end;
    take(start, end, '');
  };

  const linkOptions = (call: Node, linkName: string) => {
    const arg = call['arguments'][0] as Node | undefined;
    const object = objectArg(call);
    if (
      linkName === 'httpBatchLink' ||
      linkName === 'httpBatchStreamLink' ||
      linkName === 'unstable_httpBatchStreamLink'
    ) {
      const first = object?.['properties'][0] as Node | undefined;
      if (first) {
        const gap = source.slice(object!.start + 1, first.start);
        s.appendLeft(
          first.start,
          `batch: true,${gap.includes('\n') ? gap.slice(gap.lastIndexOf('\n')) : ' '}`,
        );
      } else if (object) {
        take(object.start, object.end, '{ batch: true }');
      } else if (arg) {
        s.appendLeft(arg.start, '{ ...');
        s.appendRight(arg.end, ', batch: true }');
      }
    }
    if (!object) return;
    for (const prop of object['properties'] as Node[]) {
      const name = keyName(prop);
      if (name === 'transformer') {
        ensure('trpcdev/serializer', 'createSyncSerializer');
        if (prop['shorthand']) {
          take(
            prop.start,
            prop.end,
            'serializer: createSyncSerializer(transformer)',
          );
        } else {
          s.overwrite(prop['key'].start, prop['key'].end, 'serializer');
          s.appendLeft(prop['value'].start, 'createSyncSerializer(');
          s.appendRight(prop['value'].end, ')');
          note(
            prop.start,
            'createSyncSerializer<…>(transformer): list the types it rebuilds, docs/serializers.md',
          );
        }
      } else if (name === 'maxURLLength') {
        s.overwrite(prop['key'].start, prop['key'].end, 'maxUrlLength');
      } else if (name === 'EventSource' || name === 'eventSourceOptions') {
        note(
          prop.start,
          `${name}: httpLink streams SSE over fetch; use headers or init`,
        );
      } else if (name === 'client' && linkName === 'wsLink') {
        note(
          prop.start,
          'wsLink({ url, connectionParams }) replaces createWSClient + wsLink({ client })',
        );
      }
    }
  };

  /** `createTRPCClient<R>({ links })` → `createTrpcClient({ router: routerType<R>(), links })`. */
  const clientRouter = (call: Node) => {
    const typeArgs = call['typeArguments'] as Node;
    const router = `router: routerType<${text(typeArgs['params'][0])}>()`;
    const arg = call['arguments'][0] as Node | undefined;
    const object = objectArg(call);
    const first = object?.['properties'][0] as Node | undefined;
    if (arg && !object) {
      s.appendLeft(arg.start, `{ ${router}, ...`);
      s.appendRight(arg.end, ' }');
    } else if (first) {
      const gap = source.slice(object!.start + 1, first.start);
      s.appendLeft(
        first.start,
        `${router},${gap.includes('\n') ? gap.slice(gap.lastIndexOf('\n')) : ' '}`,
      );
    } else if (object) {
      take(object.start, object.end, `{ ${router} }`);
    } else {
      return;
    }
    take(typeArgs.start, typeArgs.end, '');
    ensure('trpcdev/client', 'routerType');
  };

  const rootChain = (call: Node) => {
    const segments: Record<string, Node | undefined> = {};
    let current: Node = call['callee']['object'];
    while (
      current.type === 'CallExpression' &&
      current['callee'].type === 'MemberExpression'
    ) {
      segments[current['callee']['property'].name] =
        current['typeArguments']?.['params']?.[0];
      current = current['callee']['object'];
    }
    return isImportedAs(current, 'initTRPC')
      ? { root: current, segments }
      : undefined;
  };

  walk(program, (node, parent, key) => {
    if (isTaken(node)) return false;
    if (node.type === 'CallExpression') {
      const callee = node['callee'] as Node;
      const method =
        callee.type === 'MemberExpression' && !callee['computed']
          ? (callee['property'].name as string)
          : undefined;
      if (method === 'create') {
        const chain = rootChain(node);
        if (chain) {
          const fields = (['context', 'meta'] as const)
            .filter((k) => chain.segments[k])
            .map(
              (k) =>
                `${k === 'context' ? 'ctx' : 'meta'}: ${text(chain.segments[k]!)}`,
            );
          const typeArg = fields.length ? `<{ ${fields.join('; ')} }>` : '';
          const paren = source.indexOf(
            '(',
            node['typeArguments']?.end ?? callee.end,
          );
          take(
            chain.root.start,
            paren + 1,
            `${renames.get(chain.root.name) ?? chain.root.name}${typeArg}(`,
          );
          for (const prop of (objectArg(node)?.['properties'] ??
            []) as Node[]) {
            const name = keyName(prop);
            const message = name && own(ROOT_OPTION_NOTES, name);
            if (message) note(prop.start, message);
          }
          return;
        }
      }
      if (method === 'mergeRouters' && imported.size > 0) {
        const args = node['arguments'] as Node[];
        if (args.length > 0 && args.every((a) => a.type !== 'SpreadElement')) {
          const wrap =
            parent?.type === 'ArrowFunctionExpression' && key === 'body';
          take(node.start, args[0]!.start, `${wrap ? '(' : ''}{ ...`);
          for (let i = 1; i < args.length; i++)
            take(args[i - 1]!.end, args[i]!.start, ', ...');
          take(args.at(-1)!.end, node.end, ` }${wrap ? ')' : ''}`);
          return;
        }
      }
      if (
        method === 'createCaller' &&
        imported.size > 0 &&
        node['arguments'].length === 1
      ) {
        const arg = node['arguments'][0] as Node;
        ensure('trpcdev/server', 'createRouterClient');
        take(
          node.start,
          arg.start,
          `createRouterClient(${text(callee['object'])}, { ctx: `,
        );
        take(arg.end, node.end, ' })');
        return;
      }
      if (method === 'createCallerFactory' && imported.size > 0) {
        note(
          node.start,
          'createCallerFactory: createRouterClient(router, { ctx }) makes a caller',
        );
      }
      if (callee.type === 'Identifier') {
        const v11 = imported.get(callee.name);
        if (v11 === 'fetchRequestHandler') {
          const object = objectArg(node);
          const req = (object?.['properties'] as Node[] | undefined)?.find(
            (p) => keyName(p) === 'req',
          );
          if (object && req) {
            const value = text(req['value']);
            removeProperty(object, req);
            s.appendLeft(node.end, `.fetch(${value})`);
            note(
              node.start,
              'createFetchHandler: make the handler once, outside the request function; createContext gets { request, info }',
            );
          }
        } else if (
          (v11 === 'createTRPCClient' || v11 === 'createTRPCProxyClient') &&
          node['typeArguments']?.['params']?.length === 1
        ) {
          clientRouter(node);
        } else if (v11?.endsWith('Link')) {
          linkOptions(node, v11);
        } else if (v11 === 'createWSClient') {
          note(
            node.start,
            'createWSClient: pass its options to wsLink({ url })',
          );
        } else if (v11 === 'createTRPCOptionsProxy') {
          note(
            node.start,
            'createTrpcQueryUtils({ client }): the queryClient goes to QueryClientProvider',
          );
        }
      }
    }
    if (
      node.type === 'TSTypeReference' &&
      node['typeArguments'] &&
      node['typeName'].type === 'Identifier' &&
      imported.get(node['typeName'].name) === 'TRPCClientError'
    ) {
      note(
        node.start,
        'TrpcError<TCode, TData> takes a code and data, not a router; use ClientError or safe()',
      );
    }
    if (
      (node.type === 'ImportSpecifier' || node.type === 'ExportSpecifier') &&
      node['local'].start ===
        node[node.type === 'ImportSpecifier' ? 'imported' : 'exported'].start
    ) {
      const next = own(PROJECT_RENAMES, node['local'].name);
      if (next) s.overwrite(node['local'].start, node['local'].end, next);
      return false;
    }
    if (
      node.type === 'Identifier' &&
      renames.has(node.name) &&
      isReference(parent, key)
    ) {
      s.overwrite(node.start, node.end, renames.get(node.name)!);
    }
    if (
      node.type === 'JSXIdentifier' &&
      renames.has(node.name) &&
      key === 'name'
    ) {
      s.overwrite(node.start, node.end, renames.get(node.name)!);
    }
    if (
      node.type === 'JSXOpeningElement' &&
      node['name'].name === 'TRPCProvider'
    ) {
      for (const attr of node['attributes'] as Node[]) {
        if (attr.type !== 'JSXAttribute') continue;
        if (attr['name'].name === 'trpcClient')
          s.overwrite(attr['name'].start, attr['name'].end, 'client');
        if (attr['name'].name === 'queryClient') {
          note(
            attr.start,
            'TrpcProvider takes client only; the queryClient goes to QueryClientProvider',
          );
        }
      }
    }
    return;
  });

  for (const { node, names, typeOnly } of rebuilt.values()) {
    const from = own(MODULES, node['source'].value)!.to;
    for (const name of added.get(from) ?? []) names.add(name);
    added.delete(from);
    const keyword = node.type === 'ImportDeclaration' ? 'import' : 'export';
    s.overwrite(
      node.start,
      node.end,
      `${keyword} ${typeOnly ? 'type ' : ''}{ ${[...names].join(', ')} } from '${from}';`,
    );
  }
  if (added.size > 0) {
    const lines = [...added]
      .map(
        ([from, names]) =>
          `import { ${[...names].join(', ')} } from '${from}';\n`,
      )
      .join('');
    const imports = (program['body'] as Node[]).filter(
      (n) => n.type === 'ImportDeclaration',
    );
    if (imports.length)
      s.appendRight(imports.at(-1)!.end, `\n${lines.trimEnd()}`);
    else s.prepend(lines);
  }

  const code = s.toString();
  return { code, changed: code !== source, notes };
}
