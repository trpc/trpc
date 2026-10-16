type Listener = () => void;

let queued: Set<Listener> | undefined;

/**
 * Calls `listener` in a microtask, once per batch. State changes made while
 * React renders (a fetch started by a read) must not notify subscribers
 * synchronously, and several changes in one turn should re-render once.
 */
export function scheduleNotify(listener: Listener) {
	if (queued) {
		queued.add(listener);
		return;
	}
	const batch = new Set([listener]);
	queued = batch;
	queueMicrotask(() => {
		queued = undefined;
		for (const queuedListener of batch) {
			queuedListener();
		}
	});
}
