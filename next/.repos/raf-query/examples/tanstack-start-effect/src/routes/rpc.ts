import { createFileRoute } from "@tanstack/react-router";

import { rpcServer } from "~/rpc-handlers.ts";

export const Route = createFileRoute("/rpc")({
	server: {
		handlers: { POST: (context) => rpcServer.handler(context.request) },
	},
});
