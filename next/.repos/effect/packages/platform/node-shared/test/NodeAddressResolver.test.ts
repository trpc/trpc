import * as NodeAddressResolver from "@effect/platform-node-shared/NodeAddressResolver"
import * as NodeDns from "@effect/platform-node-shared/NodeDns"
import * as Layer from "effect/Layer"
import { describeAddressResolver } from "./AddressResolver.test-utils.ts"

describeAddressResolver("NodeAddressResolver", NodeAddressResolver.layer.pipe(Layer.provide(NodeDns.layer)))
