import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Yaml from "yaml"
import { ApiDiffError, isApiDiffError } from "./Error.ts"

export interface MigrationAnnotation {
  readonly replacement: string
  readonly note: string
  readonly example?: string | undefined
  readonly include?: boolean | undefined
}

const compareStrings = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

const parseAnnotation = (id: string, value: unknown, file: string): MigrationAnnotation => {
  if (
    typeof value !== "object" || value === null ||
    typeof Reflect.get(value, "replacement") !== "string" ||
    typeof Reflect.get(value, "note") !== "string" ||
    (Reflect.get(value, "example") !== undefined && typeof Reflect.get(value, "example") !== "string") ||
    (Reflect.get(value, "include") !== undefined && typeof Reflect.get(value, "include") !== "boolean")
  ) {
    throw new Error(`Invalid annotation for ${id} in ${file}`)
  }
  return {
    replacement: Reflect.get(value, "replacement"),
    note: Reflect.get(value, "note"),
    ...(Reflect.get(value, "example") === undefined ? {} : { example: Reflect.get(value, "example") }),
    ...(Reflect.get(value, "include") === undefined ? {} : { include: Reflect.get(value, "include") })
  }
}

const loadAnnotationsInternal = Effect.fnUntraced(function*(directory: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (!(yield* fs.exists(directory))) {
    return new Map<string, MigrationAnnotation>()
  }

  const annotations = new Map<string, MigrationAnnotation>()
  const files = (yield* fs.readDirectory(directory))
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort(compareStrings)
  for (const file of files) {
    const source = yield* fs.readFileString(path.join(directory, file))
    const document = yield* Effect.try({
      try: () => Yaml.parse(source) as unknown,
      catch: (cause) => new ApiDiffError({ message: `Could not parse annotation file ${file}`, cause })
    })
    if (typeof document !== "object" || document === null || Array.isArray(document)) {
      return yield* new ApiDiffError({ message: `Annotation file ${file} must contain an object` })
    }
    for (const [id, value] of Object.entries(document).sort(([left], [right]) => compareStrings(left, right))) {
      if (annotations.has(id)) {
        return yield* new ApiDiffError({ message: `Duplicate annotation id ${id}` })
      }
      const annotation = yield* Effect.try({
        try: () => parseAnnotation(id, value, file),
        catch: (cause) => new ApiDiffError({ message: String(cause), cause })
      })
      annotations.set(id, annotation)
    }
  }
  return annotations
})

export const loadAnnotations = (directory: string) =>
  loadAnnotationsInternal(directory).pipe(
    Effect.mapError((cause) =>
      isApiDiffError(cause)
        ? cause
        : new ApiDiffError({ message: `Could not load annotations from ${directory}`, cause })
    )
  )
