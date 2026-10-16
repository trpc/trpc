import type { Record as EffectRecord } from "effect"
import { describe, expect, it } from "tstyche"

declare const symbolA: unique symbol
declare const symbolB: unique symbol
declare const StringBrand: unique symbol

type BrandedString = string & { readonly [StringBrand]: true }

describe("Record", () => {
  describe("ReadonlyRecord.GroupByResult", () => {
    it("returns a record for open key types", () => {
      expect<EffectRecord.ReadonlyRecord.GroupByResult<string, number>>().type.toBe<Record<string, number>>()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<symbol, number>>().type.toBe<Record<symbol, number>>()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<string | symbol, number>>().type.toBe<
        Record<string | symbol, number>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<`operation-${string}`, number>>().type.toBe<
        Record<`operation-${string}`, number>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<`operation-${number}`, number>>().type.toBe<
        Record<`operation-${number}`, number>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<BrandedString, number>>().type.toBe<
        Record<BrandedString, number>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<`operation-${string}` | symbol, number>>().type.toBe<
        Record<`operation-${string}` | symbol, number>
      >()
    })

    it("returns a partial record for finite string key types", () => {
      expect<EffectRecord.ReadonlyRecord.GroupByResult<"", number>>().type.toBe<Partial<Record<"", number>>>()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<"0", number>>().type.toBe<Partial<Record<"0", number>>>()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<"create", number>>().type.toBe<
        Partial<Record<"create", number>>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<"create" | "update", number>>().type.toBe<
        Partial<Record<"create" | "update", number>>
      >()
      expect<
        EffectRecord.ReadonlyRecord.GroupByResult<`operation-${"create" | "update"}`, number>
      >().type.toBe<Partial<Record<"operation-create" | "operation-update", number>>>()
    })

    it("returns a partial record for unique symbol key types", () => {
      expect<EffectRecord.ReadonlyRecord.GroupByResult<typeof symbolA, number>>().type.toBe<
        Partial<Record<typeof symbolA, number>>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<typeof symbolA | typeof symbolB, number>>().type.toBe<
        Partial<Record<typeof symbolA | typeof symbolB, number>>
      >()
    })

    it("returns a partial record when an open key type is mixed with a finite key type", () => {
      expect<EffectRecord.ReadonlyRecord.GroupByResult<"create" | symbol, number>>().type.toBe<
        Partial<Record<"create" | symbol, number>>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<string | typeof symbolA, number>>().type.toBe<
        Partial<Record<string | typeof symbolA, number>>
      >()
      expect<EffectRecord.ReadonlyRecord.GroupByResult<"create" | typeof symbolA, number>>().type.toBe<
        Partial<Record<"create" | typeof symbolA, number>>
      >()
    })

    it("returns an empty record when there are no keys", () => {
      expect<EffectRecord.ReadonlyRecord.GroupByResult<never, number>>().type.toBe<Record<never, number>>()
    })

    it("preserves property access and mutability", () => {
      const open = {} as EffectRecord.ReadonlyRecord.GroupByResult<string, number>
      expect(open.create).type.toBe<number | undefined>()
      open.create = 1

      const finite = {} as EffectRecord.ReadonlyRecord.GroupByResult<"create" | "update", number>
      expect(finite.create).type.toBe<number | undefined>()
      finite.create = 1
      // @ts-expect-error Property 'remove' does not exist
      void finite.remove

      const unique = {} as EffectRecord.ReadonlyRecord.GroupByResult<typeof symbolA, number>
      expect(unique[symbolA]).type.toBe<number | undefined>()
      unique[symbolA] = 1
      // @ts-expect-error does not exist on type
      void unique[symbolB]
    })
  })
})
