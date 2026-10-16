import * as t from '@babel/types'
import {
  getObjectPropertyKeyName,
  getUniqueProgramIdentifier,
} from '../../utils'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

const REACT_REFRESH_ROUTE_COMPONENT_IDENTS = new Set([
  'component',
  'shellComponent',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
])

type RouteComponentContext = {
  programPath: Parameters<typeof getUniqueProgramIdentifier>[0]
  insertionPath: { insertBefore: (nodes: Array<t.VariableDeclaration>) => void }
  routeOptions: t.ObjectExpression
}

function isReactComponentName(name: string) {
  const firstCharacter = name[0]

  return (
    firstCharacter !== undefined &&
    firstCharacter >= 'A' &&
    firstCharacter <= 'Z'
  )
}

function getRouteComponentKey(prop: t.ObjectProperty) {
  const key = getObjectPropertyKeyName(prop)

  return key && REACT_REFRESH_ROUTE_COMPONENT_IDENTS.has(key) ? key : undefined
}

function prepareRouteComponentsForReactRefresh(ctx: RouteComponentContext) {
  const hoistedDeclarations: Array<t.VariableDeclaration> = []
  let modified = false

  for (const prop of ctx.routeOptions.properties) {
    if (!t.isObjectProperty(prop)) {
      continue
    }

    const key = getRouteComponentKey(prop)

    if (!key) {
      continue
    }

    if (t.isIdentifier(prop.value)) {
      if (isReactComponentName(prop.value.name)) {
        continue
      }

      const bindingNode = ctx.programPath.scope.getBinding(prop.value.name)
        ?.path.node
      const isLocalComponentBinding =
        t.isFunctionDeclaration(bindingNode) ||
        t.isClassDeclaration(bindingNode) ||
        t.isVariableDeclarator(bindingNode)

      if (!isLocalComponentBinding) {
        continue
      }

      const componentIdentifier = getUniqueProgramIdentifier(
        ctx.programPath,
        `TSR${key[0]!.toUpperCase()}${key.slice(1)}`,
      )

      ctx.programPath.scope.rename(prop.value.name, componentIdentifier.name)
      modified = true
      continue
    }

    if (
      !t.isArrowFunctionExpression(prop.value) &&
      !t.isFunctionExpression(prop.value)
    ) {
      continue
    }

    const hoistedIdentifier = getUniqueProgramIdentifier(
      ctx.programPath,
      `TSR${key[0]!.toUpperCase()}${key.slice(1)}`,
    )

    hoistedDeclarations.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(hoistedIdentifier, t.cloneNode(prop.value, true)),
      ]),
    )

    prop.value = t.cloneNode(hoistedIdentifier)
    modified = true
  }

  if (hoistedDeclarations.length > 0) {
    ctx.insertionPath.insertBefore(hoistedDeclarations)
  }

  return modified
}

export function createReactRefreshRouteComponentsPlugin(): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-refresh-route-components',
    getStableRouteOptionKeys() {
      return [...REACT_REFRESH_ROUTE_COMPONENT_IDENTS]
    },
    onAddHmr(ctx) {
      if (prepareRouteComponentsForReactRefresh(ctx)) {
        return { modified: true }
      }

      return
    },
    onVirtualRouteSplitNode(ctx) {
      if (
        ctx.splitNodeMeta.splitStrategy !== 'lazyRouteComponent' ||
        !t.isFunctionDeclaration(ctx.splitNode) ||
        !ctx.splitNode.id ||
        isReactComponentName(ctx.splitNode.id.name)
      ) {
        return
      }

      const componentIdentifier = getUniqueProgramIdentifier(
        ctx.programPath,
        ctx.splitNodeMeta.localExporterIdent,
      )

      ctx.programPath.scope.rename(
        ctx.splitNode.id.name,
        componentIdentifier.name,
      )
    },
  }
}
