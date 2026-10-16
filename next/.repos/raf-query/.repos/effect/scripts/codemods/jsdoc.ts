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

  root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: "VariableDeclaration",
      declarations: [{
        type: "VariableDeclarator",
        id: {
          type: "Identifier",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: {
              type: "TSTypeLiteral",
              members: [{ type: "TSCallSignatureDeclaration" }]
            }
          }
        }
      }]
    }
  }).forEach((path) => {
    const comments = path.node.comments ?? []
    j(path).find(j.TSCallSignatureDeclaration).forEach((path) => {
      // Don't override comments if they already exist
      if (hasComments(path.node)) return
      path.node.comments = comments
    })
  })

  root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: "VariableDeclaration",
      declarations: [{
        type: "VariableDeclarator",
        init: {
          type: "CallExpression",
          callee: {
            type: "Identifier",
            name: "dual"
          }
        }
      }]
    }
  }).forEach((path) => {
    const comments = path.node.comments ?? []
    j(path).find(j.CallExpression).forEach((path) => {
      path.node.typeParameters?.params.forEach((param) => {
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
