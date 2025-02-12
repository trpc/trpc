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
