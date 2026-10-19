import type { ASTPath, JSCodeshift } from 'jscodeshift';

/**
 * Walks the path upwards to look for the closest parent
 * of the mentioned type
 */
export function findParentOfType<TPath>(
  path: ASTPath<unknown>,
  type: JSCodeshift['AnyType'],
): ASTPath<TPath> | false {
  if (!path.parent) {
    return false;
  }
  return type.check(path.node)
    ? (path as ASTPath<TPath>)
    : findParentOfType(path.parentPath, type);
}
