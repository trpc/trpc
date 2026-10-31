import type { TSTypeKind } from "ast-types/gen/kinds"
import type * as cs from "jscodeshift"

//
// this is needed to resolve a bug in jscodeshift that
// forgets to traverse type parameters in call expressions
//
declare module "ast-types/gen/namedTypes.js" {
  namespace namedTypes {
    interface CallExpression extends TSHasOptionalTypeParameterInstantiation {}
  }
}

export default function transformer(file: cs.FileInfo, api: cs.API) {
  const j = api.jscodeshift

  const root = j(file.source)

  root.find(j.ExportNamedDeclaration).forEach((path) => {
    const declaration = path.node.declaration
    if (!j.VariableDeclaration.check(declaration)) return

    const comments = path.node.comments ?? []
    declaration.declarations.forEach((declarator) => {
      if (!j.VariableDeclarator.check(declarator) || !j.Identifier.check(declarator.id)) return

      const annotation = declarator.id.typeAnnotation
      if (annotation) {
        // An explicit annotation is the public type; leave the initializer alone.
        if (!j.TSTypeAnnotation.check(annotation) || !j.TSTypeLiteral.check(annotation.typeAnnotation)) return
        annotation.typeAnnotation.members.forEach((member) => {
          if (!j.TSCallSignatureDeclaration.check(member) || hasComments(member)) return
          member.comments = comments
        })
        return
      }

      const init = declarator.init
      if (!j.CallExpression.check(init)) return
      const callee = init.callee
      const isDual = j.Identifier.check(callee) && callee.name === "dual"
        || j.MemberExpression.check(callee) && !callee.computed
          && j.Identifier.check(callee.object) && callee.object.name === "Dual"
          && j.Identifier.check(callee.property) && callee.property.name === "dual"
      if (!isDual) return

      // Only the dual call's own type arguments describe the public overloads.
      init.typeParameters?.params.forEach((param) => {
        // Don't override comments if they already exist
        if (hasLeadingCommentRanges(param) || hasComments(param)) return
        param.comments = comments
      })
    })
  })

  return root.toSource()
}

function hasComments(node: cs.Node) {
  return Array.isArray(node.comments)
}

function hasLeadingCommentRanges(node: TSTypeKind) {
  return "leadingComments" in node && Array.isArray(node.leadingComments) && node.leadingComments.length > 0
}
