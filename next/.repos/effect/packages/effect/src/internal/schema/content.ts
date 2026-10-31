const ContentTypeId = Symbol.for("~effect/Schema/content")

/** @internal */
export interface Content {
  readonly mediaType: string
  readonly preserveSchema: boolean
}

/** @internal */
export function setContent<A extends object>(operation: A, content: Content): A {
  Object.defineProperty(operation, ContentTypeId, { value: content })
  return operation
}

/** @internal */
export function getContent(operation: object): Content | undefined {
  return (operation as { readonly [ContentTypeId]?: Content })[ContentTypeId]
}
