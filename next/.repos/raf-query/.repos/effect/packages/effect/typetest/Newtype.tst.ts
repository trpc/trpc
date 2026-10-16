import { type Combiner, Equivalence, Newtype, Number, type Optic, Order, type Reducer } from "effect"
import { describe, expect, it } from "tstyche"

interface Label extends Newtype.Newtype<"Label", string> {}
interface UserId extends Newtype.Newtype<"UserId", number> {}
interface OrderId extends Newtype.Newtype<"OrderId", number> {}

const labelIso = Newtype.makeIso<Label>()
const userIdIso = Newtype.makeIso<UserId>()

declare function acceptString(s: string): void
declare function acceptUserId(id: UserId): void

describe("Newtype", () => {
  it("should not be assignable to the carrier type", () => {
    const label = labelIso.set("a")
    expect(acceptString).type.not.toBeCallableWith(label)
  })

  it("two newtypes with different keys are not assignable", () => {
    const userId = Newtype.makeIso<UserId>().set(1)
    expect(acceptUserId).type.not.toBeCallableWith(Newtype.makeIso<OrderId>().set(1))
    expect(acceptUserId).type.toBeCallableWith(userId)
  })

  it("Newtype.Key", () => {
    expect<Newtype.Newtype.Key<Label>>().type.toBe<"Label">()
    expect<Newtype.Newtype.Key<UserId>>().type.toBe<"UserId">()
  })

  it("Newtype.Carrier", () => {
    expect<Newtype.Newtype.Carrier<Label>>().type.toBe<string>()
    expect<Newtype.Newtype.Carrier<UserId>>().type.toBe<number>()
  })

  it("value", () => {
    const label = labelIso.set("a")
    expect(Newtype.value(label)).type.toBe<string>()
    const userId = Newtype.makeIso<UserId>().set(42)
    expect(Newtype.value(userId)).type.toBe<number>()
  })

  it("makeIso", () => {
    const label = labelIso.set("a")
    expect(labelIso).type.toBe<Optic.Iso<Label, string>>()
    expect(label).type.toBe<Label>()
    expect(labelIso.get(label)).type.toBe<string>()
  })

  it("makeEquivalence", () => {
    const eq = Newtype.makeEquivalence<Label>(Equivalence.String)
    expect(eq).type.toBe<Equivalence.Equivalence<Label>>()
  })

  it("makeOrder", () => {
    const ord = Newtype.makeOrder<UserId>(Order.Number)
    expect(ord).type.toBe<Order.Order<UserId>>()
  })

  it("makeCombiner", () => {
    const combiner = Newtype.makeCombiner<UserId>(Number.ReducerSum)
    expect(combiner).type.toBe<Combiner.Combiner<UserId>>()
    expect(combiner.combine(userIdIso.set(10), userIdIso.set(20))).type.toBe<UserId>()
  })

  it("makeReducer", () => {
    const reducer = Newtype.makeReducer<UserId>(Number.ReducerSum)
    expect(reducer).type.toBe<Reducer.Reducer<UserId>>()
    expect(reducer.initialValue).type.toBe<UserId>()
    expect(reducer.combineAll([userIdIso.set(10), userIdIso.set(20)])).type.toBe<UserId>()
  })
})
