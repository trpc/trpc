import { Context, Effect } from "effect";

/** `"focus"`: the page became visible. `"online"`: the browser reconnected. */
export type PlatformEvent = "focus" | "online";

/**
 * The page a cache runs in: whether there is one, and its focus and network
 * state. The default reads the global `window`, `document` and `navigator`;
 * provide another to run a cache against a fake page.
 */
export interface Platform {
	isOnlineUnsafe(): boolean;
	/** No page to watch: a server render. */
	readonly isServer: boolean;
	isVisibleUnsafe(): boolean;
	/** Call `listener` on every focus and reconnect until unsubscribed. */
	subscribeUnsafe(listener: (event: PlatformEvent) => void): () => void;
}

const globalPlatform: Platform = {
	isOnlineUnsafe: () =>
		!("window" in globalThis) ||
		!("navigator" in globalThis) ||
		!("onLine" in navigator) ||
		navigator.onLine,
	get isServer() {
		return !("window" in globalThis);
	},
	isVisibleUnsafe: () =>
		!("document" in globalThis) || document.visibilityState !== "hidden",
	subscribeUnsafe(listener) {
		if (!("window" in globalThis)) {
			return () => {};
		}
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				listener("focus");
			}
		};
		const onOnline = () => listener("online");
		window.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("online", onOnline);
		return () => {
			window.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("online", onOnline);
		};
	},
};

export const Platform = /*#__PURE__*/ Context.Reference<Platform>(
	"@raf-query/core/Platform",
	{
		defaultValue: () => globalPlatform,
	},
);

/**
 * Succeeds now if the platform is online, else on its next `"online"` event.
 * Interrupting it unsubscribes.
 */
export const whenOnline: Effect.Effect<void> = /*#__PURE__*/ Effect.gen(
	function* () {
		const platform = yield* Platform;
		if (platform.isOnlineUnsafe()) {
			return;
		}
		yield* Effect.callback<void>((resume) => {
			const unsubscribe = platform.subscribeUnsafe((event) => {
				if (event === "online") {
					resume(Effect.void);
				}
			});
			return Effect.sync(unsubscribe);
		});
	},
);
