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
  type: JSCodeshift['AnyType'],
): ASTPath<unknown> | false {
  if (!type.check(path.node)) {
    return findParentOfType(path.parentPath, type);
  }
  if (!path.parent) {
    return false;
  }
  return path as ASTPath<TPath>;
}
