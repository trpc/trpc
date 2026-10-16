import { toast } from "sonner";

/**
 * True on the deployed demos (not localhost). The mock DB is fine in one
 * long-lived `pnpm dev` / `pnpm start` process; Vercel's serverless isolates
 * each get their own seed. Set `sessionStorage.raf-query-mock-db-toast` to
 * `"1"` to preview the toast locally.
 *
 * Call only from the browser (the example mutations are client form actions /
 * transitions).
 */
function isProductionDemo() {
	if (window.sessionStorage.getItem("raf-query-mock-db-toast") === "1") {
		return true;
	}
	const { hostname } = window.location;
	return (
		hostname !== "localhost" &&
		hostname !== "127.0.0.1" &&
		hostname !== "[::1]" &&
		!hostname.endsWith(".local")
	);
}

/**
 * Warn that writes go to an in-memory mock DB, which does not behave like a
 * real database on Vercel's serverless runtime. Same toast id so repeats
 * refresh one notice instead of stacking.
 */
export function warnMockDbWrite() {
	if (!isProductionDemo()) {
		return;
	}
	toast.warning("Edits may not stick on this demo", {
		description:
			"This app uses an in-memory mock database. On Vercel, the next request can hit a different instance, so changes often disappear after a refresh.",
		duration: 8000,
		id: "mock-db-write",
	});
}
