import { app } from "@examples/api";
import { createFileRoute } from "@tanstack/react-router";

function handler(context: { readonly request: Request }) {
	return app.fetch(context.request);
}

export const Route = createFileRoute("/api/$")({
	server: { handlers: { GET: handler, PATCH: handler, POST: handler } },
});
