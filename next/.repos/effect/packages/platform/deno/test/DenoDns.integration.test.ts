import * as DenoDns from "@effect/platform-deno/DenoDns"
import * as NetAddress from "effect/net/NetAddress"
import { describeDnsServer } from "../../node-shared/test/Dns.test-utils.ts"

describeDnsServer("DenoDns", (nameServer) => DenoDns.make({ nameServer: NetAddress.formatInet(nameServer) }))
