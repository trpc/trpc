/** @internal */
export function assignProperty(self: object, key: PropertyKey, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(self, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    })
  } else {
    ;(self as any)[key] = value
  }
}

/** @internal */
export function assignProperties(self: object, source: object): void {
  for (const key of Reflect.ownKeys(source)) {
    if (Object.prototype.propertyIsEnumerable.call(source, key)) {
      assignProperty(self, key, (source as any)[key])
    }
  }
}
