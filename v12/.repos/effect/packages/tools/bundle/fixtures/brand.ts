import * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"

type Positive = number & Brand.Brand<"Positive">
export const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))
