import * as DenoAddressResolver from "@effect/platform-deno/DenoAddressResolver"
import * as DenoDns from "@effect/platform-deno/DenoDns"
import * as Layer from "effect/Layer"
import { describeAddressResolver } from "../../node-shared/test/AddressResolver.test-utils.ts"

describeAddressResolver("DenoAddressResolver", DenoAddressResolver.layer.pipe(Layer.provide(DenoDns.layer)))
