import * as Optic from "effect/Optic"

type S = { readonly a: number }
const optic = Optic.id<S>().key("a")

export const result = optic.getResult({ a: 1 })
