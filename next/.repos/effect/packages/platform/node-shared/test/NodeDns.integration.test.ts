import * as NodeDns from "@effect/platform-node-shared/NodeDns"
import * as NetAddress from "effect/net/NetAddress"
import { describeDnsServer } from "./Dns.test-utils.ts"

describeDnsServer("NodeDns", (nameServer) => NodeDns.make({ nameServers: [NetAddress.formatInet(nameServer)] }))
