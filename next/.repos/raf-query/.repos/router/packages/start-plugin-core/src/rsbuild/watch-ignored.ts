import { escapeRegExp } from '../utils'
import type { Rspack } from '@rsbuild/core'

type WatchIgnored = NonNullable<Rspack.Configuration['watchOptions']>['ignored']

export function addWorkspaceWatchIgnored(
  ignored: WatchIgnored,
  directories: Array<string>,
): WatchIgnored {
  const workspace = new RegExp(
    directories.map((path) => `^${escapeRegExp(path)}(?:[\\\\/]|$)`).join('|'),
  )
  if (typeof ignored === 'function') {
    return (entry) => ignored(entry) || workspace.test(entry)
  }
  if (typeof ignored === 'string') {
    return [ignored, ...directories]
  }
  if (Array.isArray(ignored)) {
    return [...ignored, ...directories]
  }
  const original = ignored ?? /[\\/](?:\.git|node_modules)[\\/]/
  return new RegExp(`${original.source}|${workspace.source}`, original.flags)
}
