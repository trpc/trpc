import type * as Redacted from "../Redacted.ts"

/** @internal */
export const redactedRegistry = new WeakMap<Redacted.Redacted<any>, any>()

/** @internal */
export const value = <T>(self: Redacted.Redacted<T>): T => {
  if (redactedRegistry.has(self)) {
    return redactedRegistry.get(self)
  } else {
    throw new Error(
      "Unable to get redacted value" +
        (self.label ? ` with label: "${self.label}"` : "")
    )
  }
}

/** @internal */
export const stringOrRedacted = (val: string | Redacted.Redacted): string => typeof val === "string" ? val : value(val)
