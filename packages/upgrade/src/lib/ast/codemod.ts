import type {
  ArrowFunctionExpression,
  CallExpression,
  ASTNode,
  ASTPath,
  Collection,
  FunctionDeclaration,
  FunctionExpression,
  ImportDeclaration,
  JSCodeshift,
  Statement,
} from 'jscodeshift';

/** What the builders take as an expression, e.g. `j.callExpression(callee)` */
export type ExpressionKind = NonNullable<
  Parameters<JSCodeshift['returnStatement']>[0]
>;

export interface Codemod {
  readonly j: JSCodeshift;
  readonly root: Collection;
}

export type FunctionNode =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunctionExpression;

/** The quote the file's imports use, so new imports match them. */
export function quoteOf(source: string): 'single' | 'double' {
  const match = /\bfrom\s+(['"])/.exec(source);
  return match?.[1] === '"' ? 'double' : 'single';
}

/**
 * Makes `name` from `source` usable in the file, adding it to a named import
 * from `source` or as a new import after the last one. Returns the local
 * name to use, e.g. `useRQQuery` for `import { useQuery as useRQQuery }`.
 */
export function ensureNamedImport(
  { j, root }: Codemod,
  opts: {
    readonly source: string;
    readonly name: string;
    readonly typeOnly: boolean;
    /** Where the code uses it, so a local binding there can't hide it */
    readonly at: ASTPath | null;
  },
): string {
  const { source, name } = opts;
  const visibleAt = (local: string) =>
    opts.at === null ||
    !isShadowed(j, opts.at, {
      scope: root.paths()[0] as ASTPath,
      name: local,
      declarator: null,
    });
  const declarations = root.find(j.ImportDeclaration, {
    source: { value: source },
  });
  const isTypeImport = (
    declaration: { importKind?: string | null },
    specifier: { importKind?: string | null },
  ) => declaration.importKind === 'type' || specifier.importKind === 'type';

  // An existing import a generated value (or type) use can refer to
  for (const path of declarations.paths()) {
    for (const specifier of path.node.specifiers ?? []) {
      if (
        j.ImportSpecifier.check(specifier) &&
        specifier.imported.name === name &&
        (opts.typeOnly ||
          !isTypeImport(path.node, specifier as { importKind?: string | null }))
      ) {
        const local = j.Identifier.check(specifier.local)
          ? specifier.local.name
          : name;
        if (visibleAt(local)) {
          return local;
        }
      }
    }
  }

  // A named import to add to: not `import * as x`, not `import type` for a value
  const target = declarations.filter((path) => {
    const specifiers = path.node.specifiers ?? [];
    if (specifiers.some((s) => j.ImportNamespaceSpecifier.check(s))) {
      return false;
    }
    return opts.typeOnly || (path.node.importKind ?? 'value') === 'value';
  });
  // `name`, or `name2`… if the file has its own `name` already, or one
  // where the code uses it. A new alias avoids every name in the file, so no
  // nested binding can hide it either.
  const taken = topLevelBindings(j, root);
  let local = name;
  if (taken.has(local) || !visibleAt(local)) {
    const used = new Set([
      ...taken,
      ...root
        .find(j.Identifier)
        .nodes()
        .map((node) => node.name),
      ...root
        .find(j.JSXIdentifier)
        .nodes()
        .map((node) => node.name),
    ]);
    let i = 2;
    while (used.has(`${name}${i}`)) {
      i++;
    }
    local = `${name}${i}`;
  }
  const specifier = j.importSpecifier(j.identifier(name), j.identifier(local));
  if (target.size() > 0) {
    if (opts.typeOnly && target.get().node.importKind !== 'type') {
      (specifier as { importKind?: string }).importKind = 'type';
    }
    target.get().node.specifiers.push(specifier);
    return local;
  }
  const declaration = j.importDeclaration([specifier], j.stringLiteral(source));
  if (opts.typeOnly) {
    declaration.importKind = 'type';
  }
  const imports = root.find(j.ImportDeclaration);
  if (imports.size() > 0) {
    imports.at(-1).insertAfter(declaration);
    const added = addedImports.get(root) ?? [];
    added.push(declaration);
    addedImports.set(root, added);
  } else {
    root.get().node.program.body.unshift(declaration);
  }
  return local;
}

/** The names a file declares or imports at its top level */
function topLevelBindings(j: JSCodeshift, root: Collection): Set<string> {
  const names = new Set<string>();
  for (const statement of root.get().node.program.body as unknown[]) {
    const node =
      (j.ExportNamedDeclaration.check(statement) ||
        j.ExportDefaultDeclaration.check(statement)) &&
      statement.declaration
        ? statement.declaration
        : statement;
    if (j.ImportDeclaration.check(node)) {
      for (const specifier of node.specifiers ?? []) {
        if (j.Identifier.check(specifier.local)) {
          names.add(specifier.local.name);
        }
      }
    } else if (j.VariableDeclaration.check(node)) {
      for (const declarator of node.declarations) {
        if (j.VariableDeclarator.check(declarator)) {
          paramBindings(j, [declarator.id]).forEach((n) => names.add(n));
        }
      }
    } else if (
      (j.FunctionDeclaration.check(node) ||
        j.ClassDeclaration.check(node) ||
        j.TSTypeAliasDeclaration.check(node) ||
        j.TSInterfaceDeclaration.check(node) ||
        j.TSEnumDeclaration.check(node)) &&
      j.Identifier.check(node.id)
    ) {
      names.add(node.id.name);
    }
  }
  return names;
}

/** Imports `ensureNamedImport` added after a file's existing ones */
const addedImports = new WeakMap<Collection, ImportDeclaration[]>();

/**
 * `root` as source code, without two things recast does to a file whose
 * statements changed: `'use client';;`, and a blank line between the
 * imports and the ones `ensureNamedImport` added.
 */
export function printSource({ j, root }: Codemod, source: string): string {
  const quote = quoteOf(source);
  let output = root.toSource({ quote });

  const directive = /^(\s*(['"])use [\w ]+\2);?([ \t]*(?:\r?\n\s*)?)/.exec(
    source,
  );
  if (directive) {
    const [, text, , space] = directive;
    const doubled = `${text?.trimStart()};;`;
    if (output.startsWith(doubled)) {
      output = `${text?.trimStart()};${space}${output
        .slice(doubled.length)
        .trimStart()}`;
    }
  }

  for (const declaration of addedImports.get(root) ?? []) {
    const text = j(declaration).toSource({ quote });
    const at = output.indexOf(`\n\n${text}\n`);
    if (at === -1) {
      continue;
    }
    const previousLine = output.slice(output.lastIndexOf('\n', at - 1) + 1, at);
    // The end of an import: `import 'x';` or `… from 'x';`
    if (/^import\s|\bfrom\s*['"][^'"]+['"];?$/.test(previousLine)) {
      output = `${output.slice(0, at)}${output.slice(at + 1)}`;
    }
  }
  return output;
}

/** The identifier at the root of `a.b.c` or `a['b'].c`, if any. */
export function rootIdentifierName(
  j: JSCodeshift,
  node: ASTNode,
): string | null {
  let current: ASTNode = node;
  while (j.MemberExpression.check(current)) {
    current = current.object;
  }
  return j.Identifier.check(current) ? current.name : null;
}

/**
 * The names a function's parameters bind: `a`, `{ b, c: d }` → d, `[e]`,
 * `...f`, `g = 1`. Not names inside type annotations.
 */
export function paramBindings(
  j: JSCodeshift,
  params: readonly unknown[],
): Set<string> {
  const names = new Set<string>();
  const visit = (node: unknown) => {
    if (j.Identifier.check(node)) {
      names.add(node.name);
    } else if (j.ObjectPattern.check(node)) {
      for (const property of node.properties) {
        if (j.ObjectProperty.check(property) || j.Property.check(property)) {
          visit(property.value);
        } else if (j.RestElement.check(property)) {
          visit(property.argument);
        }
      }
    } else if (j.ArrayPattern.check(node)) {
      node.elements.forEach(visit);
    } else if (j.RestElement.check(node)) {
      visit(node.argument);
    } else if (j.AssignmentPattern.check(node)) {
      visit(node.left);
    } else if (j.TSParameterProperty.check(node)) {
      visit(node.parameter);
    }
  };
  params.forEach(visit);
  return names;
}

/** `use` + capital letter, as React's rules of hooks spell it. */
function isHookName(name: string) {
  return /^use[A-Z0-9]/.test(name);
}

function isComponentName(name: string) {
  return /^[A-Z]/.test(name);
}

/** The name a function is known by: its own, or the variable's it's in. */
function nameOfFunction(path: ASTPath<FunctionNode>): string | null {
  const node = path.node;
  if ('id' in node && node.id?.type === 'Identifier') {
    return node.id.name;
  }
  const parent = path.parent?.node;
  if (
    parent?.type === 'VariableDeclarator' &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id.name;
  }
  return null;
}

/** `memo(() => …)`, `forwardRef(function (props, ref) { … })` */
function isWrappedComponent(path: ASTPath<FunctionNode>) {
  const parent = path.parent?.node;
  if (parent?.type !== 'CallExpression') {
    return false;
  }
  const callee = (parent as CallExpression).callee;
  const name =
    callee.type === 'Identifier'
      ? callee.name
      : callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier'
        ? callee.property.name
        : null;
  return name === 'memo' || name === 'forwardRef' || name === 'observer';
}

function isFunctionPath(j: JSCodeshift, path: ASTPath): boolean {
  return (
    j.FunctionDeclaration.check(path.node) ||
    j.FunctionExpression.check(path.node) ||
    j.ArrowFunctionExpression.check(path.node)
  );
}

/**
 * The component or hook `path` is in: the closest enclosing function named
 * like a component or a hook, else the outermost enclosing function. Hooks
 * and `useTRPC()` go at the top of it.
 */
export function findHookScope(
  j: JSCodeshift,
  path: ASTPath,
): ASTPath<FunctionNode> | null {
  let outermost: ASTPath<FunctionNode> | null = null;
  for (let current = path.parent; current; current = current.parent) {
    if (!isFunctionPath(j, current)) {
      continue;
    }
    const fn = current as ASTPath<FunctionNode>;
    const name = nameOfFunction(fn);
    if (
      (name && (isHookName(name) || isComponentName(name))) ||
      isWrappedComponent(fn)
    ) {
      return fn;
    }
    outermost = fn;
  }
  return outermost;
}

/** The statements of a function body, turning `() => x` into `() => { return x; }`. */
export function bodyStatements(
  j: JSCodeshift,
  fn: ASTPath<FunctionNode>,
): Statement[] {
  const node = fn.node;
  if (!j.BlockStatement.check(node.body)) {
    node.body = j.blockStatement([j.returnStatement(node.body)]);
  }
  return (node.body as { body: Statement[] }).body;
}

/** Whether `fn`'s own body, not a function nested in it, declares `name`. */
export function declaresAtTop(
  j: JSCodeshift,
  fn: ASTPath<FunctionNode>,
  name: string,
): boolean {
  if (!j.BlockStatement.check(fn.node.body)) {
    return false;
  }
  return fn.node.body.body.some(
    (statement) =>
      j.VariableDeclaration.check(statement) &&
      statement.declarations.some(
        (d) =>
          j.VariableDeclarator.check(d) &&
          j.Identifier.check(d.id) &&
          d.id.name === name,
      ),
  );
}

/**
 * Puts `const name = init()` at the top of `fn`, unless `fn` declares `name`
 * at its top level already.
 */
export function ensureDeclaredAtTop(
  j: JSCodeshift,
  fn: ASTPath<FunctionNode>,
  declaration: { readonly name: string; readonly init: string },
): void {
  const { name, init } = declaration;
  const body = bodyStatements(j, fn);
  if (declaresAtTop(j, fn, name)) {
    return;
  }
  body.unshift(
    j.variableDeclaration('const', [
      j.variableDeclarator(
        j.identifier(name),
        j.callExpression(j.identifier(init), []),
      ),
    ]),
  );
}

/** `base`, or `base2`, `base3`… if `fn` uses that name already. */
export function uniqueName(
  j: JSCodeshift,
  fn: ASTPath<FunctionNode>,
  base: string,
): string {
  const used = new Set(
    j(fn)
      .find(j.Identifier)
      .nodes()
      .map((node) => node.name),
  );
  let name = base;
  for (let i = 2; used.has(name); i++) {
    name = `${base}${i}`;
  }
  return name;
}

/**
 * Whether `name` at `path` refers to a binding something between `path` and
 * `scope` declares, e.g. a nested callback's own `utils` parameter, rather
 * than to `declarator`. `scope` is the function or block that declares it.
 */
export function isShadowed(
  j: JSCodeshift,
  path: ASTPath,
  opts: {
    readonly scope: ASTPath;
    readonly name: string;
    readonly declarator: unknown;
  },
): boolean {
  const scopeBody = (opts.scope.node as { body?: unknown }).body;
  const declaresName = (statement: unknown) =>
    // `function useQuery() {}` or `class X {}` in a block
    ((j.FunctionDeclaration.check(statement) ||
      j.ClassDeclaration.check(statement)) &&
      j.Identifier.check(statement.id) &&
      statement.id.name === opts.name) ||
    (j.VariableDeclaration.check(statement) &&
      statement.declarations.some(
        (d) =>
          d !== opts.declarator &&
          j.VariableDeclarator.check(d) &&
          // Bindings, not keys: `{ utils: other }` binds `other`
          paramBindings(j, [d.id]).has(opts.name),
      ));
  for (
    let current = path.parent;
    current && current.node !== opts.scope.node;
    current = current.parent
  ) {
    const node = current.node;
    // `{ const utils = other; … }` or `catch (utils)` in between
    if (
      j.BlockStatement.check(node) &&
      node !== scopeBody &&
      node.body.some(declaresName)
    ) {
      return true;
    }
    if (
      j.CatchClause.check(node) &&
      paramBindings(j, [node.param]).has(opts.name)
    ) {
      return true;
    }
    // `for (const utils of list)`, `for (let utils = …; …)`
    if (
      (j.ForStatement.check(node) && declaresName(node.init)) ||
      ((j.ForInStatement.check(node) || j.ForOfStatement.check(node)) &&
        declaresName(node.left))
    ) {
      return true;
    }
    if (
      !j.FunctionDeclaration.check(node) &&
      !j.FunctionExpression.check(node) &&
      !j.ArrowFunctionExpression.check(node)
    ) {
      continue;
    }
    if (paramBindings(j, node.params).has(opts.name)) {
      return true;
    }
    if (declaresAtTop(j, current as ASTPath<FunctionNode>, opts.name)) {
      return true;
    }
  }
  return false;
}

/**
 * Inserts `statement` right after `declarator`'s own declaration, first
 * splitting `const a = f(), b = a` so `b` still runs after `statement`.
 */
export function insertAfterDeclarator(
  j: JSCodeshift,
  declarator: ASTPath,
  statement: Statement,
): void {
  const declaration = declarator.parent;
  const node = declaration.node as {
    kind: 'const' | 'let' | 'var';
    declarations: unknown[];
  };
  const container = declaration.parent?.node as { body?: unknown } | undefined;
  const body = Array.isArray(container?.body)
    ? (container.body as unknown[])
    : null;
  if (!body) {
    j(declaration).insertAfter(statement);
    return;
  }
  const at = body.indexOf(node);
  const index = node.declarations.indexOf(declarator.node);
  const before = node.declarations.slice(0, index + 1);
  const after = node.declarations.slice(index + 1);
  const replacement: unknown[] = [
    j.variableDeclaration(node.kind, before as never),
    statement,
  ];
  if (after.length > 0) {
    replacement.push(j.variableDeclaration(node.kind, after as never));
  }
  body.splice(at, 1, ...replacement);
}

/** Whether `path` is an identifier used as a value, not a property name or key. */
export function isValueReference(j: JSCodeshift, path: ASTPath): boolean {
  const parent = path.parent?.node;
  if (!parent) {
    return true;
  }
  if (
    (j.MemberExpression.check(parent) ||
      j.OptionalMemberExpression.check(parent)) &&
    parent.property === path.node &&
    !parent.computed
  ) {
    return false;
  }
  if (
    (j.ObjectProperty.check(parent) || j.Property.check(parent)) &&
    parent.key === path.node &&
    !parent.computed &&
    !parent.shorthand
  ) {
    return false;
  }
  if (
    j.ImportSpecifier.check(parent) ||
    j.ImportDefaultSpecifier.check(parent) ||
    j.ImportNamespaceSpecifier.check(parent) ||
    j.ExportSpecifier.check(parent)
  ) {
    return false;
  }
  if (j.VariableDeclarator.check(parent) && parent.id === path.node) {
    return false;
  }
  if (j.TSTypeReference.check(parent)) {
    return false;
  }
  if (j.TSQualifiedName.check(parent)) {
    // `typeof trpc.a.b` refers to the value `trpc`, `Foo.Bar` to a namespace
    let top: ASTPath = path.parent;
    while (j.TSQualifiedName.check(top.parent?.node)) {
      top = top.parent;
    }
    return parent.left === path.node && j.TSTypeQuery.check(top.parent?.node);
  }
  return true;
}

/** Whether `path` is inside `ancestor`. */
export function isInside(path: ASTPath, ancestor: ASTPath): boolean {
  for (let current: ASTPath | null = path; current; current = current.parent) {
    if (current.node === ancestor.node) {
      return true;
    }
  }
  return false;
}

/**
 * Replaces the import of `oldName` from any module with `newNames` from the
 * same module, or adds `newNames` next to it if `keepOld`.
 */
export function replaceImportedName(
  { j, root }: Codemod,
  opts: {
    readonly oldName: string;
    readonly newNames: readonly string[];
    readonly keepOld: boolean;
  },
): boolean {
  const { oldName, newNames, keepOld } = opts;
  let changed = false;
  root.find(j.ImportDeclaration).forEach((path) => {
    const specifiers = path.node.specifiers ?? [];
    const index = specifiers.findIndex(
      (s) =>
        j.ImportSpecifier.check(s) &&
        (s.local?.name ?? s.imported.name) === oldName,
    );
    if (index === -1) {
      return;
    }
    // Local names, so `TRPCProvider as Other` doesn't count as `TRPCProvider`
    const present = new Set(
      specifiers
        .filter((s) => j.ImportSpecifier.check(s))
        .map(
          (s) =>
            (s as { local?: { name: string } | null }).local?.name ??
            (s as { imported: { name: string } }).imported.name,
        ),
    );
    const added = newNames
      .filter((name) => !present.has(name))
      .map((name) => j.importSpecifier(j.identifier(name)));
    if (keepOld) {
      specifiers.splice(index + 1, 0, ...added);
    } else {
      specifiers.splice(index, 1, ...added);
    }
    if (specifiers.length === 0) {
      j(path).remove();
    }
    changed = true;
  });
  return changed;
}

/** `// TODO(@trpc/upgrade): …` above the statement holding `path`. */
export function addTodo(j: JSCodeshift, path: ASTPath, message: string): void {
  let statement: ASTPath | null = path;
  while (
    statement &&
    !j.Statement.check(statement.node) &&
    !j.ExportNamedDeclaration.check(statement.node)
  ) {
    statement = statement.parent;
  }
  // Above `export const …`, not between `export` and `const`
  if (
    statement?.parent &&
    (j.ExportNamedDeclaration.check(statement.parent.node) ||
      j.ExportDefaultDeclaration.check(statement.parent.node))
  ) {
    statement = statement.parent;
  }
  const target = (statement ?? path).node as {
    comments?: Array<{ value: string }>;
  };
  const text = ` TODO(@trpc/upgrade): ${message}`;
  if (target.comments?.some((c) => c.value === text)) {
    return;
  }
  const comment = j.commentLine(text, true, false);
  target.comments = [...(target.comments ?? []), comment];
}

/** `a`, `'a'` or `"a"` as an object key; null for computed or other keys. */
export function staticKeyName(
  j: JSCodeshift,
  property: { key: unknown; computed?: boolean | undefined },
): string | null {
  const { key } = property;
  if (j.Identifier.check(key)) return property.computed ? null : key.name;
  if (j.StringLiteral.check(key)) return key.value;
  if (j.Literal.check(key) && typeof key.value === 'string') return key.value;
  return null;
}

/** What a tRPC setup exposes, as the last name in `setup.….name`. */
const SETUP_MEMBERS = new Set([
  'Provider',
  'createClient',
  'withTRPC',
  'useUtils',
  'useContext',
  'useQueries',
  'useSuspenseQueries',
  'useQuery',
  'useSuspenseQuery',
  'useInfiniteQuery',
  'useSuspenseInfiniteQuery',
  'usePrefetchQuery',
  'usePrefetchInfiniteQuery',
  'useMutation',
  'useSubscription',
]);

/**
 * The name this file calls the setup by: `trpc` for `import { api as trpc }`
 * when the setup is `api`, else the setup's own name. Two modules can both
 * export `api`, so an alias counts only when the file uses it like a setup:
 * `trpc.post.byId.useQuery()`, `<trpc.Provider>`.
 */
export function localSetupName(
  { j, root }: Codemod,
  setupName: string,
): string {
  const usedLikeSetup = (local: string) =>
    [
      ...root.find(j.Identifier, { name: local }).paths(),
      // `<trpc.Provider>`
      ...root.find(j.JSXIdentifier, { name: local }).paths(),
    ].some((p: ASTPath) => {
      let top: ASTPath = p;
      while (
        (j.MemberExpression.check(top.parent?.node) ||
          j.JSXMemberExpression.check(top.parent?.node)) &&
        (top.parent.node as { object: unknown }).object === top.node
      ) {
        top = top.parent as ASTPath;
      }
      const property = (top.node as { property?: unknown }).property;
      return (
        top !== p &&
        (j.Identifier.check(property) || j.JSXIdentifier.check(property)) &&
        SETUP_MEMBERS.has(property.name)
      );
    });
  const aliases = new Set(
    root
      .find(j.ImportSpecifier, { imported: { name: setupName } })
      .nodes()
      .map((s): string =>
        j.Identifier.check(s.local) ? s.local.name : setupName,
      )
      .filter((local) => local !== setupName && usedLikeSetup(local)),
  );
  // None, or more than one that looks like a setup: don't guess
  const [alias] = aliases;
  return aliases.size === 1 && alias ? alias : setupName;
}
