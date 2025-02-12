import type {
  ASTPath,
  Identifier,
  JSCodeshift,
  MemberExpression,
} from 'jscodeshift';

/**
 * Walks the path upwards to look for the closest parent
 * of the mentioned type
 */
export function findParentOfType<TPath>(
  path: ASTPath<unknown>,
  type: JSCodeshift['AnyTypeAnnotation'],
): ASTPath<unknown> | false {
  if (!type.check(path.node)) {
    return findParentOfType(path.parentPath, type);
  }
  if (!path.parent) {
    return false;
  }
  return path as ASTPath<TPath>;
}

/**
 * Replaces the identifier for the root path key
 * of a member expression
 *
 * For dot notation like `rootKey.x.y.z` the AST
 * is constructed with the `rootKey` being nested deep
 * inside a wrapper MemberExpression holding `rootKey.x`
 * and so on
 *
 * This function helps replace the `rootKey` identifier with
 * the provided identifier node
 */
export function replaceMemberExpressionRootIndentifier(
  j: JSCodeshift,
  expr: MemberExpression,
  id: Identifier,
) {
  if (j.Identifier.check(expr.object)) {
    expr.object = id;
    return true;
  }
  if (j.MemberExpression.check(expr.object)) {
    return replaceMemberExpressionRootIndentifier(j, expr.object, id);
  }
  return false;
}

export const parser = 'tsx';
