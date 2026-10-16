import {
	createFromReadableStream,
	getClientEntryUrl,
} from "@vitejs/plugin-rsc/ssr";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

export async function renderHtml(payload: ReadableStream<Uint8Array>) {
	const root = await createFromReadableStream<ReactNode>(payload);
	const html = await renderToReadableStream(root, {
		bootstrapModules: [getClientEntryUrl()],
	});
	await html.allReady;
	return html;
}
