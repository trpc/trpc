import * as Schema from "effect/Schema"

export const Bucket = Schema.Literals(["type", "value"])

export type Bucket = typeof Bucket.Type

export const SourceLocation = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  column: Schema.Number
})

export type SourceLocation = typeof SourceLocation.Type

export interface Documentation {
  readonly summary?: string | undefined
  readonly deprecated?: string | undefined
  readonly since?: string | undefined
  readonly category?: string | undefined
  readonly stability?: "stable" | "unstable" | "experimental" | undefined
}

export interface TypeModel {
  readonly kind: string
  readonly [key: string]: unknown
}

export interface DeclarationModel {
  readonly kind: string
  readonly name: string
  readonly typeParameters?: ReadonlyArray<TypeParameterModel> | undefined
  readonly parameters?: ReadonlyArray<ParameterModel> | undefined
  readonly returnType?: TypeModel | undefined
  readonly type?: TypeModel | undefined
  readonly members?: ReadonlyArray<DeclarationModel> | undefined
  readonly overloads?: ReadonlyArray<DeclarationModel> | undefined
  readonly heritage?: ReadonlyArray<TypeModel> | undefined
  readonly modifiers?: ReadonlyArray<string> | undefined
  readonly value?: string | number | undefined
}

export interface TypeParameterModel {
  readonly id: string
  readonly displayName: string
  readonly constraint?: TypeModel | undefined
  readonly default?: TypeModel | undefined
}

export interface ParameterModel {
  readonly name: string
  readonly type: TypeModel
  readonly optional: boolean
  readonly rest: boolean
  readonly modifiers?: ReadonlyArray<string> | undefined
}

export interface ImportRoute {
  readonly module: string
  readonly path: ReadonlyArray<string>
}

export interface ApiEntity {
  readonly id: string
  readonly packageName: string
  readonly module: string
  readonly path: ReadonlyArray<string>
  readonly bucket: Bucket
  readonly declarationKind: string
  readonly importRoutes: ReadonlyArray<ImportRoute>
  readonly declarations: ReadonlyArray<DeclarationModel>
  readonly displaySignature: string
  readonly fingerprint: string
  readonly documentation: Documentation
  readonly source: SourceLocation
}

export interface Entrypoint {
  readonly packageName: string
  readonly module: string
  readonly declarationFile: string
}

export const SnapshotDiagnostic = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  module: Schema.optional(Schema.String),
  path: Schema.optional(Schema.Array(Schema.String)),
  source: Schema.optional(SourceLocation)
})

export type SnapshotDiagnostic = typeof SnapshotDiagnostic.Type

export interface ApiSnapshot {
  readonly version: 1
  readonly compiler: {
    readonly name: "typescript"
    readonly version: string
  }
  readonly ref: string
  readonly sha: string
  readonly packages: ReadonlyArray<string>
  readonly entrypoints: ReadonlyArray<Entrypoint>
  readonly entities: ReadonlyArray<ApiEntity>
  readonly diagnostics: ReadonlyArray<SnapshotDiagnostic>
}

export type ChangeClassification =
  | "package-added"
  | "package-removed"
  | "module-added"
  | "module-removed"
  | "api-added"
  | "api-removed"
  | "api-moved"
  | "api-renamed"
  | "bucket-changed"
  | "declaration-kind-changed"
  | "overload-added"
  | "overload-removed"
  | "overload-reordered"
  | "parameter-added"
  | "parameter-removed"
  | "parameter-reordered"
  | "parameter-changed"
  | "return-type-changed"
  | "generic-parameter-changed"
  | "member-added"
  | "member-removed"
  | "member-changed"
  | "heritage-changed"
  | "union-member-changed"
  | "intersection-member-changed"
  | "documentation-changed"
  | "structural-change"

export interface ApiChange {
  readonly id: string
  readonly classification: ChangeClassification
  readonly confidence: number
  readonly baseApiId?: string | undefined
  readonly headApiId?: string | undefined
  readonly before?: string | undefined
  readonly after?: string | undefined
  readonly delta?: unknown
  readonly baseSource?: SourceLocation | undefined
  readonly headSource?: SourceLocation | undefined
  readonly reviewNotes?: string | undefined
  readonly authoritative: boolean
}

export interface ApiDiff {
  readonly version: 1
  readonly base: { readonly ref: string; readonly sha: string }
  readonly head: { readonly ref: string; readonly sha: string }
  readonly changes: ReadonlyArray<ApiChange>
}
