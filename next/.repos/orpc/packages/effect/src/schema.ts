import type { Schema } from '@orpc/contract'
import { getHiddenMetaPlugins, setHiddenMetaPlugins } from '@orpc/contract'
import { Schema as EffectSchema } from 'effect'

export function toStandardSchema<S extends EffectSchema.ConstraintDecoder<any>>(
  schema: S,
): Schema<S['Encoded'], S['Type']> & S {
  const converted = EffectSchema.toStandardSchemaV1(schema)
  const metaPlugins = getHiddenMetaPlugins(schema)
  if (metaPlugins) {
    setHiddenMetaPlugins(converted, metaPlugins)
  }

  return converted
}
