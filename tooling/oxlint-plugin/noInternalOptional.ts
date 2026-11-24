import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { exposedLocals, topLevelDeclarations } from './declarations.ts';
import type { TopLevel } from './declarations.ts';

/**
 * `@oxlint/plugins` types a binding identifier's `optional` as `false`, but
 * it's `true` for `a?: T`.
 */
function isOptional(node: { optional?: boolean }): boolean {
  return node.optional === true;
}

type Param = ESTree.ParamPattern | ESTree.TSParameterProperty;

/**
 * Internal parameters, properties and options are required: absence is
 * passed as `null`, `undefined`, a literal or a symbol. Optionals are only
 * for public APIs, normalised once at the boundary.
 *
 * Internal means a top-level declaration tagged `@internal`, or one the file
 * doesn't export that no public declaration's type refers to and that isn't
 * tagged `@public`. Untagged exports count as public (`trpc/release-tag`
 * asks for a tag). Checks
 * function and method parameters, the members of interfaces, object types
 * and classes, and object types written inline in them.
 */
export const noInternalOptional = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow optional and defaulted parameters and properties on internal declarations',
    },
    schema: [],
    messages: {
      optionalParameter:
        'Internal parameter `{{name}}` is optional - make it required and pass `null`, `undefined`, a literal or a symbol',
      defaultParameter:
        'Internal parameter `{{name}}` has a default - make it required and pass the value at each call site',
      optionalProperty:
        'Internal option `{{name}}` is optional - make it required and pass `null`, `undefined`, a literal or a symbol',
    },
  },
  create(context) {
    const text = (node: ESTree.Node) => context.sourceCode.getText(node);

    const checkMembers = (members: ESTree.Node[]) => {
      for (const member of members) {
        if (
          member.type === 'TSCallSignatureDeclaration' ||
          member.type === 'TSConstructSignatureDeclaration'
        ) {
          checkParams(member.params);
          continue;
        }
        if (
          member.type !== 'TSPropertySignature' &&
          member.type !== 'TSMethodSignature' &&
          member.type !== 'PropertyDefinition'
        ) {
          continue;
        }
        if (member.optional) {
          context.report({
            node: member,
            messageId: 'optionalProperty',
            data: { name: text(member.key) },
          });
        }
        if (member.type === 'TSMethodSignature') {
          checkParams(member.params);
        } else if (member.typeAnnotation) {
          checkType(member.typeAnnotation.typeAnnotation);
        }
      }
    };
    // Named types are checked where they're declared.
    const checkType = (type: ESTree.TSType): void => {
      if (type.type === 'TSUnionType' || type.type === 'TSIntersectionType') {
        for (const constituent of type.types) checkType(constituent);
      } else if (type.type === 'TSTypeLiteral') {
        checkMembers(type.members);
      } else if (
        type.type === 'TSFunctionType' ||
        type.type === 'TSConstructorType'
      ) {
        checkParams(type.params);
      } else if (type.type === 'TSArrayType') {
        checkType(type.elementType);
      }
    };
    const checkInlineType = (param: {
      typeAnnotation?: ESTree.TSTypeAnnotation | null;
    }) => {
      if (param.typeAnnotation) {
        checkType(param.typeAnnotation.typeAnnotation);
      }
    };

    const checkParams = (params: Param[]) => {
      for (const p of params) {
        const param = p.type === 'TSParameterProperty' ? p.parameter : p;
        if (param.type === 'AssignmentPattern') {
          context.report({
            node: param,
            messageId: 'defaultParameter',
            data: {
              name:
                param.left.type === 'Identifier'
                  ? param.left.name
                  : text(param.left),
            },
          });
          checkInlineType(param.left);
          continue;
        }
        if (param.type === 'Identifier' && isOptional(param)) {
          context.report({
            node: param,
            messageId: 'optionalParameter',
            data: { name: param.name },
          });
        }
        checkInlineType(param);
      }
    };

    const check = (declaration: TopLevel['declarations'][number]) => {
      switch (declaration.type) {
        case 'FunctionDeclaration':
        case 'TSDeclareFunction':
          checkParams(declaration.params);
          break;
        case 'VariableDeclarator': {
          // `const f: (a?: T) => void = ...` declares what callers see.
          if (declaration.id.type === 'Identifier')
            checkInlineType(declaration.id);
          const init = declaration.init;
          if (
            init?.type === 'ArrowFunctionExpression' ||
            init?.type === 'FunctionExpression'
          ) {
            checkParams(init.params);
          }
          break;
        }
        case 'TSInterfaceDeclaration':
          checkMembers(declaration.body.body);
          break;
        case 'TSTypeAliasDeclaration':
          checkType(declaration.typeAnnotation);
          break;
        // Enums have no optionals, and expressions aren't top-level
        // declarations.
        case 'TSEnumDeclaration':
        case 'ClassExpression':
        case 'FunctionExpression':
        case 'TSEmptyBodyFunctionExpression':
          break;
        case 'ClassDeclaration':
          for (const member of declaration.body.body) {
            if (member.type === 'MethodDefinition') {
              checkParams(member.value.params);
            }
          }
          checkMembers(declaration.body.body);
          break;
      }
    };

    return {
      Program(program) {
        const declarations = topLevelDeclarations(program, context.sourceCode);
        const isInternalExport = (d: TopLevel) =>
          d.tags.length > 0 && d.tags.every((tag) => tag === 'internal');
        const exposed = exposedLocals(
          declarations,
          [...declarations.values()].filter((d) =>
            d.exported ? !isInternalExport(d) : d.tags.includes('public'),
          ),
        );
        for (const d of declarations.values()) {
          // A non-exported declaration can say it's `@public` when it
          // reaches users without a public type naming it.
          const internal = d.exported
            ? isInternalExport(d)
            : !exposed.has(d.name) && !d.tags.includes('public');
          if (!internal) continue;
          for (const declaration of d.declarations) check(declaration);
        }
      },
    };
  },
});
