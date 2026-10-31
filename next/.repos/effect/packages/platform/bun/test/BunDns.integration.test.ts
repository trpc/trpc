import * as BunDns from "@effect/platform-bun/BunDns"
import { describeDnsServer } from "../../node-shared/test/Dns.test-utils.ts"

describeDnsServer("BunDns", (nameServer) => BunDns.make({ nameServers: [nameServer] }))
