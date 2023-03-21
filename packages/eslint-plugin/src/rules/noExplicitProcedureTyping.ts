import { AST_NODE_TYPES, TSESTree } from "@typescript-eslint/utils";
import { createRule } from "./util";

type Options = [
  {
    procedureNames: string[],
}
]

type MessageIds = 'explicit-procedure-typing'

export default createRule<Options, MessageIds>({
  create(context) {
  const isProcedureType = (node: TSESTree.MemberExpression) =>  node.property.type === AST_NODE_TYPES.Identifier && (node.property.name === 'query' || node.property.name === 'mutation')

    return {
      TSTypeParameterInstantiation(node) {
        if (node.parent?.type === AST_NODE_TYPES.CallExpression && node.parent.callee.type === AST_NODE_TYPES.MemberExpression) {
          if (isProcedureType(node.parent.callee)) {
            context.report({node, messageId: 'explicit-procedure-typing'})
          }
        }
      }
    }
  },
  name: "no-explicit-procedure-typings",
  defaultOptions: [{
  procedureNames: ['procedure']
  }],
  meta: {
    docs: {
      description: "Avoid explicitly typing procedures output",
      recommended: "error",
    },
    messages: {
      'explicit-procedure-typing': "Procedures should not be typed",
    },
    type: "suggestion",
    schema: [],
  },
})
