import { headers } from "next/headers";

// The function `app/api/[...path]/route.ts` exports as `GET` and `POST`.
import { handler } from "./api-handler.ts";

export async function apiFetch(path: string, init?: RequestInit) {
	const forwarded = new Headers(init?.headers);
	const cookie = (await headers()).get("cookie");
	if (cookie !== null) {
		forwarded.set("cookie", cookie);
	}
	// The host is a placeholder: the handler routes by path.
	const url = new URL(path, "http://localhost");
	return handler(new Request(url, { ...init, headers: forwarded }));
}
