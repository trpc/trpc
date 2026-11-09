import * as BunAddressResolver from "@effect/platform-bun/BunAddressResolver"
import * as BunDns from "@effect/platform-bun/BunDns"
import * as Layer from "effect/Layer"
import { describeAddressResolver } from "../../node-shared/test/AddressResolver.test-utils.ts"

describeAddressResolver("BunAddressResolver", BunAddressResolver.layer.pipe(Layer.provide(BunDns.layer)))
