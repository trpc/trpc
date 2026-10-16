import { jitlessFixture as fixture } from "./zod-cases.ts"

export const parseValid = () => fixture("parseValid")
export const parseInvalid = () => fixture("parseInvalid")
export const isValid = () => fixture("isValid")
export const isInvalid = () => fixture("isInvalid")
export const array = () => fixture("array")
export const record = () => fixture("record")
export const recordTransformedKeys = () => fixture("recordTransformedKeys")
export const union = () => fixture("union")
export const transform = () => fixture("transform")
export const makeStruct = () => fixture("makeStruct")
export const makeArray = () => fixture("makeArray")
