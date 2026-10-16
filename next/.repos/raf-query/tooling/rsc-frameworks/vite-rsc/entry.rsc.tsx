import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";

import { Page } from "./page.tsx";

/** `?rsc` responds with the RSC payload, anything else with HTML. */
export default async function handler(request: Request) {
	const payload = renderToReadableStream(<Page />);
	if (new URL(request.url).searchParams.has("rsc")) {
		return new Response(payload, {
			headers: { "content-type": "text/x-component;charset=utf-8" },
		});
	}
	const ssr = await import.meta.viteRsc.loadModule<
		typeof import("./entry.ssr.tsx")
	>("ssr", "index");
	return new Response(await ssr.renderHtml(payload), {
		headers: { "content-type": "text/html" },
	});
}
