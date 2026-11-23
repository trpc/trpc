import type { ESTree } from '@oxlint/plugins';
import { bindingNames, releaseTags, type ReleaseTag } from './releaseTags.ts';

type Declaration =
  | ESTree.Function
  | ESTree.Class
  | ESTree.VariableDeclarator
  | ESTree.TSInterfaceDeclaration
  | ESTree.TSTypeAliasDeclaration
  | ESTree.TSEnumDeclaration;

/** A top-level declaration and its JSDoc. */
export interface TopLevel {
  name: string;
  /** The first node declaring `name`. */
  node: Declaration;
  /** Every node declaring `name`: overloads have several. */
  declarations: Declaration[];
  /** The statement the JSDoc sits above. */
  statement: ESTree.Node;
  doc: ESTree.Comment | null;
  tags: ReleaseTag[];
  exported: boolean;
}

interface SourceCode {
  getCommentsBefore(node: ESTree.Node): ESTree.Comment[];
}

const docOf = (sourceCode: SourceCode, node: ESTree.Node) =>
  sourceCode
    .getCommentsBefore(node)
    .filter((c) => c.type === 'Block' && c.value.startsWith('*'))
    .at(-1) ?? null;

/** The declarations in a top-level statement, with their names. */
const declared = (node: ESTree.Node): [string, Declaration][] => {
  if (node.type === 'VariableDeclaration') {
    return node.declarations.flatMap((d) =>
      bindingNames(d.id).map((name): [string, Declaration] => [name, d]),
    );
  }
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'TSDeclareFunction' ||
    node.type === 'ClassDeclaration' ||
    node.type === 'TSInterfaceDeclaration' ||
    node.type === 'TSTypeAliasDeclaration' ||
    node.type === 'TSEnumDeclaration'
  ) {
    return node.id ? [[node.id.name, node]] : [];
  }
  return [];
};

/** The file's top-level declarations, by name. */
export const topLevelDeclarations = (
  program: ESTree.Program,
  sourceCode: SourceCode,
): Map<string, TopLevel> => {
  const exportedLocals = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === 'Identifier') {
          exportedLocals.add(specifier.local.name);
        }
      }
    } else if (
      statement.type === 'ExportDefaultDeclaration' &&
      statement.declaration.type === 'Identifier'
    ) {
      exportedLocals.add(statement.declaration.name);
    }
  }
  const result = new Map<string, TopLevel>();
  for (const statement of program.body) {
    const inner =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;
    if (!inner) continue;
    const doc = docOf(sourceCode, statement);
    for (const [name, declaration] of declared(inner)) {
      const existing = result.get(name);
      if (existing) {
        // Overloads share the first signature's JSDoc.
        existing.declarations.push(declaration);
        continue;
      }
      result.set(name, {
        name,
        node: declaration,
        declarations: [declaration],
        statement,
        doc,
        tags: doc ? releaseTags(doc.value) : [],
        exported: inner !== statement || exportedLocals.has(name),
      });
    }
  }
  return result;
};

/** A type position naming another declaration. */
export interface TypeReference {
  node: ESTree.Node;
  name: string;
}

/** The fields of AST nodes the walk below reads. */
interface LooseNode {
  type: string;
  name?: string | LooseNode;
  callee?: LooseNode;
  typeAnnotation?: LooseNode;
  returnType?: LooseNode | null;
  left?: LooseNode;
  object?: LooseNode;
  typeName?: LooseNode;
  exprName?: LooseNode;
  expression?: LooseNode;
  superClass?: LooseNode | null;
  accessibility?: string | null;
  key?: LooseNode;
}

const leftmost = (node: LooseNode | null | undefined): string | undefined => {
  if (!node) return undefined;
  if (node.type === 'Identifier') {
    return typeof node.name === 'string' ? node.name : undefined;
  }
  if (node.type === 'TSQualifiedName') return leftmost(node.left);
  if (node.type === 'MemberExpression') return leftmost(node.object);
  return undefined;
};

const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'TSDeclareFunction',
]);

/** The `return` arguments in a function body, outside nested functions. */
const returnedValues = (body: unknown): unknown[] => {
  const out: unknown[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    const n = value as LooseNode & { argument?: unknown };
    if (FUNCTIONS.has(n.type) || n.type === 'ClassBody') return;
    if (n.type === 'ReturnStatement') {
      out.push(n.argument);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'parent') visit(child);
    }
  };
  visit(body);
  return out;
};

/**
 * Names `node`'s type refers to: type references, `typeof`, `extends` and
 * `implements`, and for functions without a return type, `new X()` and
 * types in what they return. The rest of a function body and private class
 * members aren't part of the type, so they're skipped. Type parameters
 * aren't references.
 */
export const typeReferences = (node: ESTree.Node): TypeReference[] => {
  const out: TypeReference[] = [];
  const typeParameters = new Set<string>();
  const visit = (value: unknown, returned: boolean) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, returned);
      return;
    }
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    const n = value as LooseNode;
    const add = (target: LooseNode | null | undefined) => {
      const name = leftmost(target);
      if (name) out.push({ node: value as ESTree.Node, name });
    };
    switch (n.type) {
      case 'TSTypeParameter':
        if (typeof n.name === 'object') {
          const name = leftmost(n.name);
          if (name) typeParameters.add(name);
        }
        break;
      case 'TSTypeReference':
        add(n.typeName);
        break;
      case 'TSTypeQuery':
        add(n.exprName);
        break;
      case 'TSInterfaceHeritage':
      case 'TSClassImplements':
        add(n.expression);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        add(n.superClass);
        break;
      case 'NewExpression':
        if (returned) add(n.callee);
        break;
      // `x as T` has type `T`, whatever `x` is.
      case 'TSAsExpression':
      case 'TSTypeAssertion':
        if (returned) {
          visit(n.typeAnnotation, returned);
          return;
        }
        break;
      case 'PropertyDefinition':
      case 'MethodDefinition':
        if (
          n.accessibility === 'private' ||
          n.key?.type === 'PrivateIdentifier'
        ) {
          return;
        }
        break;
    }
    const isFunction = FUNCTIONS.has(n.type);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'parent') continue;
      if (key === 'body' && isFunction) {
        // Without a return type, what it returns is its type.
        if (n.returnType) continue;
        const expression =
          child && typeof child === 'object' && 'type' in child
            ? child.type !== 'BlockStatement'
            : false;
        visit(expression ? child : returnedValues(child), true);
        continue;
      }
      visit(child, returned);
    }
  };
  visit(node, false);
  return out.filter((ref) => !typeParameters.has(ref.name));
};

/**
 * The file's non-exported declarations that are public anyway, because the
 * type of a declaration in `roots` refers to them.
 */
export const exposedLocals = (
  declarations: ReadonlyMap<string, TopLevel>,
  roots: Iterable<TopLevel>,
): Set<string> => {
  const exposed = new Set<string>();
  const queue = [...roots];
  for (let next = queue.pop(); next; next = queue.pop()) {
    for (const declaration of next.declarations) {
      for (const { name } of typeReferences(declaration)) {
        const local = declarations.get(name);
        if (!local || local.exported || exposed.has(name)) continue;
        exposed.add(name);
        queue.push(local);
      }
    }
  }
  return exposed;
};
