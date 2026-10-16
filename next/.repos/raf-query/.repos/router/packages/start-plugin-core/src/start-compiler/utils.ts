import { codeFrameColumns } from '@babel/code-frame'
import * as t from '@babel/types'
import type babel from '@babel/core'

export function codeFrameError(
  code: string,
  loc: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  },
  message: string,
) {
  const frame = codeFrameColumns(
    code,
    {
      start: loc.start,
      end: loc.end,
    },
    {
      highlightCode: true,
      message,
    },
  )

  return new Error(frame)
}

/**
 * Converts a bundler module ID to its physical-file identity for diagnostics,
 * filesystem matching, and file-based invalidation.
 *
 * Do not use this for IDs passed to resolve/load hooks or as module cache keys:
 * virtual prefixes and queries can be part of the module's semantic identity.
 */
export function cleanId(id: string): string {
  // Remove null byte prefix used by Vite/Rollup for virtual modules
  if (id.startsWith('\0')) {
    id = id.slice(1)
  }
  const queryIndex = id.indexOf('?')
  return queryIndex === -1 ? id : id.substring(0, queryIndex)
}

/**
 * Strips a method call by replacing it with its callee object.
 * E.g., `foo().bar()` -> `foo()`
 *
 * This is a common pattern used when removing method calls from chains
 * (e.g., removing .server() from middleware on client, or .validator() on client).
 *
 * @param callPath - The path to the CallExpression to strip
 */
export function stripMethodCall(
  callPath: babel.NodePath<t.CallExpression>,
): void {
  if (t.isMemberExpression(callPath.node.callee)) {
    callPath.replaceWith(callPath.node.callee.object)
  }
}
