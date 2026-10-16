import * as Optic from "../../Optic.ts"
import type * as Schema from "../../Schema.ts"
import * as SchemaParser from "../../SchemaParser.ts"
import * as InternalToCodec from "./toCodec.ts"

/** @internal */
export function toIso<S extends Schema.Constraint>(schema: S): Optic.Iso<S["Type"], S["Iso"]> {
  const serializer = InternalToCodec.toCodecIso(schema)
  return Optic.makeIso(SchemaParser.encodeSync(serializer), SchemaParser.decodeSync(serializer))
}

/** @internal */
export function toIsoSource<S extends Schema.Constraint>(_: S): Optic.Iso<S["Type"], S["Type"]> {
  return Optic.id()
}

/** @internal */
export function toIsoFocus<S extends Schema.Constraint>(_: S): Optic.Iso<S["Iso"], S["Iso"]> {
  return Optic.id()
}
