import { formatPath } from "../Formatter.ts"

/** @internal */
export function errorWithPath(message: string, path: ReadonlyArray<PropertyKey>) {
  if (path.length > 0) {
    message += `\n  at ${formatPath(path)}`
  }
  return new Error(message)
}
