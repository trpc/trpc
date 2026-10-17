/** Let queued microtasks and promise callbacks run. */
export function flush() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}
