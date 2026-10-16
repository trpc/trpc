// The browser sends the page's cookies to its own origin.
export function apiFetch(path: string, init?: RequestInit) {
	return fetch(path, init);
}
