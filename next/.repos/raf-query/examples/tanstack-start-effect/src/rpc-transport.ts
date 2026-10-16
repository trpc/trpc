import type { RpcTransport } from "./issues.ts";
import { rpcServer } from "./rpc-handlers.ts";

/**
 * Calls the RPC server in this process, without a network round trip. Server
 * rendering uses it: a request to the server's own origin would need to know
 * the origin, and would hold a second connection while the page renders. The
 * host is a placeholder; the server routes by path.
 */
export const rpcTransport: RpcTransport = {
	fetch: (input, init) => rpcServer.handler(new Request(input, init)),
	url: "http://in-process/rpc",
};
