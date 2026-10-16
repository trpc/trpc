import { Schema, SchemaRepresentation } from "effect"
import { describe, expect, it } from "tstyche"

describe("Schema built-in revivers", () => {
  it("composes every built-in reviver without casts", () => {
    const revivers: ReadonlyArray<SchemaRepresentation.AnyReviver> = [
      SchemaRepresentation.isTrimmedReviver,
      SchemaRepresentation.isPatternReviver,
      SchemaRepresentation.isStringFiniteReviver,
      SchemaRepresentation.isStringBigIntReviver,
      SchemaRepresentation.isStringSymbolReviver,
      SchemaRepresentation.isUUIDReviver,
      SchemaRepresentation.isGUIDReviver,
      SchemaRepresentation.isULIDReviver,
      SchemaRepresentation.isBase64Reviver,
      SchemaRepresentation.isBase64UrlReviver,
      SchemaRepresentation.isStartingWithReviver,
      SchemaRepresentation.isEndingWithReviver,
      SchemaRepresentation.isIncludingReviver,
      SchemaRepresentation.isUppercasedReviver,
      SchemaRepresentation.isLowercasedReviver,
      SchemaRepresentation.isCapitalizedReviver,
      SchemaRepresentation.isUncapitalizedReviver,
      SchemaRepresentation.isFiniteReviver,
      SchemaRepresentation.isGreaterThanReviver,
      SchemaRepresentation.isGreaterThanOrEqualToReviver,
      SchemaRepresentation.isLessThanReviver,
      SchemaRepresentation.isLessThanOrEqualToReviver,
      SchemaRepresentation.isBetweenReviver,
      SchemaRepresentation.isMultipleOfReviver,
      SchemaRepresentation.isIntReviver,
      SchemaRepresentation.isMinLengthReviver,
      SchemaRepresentation.isMaxLengthReviver,
      SchemaRepresentation.isBetweenLengthReviver,
      SchemaRepresentation.isMinSizeReviver,
      SchemaRepresentation.isMaxSizeReviver,
      SchemaRepresentation.isBetweenSizeReviver,
      SchemaRepresentation.isMinPropertiesReviver,
      SchemaRepresentation.isMaxPropertiesReviver,
      SchemaRepresentation.isBetweenPropertiesReviver,
      SchemaRepresentation.isPropertyNamesReviver,
      SchemaRepresentation.isUniqueReviver,
      SchemaRepresentation.isUniqueKeyReviver,
      SchemaRepresentation.OptionReviver,
      SchemaRepresentation.ResultReviver,
      SchemaRepresentation.RedactedReviver,
      SchemaRepresentation.CauseReasonReviver,
      SchemaRepresentation.CauseReviver,
      SchemaRepresentation.ErrorInstanceReviver,
      SchemaRepresentation.ExitReviver,
      SchemaRepresentation.ReadonlyMapReviver,
      SchemaRepresentation.GraphReviver,
      SchemaRepresentation.HashMapReviver,
      SchemaRepresentation.ReadonlySetReviver,
      SchemaRepresentation.HashSetReviver,
      SchemaRepresentation.ChunkReviver,
      SchemaRepresentation.RegExpReviver,
      SchemaRepresentation.URLReviver,
      SchemaRepresentation.DateReviver,
      SchemaRepresentation.DurationReviver,
      SchemaRepresentation.ByteSizeReviver,
      SchemaRepresentation.BigDecimalReviver,
      SchemaRepresentation.FileReviver,
      SchemaRepresentation.FormDataReviver,
      SchemaRepresentation.URLSearchParamsReviver,
      SchemaRepresentation.Uint8ArrayReviver,
      SchemaRepresentation.DateTimeUtcReviver,
      SchemaRepresentation.TimeZoneOffsetReviver,
      SchemaRepresentation.TimeZoneNamedReviver,
      SchemaRepresentation.TimeZoneReviver,
      SchemaRepresentation.DateTimeZonedReviver,
      SchemaRepresentation.isGreaterThanDateReviver,
      SchemaRepresentation.isGreaterThanOrEqualToDateReviver,
      SchemaRepresentation.isLessThanDateReviver,
      SchemaRepresentation.isLessThanOrEqualToDateReviver,
      SchemaRepresentation.isBetweenDateReviver,
      SchemaRepresentation.isGreaterThanBigIntReviver,
      SchemaRepresentation.isGreaterThanOrEqualToBigIntReviver,
      SchemaRepresentation.isLessThanBigIntReviver,
      SchemaRepresentation.isLessThanOrEqualToBigIntReviver,
      SchemaRepresentation.isBetweenBigIntReviver,
      SchemaRepresentation.JsonReviver,
      SchemaRepresentation.MutableJsonReviver
    ]

    expect(revivers).type.toBe<ReadonlyArray<SchemaRepresentation.AnyReviver>>()
  })

  it("restricts isUniqueKey to arrays of key-value tuples", () => {
    const check = Schema.isUniqueKey<string, number>()

    Schema.Array(Schema.Tuple([Schema.String, Schema.Number])).check(check)
    Schema.Array(Schema.String).check(
      // @ts-expect-error Argument of type
      check
    )
  })
})
