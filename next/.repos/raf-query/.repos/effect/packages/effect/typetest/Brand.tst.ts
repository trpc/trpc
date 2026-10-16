import { Brand, Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("Brand", () => {
  it("FromConstructor", () => {
    type Positive = number & Brand.Brand<"Positive">
    const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))
    expect<Brand.Brand.FromConstructor<typeof Positive>>().type.toBe<Positive>()
  })

  it("Unbranded", () => {
    type Positive = number & Brand.Brand<"Positive">
    expect<Brand.Brand.Unbranded<Positive>>().type.toBe<number>()

    type PositiveInt = number & Brand.Brand<"Int"> & Brand.Brand<"Positive">
    expect<Brand.Brand.Unbranded<PositiveInt>>().type.toBe<number>()
  })

  it("Keys", () => {
    type Positive = number & Brand.Brand<"Positive">
    expect<Brand.Brand.Keys<Positive>>().type.toBe<"Positive">()

    type PositiveInt = number & Brand.Brand<"Int"> & Brand.Brand<"Positive">
    expect<Brand.Brand.Keys<PositiveInt>>().type.toBe<"Int" | "Positive">()
  })

  it("Brands", () => {
    type Positive = number & Brand.Brand<"Positive">
    expect<Brand.Brand.Brands<Positive>>().type.toBe<Brand.Brand<"Positive">>()

    type PositiveInt = number & Brand.Brand<"Int"> & Brand.Brand<"Positive">
    expect<Brand.Brand.Brands<PositiveInt>>().type.toBe<Brand.Brand<"Int"> & Brand.Brand<"Positive">>()
  })

  it("EnsureCommonBase", () => {
    type Int = number & Brand.Brand<"Int">
    const Int = Brand.check<Int>(Schema.isInt())

    type Positive = number & Brand.Brand<"Positive">
    const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))

    expect<Brand.Brand.EnsureCommonBase<[typeof Positive, typeof Int]>>().type.toBe<[typeof Positive, typeof Int]>()

    type MyString = string & Brand.Brand<"MyString">
    const MyString = Brand.nominal<MyString>()

    expect<Brand.Brand.EnsureCommonBase<[typeof MyString, typeof Int]>>().type.toBe<
      [typeof MyString, "ERROR: All brands should have the same base type"]
    >()
  })
})
