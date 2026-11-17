import type {
  ArrowFunctionExpression,
  CallExpression,
  ASTNode,
  ASTPath,
  Collection,
  FunctionDeclaration,
  FunctionExpression,
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
 * Adds `name` to the value import from `source`, or a new import after the
 * last one. Returns false if it was imported already.
 */
export function ensureNamedImport(
  { j, root }: Codemod,
  opts: {
    readonly source: string;
    readonly name: string;
    readonly typeOnly: boolean;
  },
): boolean {
  const { source, name } = opts;
  const declarations = root.find(j.ImportDeclaration, {
    source: { value: source },
  });
  const imported = declarations.find(j.ImportSpecifier, {
    imported: { name },
  });
  if (imported.size() > 0) {
    return false;
  }
  const target = declarations.filter((path) => {
    const kind = path.node.importKind ?? 'value';
    if (opts.typeOnly) {
      return true;
    }
    return (
      kind === 'value' &&
      !(path.node.specifiers ?? []).some((s) =>
        j.ImportNamespaceSpecifier.check(s),
      )
    );
  });
  if (target.size() > 0) {
    const specifier = j.importSpecifier(j.identifier(name));
    if (opts.typeOnly && target.get().node.importKind !== 'type') {
      (specifier as { importKind?: string }).importKind = 'type';
    }
    target.get().node.specifiers.push(specifier);
    return true;
  }
  const declaration = j.importDeclaration(
    [j.importSpecifier(j.identifier(name))],
    j.stringLiteral(source),
  );
  if (opts.typeOnly) {
    declaration.importKind = 'type';
  }
  const imports = root.find(j.ImportDeclaration);
  if (imports.size() > 0) {
    imports.at(-1).insertAfter(declaration);
  } else {
    root.get().node.program.body.unshift(declaration);
  }
  return true;
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
  const declared = body.some(
    (statement) =>
      j.VariableDeclaration.check(statement) &&
      statement.declarations.some(
        (d) =>
          j.VariableDeclarator.check(d) &&
          j.Identifier.check(d.id) &&
          d.id.name === name,
      ),
  );
  if (declared) {
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

/** Whether `fn` declares `name` anywhere in it, e.g. `const queryClient = …`. */
export function declaresName(
  j: JSCodeshift,
  fn: ASTPath<FunctionNode>,
  name: string,
): boolean {
  return (
    j(fn)
      .find(j.VariableDeclarator, { id: { type: 'Identifier', name } })
      .size() > 0
  );
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
    const present = new Set(
      specifiers
        .filter((s) => j.ImportSpecifier.check(s))
        .map((s) => (s as { imported: { name: string } }).imported.name),
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
