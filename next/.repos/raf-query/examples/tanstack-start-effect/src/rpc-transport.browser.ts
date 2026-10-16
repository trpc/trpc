import type { RpcTransport } from "./issues.ts";

/** Calls the RPC server over HTTP, on the page's origin. */
export const rpcTransport: RpcTransport = { url: "/rpc" };
