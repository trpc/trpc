import { app } from "@examples/api";

function handler(request: Request) {
	return app.fetch(request);
}

export { handler as GET, handler as PATCH, handler as POST };
