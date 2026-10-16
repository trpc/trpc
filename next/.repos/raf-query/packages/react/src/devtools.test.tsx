import { describe, expect, it, vi } from "@effect/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { type ReactNode, Suspense, use } from "react";
import { renderToString } from "react-dom/server";

import { preview } from "./devtools-panel.tsx";
import { QueryDevtools, QueryDevtoolsPanel } from "./devtools.tsx";
import {
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	useQuery,
	Query,
} from "./index.ts";

function createBackend() {
	const open: Array<() => void> = [];
	let calls = 0;
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => {
				calls++;
				return new Promise<{ id: number; title: string }>((resolve) => {
					open.push(() =>
						resolve({ id: input.id, title: `Issue ${input.id}` }),
					);
				});
			},
			queryKey: ["issue", input.id],
			retry: false,
		});
	}
	return {
		calls: () => calls,
		issueQuery,
		respond: () =>
			act(async () => {
				for (const finish of open.splice(0)) {
					finish();
				}
				await new Promise((resolve) => {
					setTimeout(resolve, 10);
				});
			}),
	};
}

async function mount(ui: ReactNode) {
	return act(async () => render(ui));
}

/** Let batched cache events reach the panel. */
function settle() {
	return act(async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	});
}

function queryButton(hash: string) {
	const list = screen.getByRole("navigation", { name: "Queries" });
	return within(list).getByRole("button", { name: new RegExp(escape(hash)) });
}

function escape(text: string) {
	return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function setup() {
	const backend = createBackend();
	const client = new QueryClient({ isServer: false });
	function Issue(props: {
		readonly handle: QueryHandle<typeof backend.issueQuery>;
	}) {
		const [issuePromise] = useQuery(backend.issueQuery, props.handle);
		const issue = use(issuePromise);
		return <p>{issue.title}</p>;
	}
	return { backend, client, Issue };
}

function domCleanup(): Disposable {
	return {
		[Symbol.dispose]() {
			cleanup();
			window.localStorage.clear();
		},
	};
}

describe("QueryDevtoolsPanel", () => {
	it("lists entries with their status and observers, live", async () => {
		using _dom = domCleanup();
		const app = setup();
		const handle = app.client.prefetch(app.backend.issueQuery, { id: 1 });
		app.client.setData(
			app.backend.issueQuery,
			{ id: 2 },
			{ id: 2, title: "Two" },
		);

		await mount(
			<QueryClientProvider client={app.client}>
				<Suspense fallback="loading">
					<app.Issue handle={handle} />
				</Suspense>
				<QueryDevtoolsPanel />
			</QueryClientProvider>,
		);
		await settle();

		expect(queryButton('["issue",1]').dataset["status"]).toBe("fetching");
		expect(queryButton('["issue",2]').dataset["status"]).toBe("inactive");
		// A suspended reader subscribes when it commits.
		expect(
			within(queryButton('["issue",1]')).getByLabelText("0 observers"),
		).toBeTruthy();

		await app.backend.respond();
		await settle();

		expect(screen.getByText("Issue 1")).toBeTruthy();
		expect(queryButton('["issue",1]').dataset["status"]).toBe("stale");
		expect(
			within(queryButton('["issue",1]')).getByLabelText("1 observers"),
		).toBeTruthy();
		const chips = screen.getAllByText(
			/^(fetching|error|stale|fresh|inactive) \d+$/,
		);
		expect(chips.map((chip) => chip.textContent)).toEqual([
			"fetching 0",
			"error 0",
			"stale 1",
			"fresh 0",
			"inactive 1",
		]);
	});

	it("shows a selected entry's details, data and input", async () => {
		using _dom = domCleanup();
		const app = setup();
		app.client.setData(
			app.backend.issueQuery,
			{ id: 2 },
			{ id: 2, title: "Two" },
		);

		await mount(<QueryDevtoolsPanel client={app.client} />);
		fireEvent.click(queryButton('["issue",2]'));

		const details = screen.getByRole("region", { name: "Query details" });
		expect(within(details).getByText("inactive")).toBeTruthy();
		expect(within(details).getByText("query")).toBeTruthy();
		expect(within(details).getByText('"Two"')).toBeTruthy();
		expect(within(details).getAllByText("2")).not.toHaveLength(0);
		expect(within(details).queryByText("Meta")).toBeNull();
	});

	it("shows the selected entry's meta", async () => {
		using _dom = domCleanup();
		const client = new QueryClient({ isServer: false });
		function metaQuery() {
			return queryOptions({
				meta: { errorMessage: "Couldn't load issues" },
				queryFn: () => "issues",
				queryKey: ["issues"],
			});
		}
		client.setData(metaQuery, undefined, "issues");

		await mount(<QueryDevtoolsPanel client={client} />);
		fireEvent.click(queryButton('["issues"]'));

		const details = screen.getByRole("region", { name: "Query details" });
		expect(within(details).getByText("Meta")).toBeTruthy();
		expect(within(details).getByText('"Couldn\'t load issues"')).toBeTruthy();
	});

	it("refetches, invalidates, resets and removes the selected entry", async () => {
		using _dom = domCleanup();
		const app = setup();
		const handle = app.client.prefetch(app.backend.issueQuery, { id: 1 });
		await mount(
			<QueryClientProvider client={app.client}>
				<Suspense fallback="loading">
					<app.Issue handle={handle} />
				</Suspense>
				<QueryDevtoolsPanel />
			</QueryClientProvider>,
		);
		await app.backend.respond();
		fireEvent.click(queryButton('["issue",1]'));
		const details = screen.getByRole("region", { name: "Query details" });
		const query = app.client.getQuery(app.backend.issueQuery, { id: 1 });

		await act(async () => {
			fireEvent.click(within(details).getByRole("button", { name: "Refetch" }));
		});
		expect(app.backend.calls()).toBe(2);
		await app.backend.respond();

		await act(async () => {
			fireEvent.click(
				within(details).getByRole("button", { name: "Invalidate" }),
			);
		});
		expect(app.backend.calls()).toBe(3);
		await app.backend.respond();

		await act(async () => {
			fireEvent.click(within(details).getByRole("button", { name: "Reset" }));
		});
		expect(Query.getUnsafe(query).hasData).toBe(false);
		expect(screen.getByText("loading")).toBeTruthy();
		await app.backend.respond();
		expect(screen.getByText("Issue 1")).toBeTruthy();

		await act(async () => {
			fireEvent.click(within(details).getByRole("button", { name: "Remove" }));
		});
		await settle();
		expect(app.client.getAll()).toHaveLength(0);
		expect(screen.getByText("No queries")).toBeTruthy();
		expect(screen.getByText("Select a query to inspect it")).toBeTruthy();
	});

	it("filters and sorts entries", async () => {
		using _dom = domCleanup();
		const app = setup();
		app.client.setData(
			app.backend.issueQuery,
			{ id: 1 },
			{ id: 1, title: "A" },
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 5);
		});
		app.client.setData(
			app.backend.issueQuery,
			{ id: 2 },
			{ id: 2, title: "B" },
		);
		await mount(<QueryDevtoolsPanel client={app.client} />);
		const list = screen.getByRole("navigation", { name: "Queries" });
		const hashes = () =>
			within(list)
				.getAllByRole("button")
				.map((button) => button.querySelector("code")?.textContent);

		expect(hashes()).toEqual(['["issue",1]', '["issue",2]']);

		fireEvent.change(screen.getByLabelText("Sort queries"), {
			target: { value: "updated" },
		});
		expect(hashes()).toEqual(['["issue",2]', '["issue",1]']);

		fireEvent.change(screen.getByLabelText("Filter queries"), {
			target: { value: "2]" },
		});
		expect(hashes()).toEqual(['["issue",2]']);
	});

	it("clears the cache and invalidates everything from the header", async () => {
		using _dom = domCleanup();
		const app = setup();
		app.client.setData(
			app.backend.issueQuery,
			{ id: 1 },
			{ id: 1, title: "A" },
		);
		await mount(<QueryDevtoolsPanel client={app.client} />);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Invalidate all" }));
		});
		expect(
			Query.getUnsafe(app.client.getQuery(app.backend.issueQuery, { id: 1 }))
				.isInvalidated,
		).toBe(true);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Clear cache" }));
		});
		await settle();
		expect(screen.getByText("No queries")).toBeTruthy();
	});

	it("needs a client from props or a provider", async () => {
		using _dom = domCleanup();
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(mount(<QueryDevtoolsPanel />)).rejects.toThrow(
			"pass `client` or render inside a QueryClientProvider",
		);
	});

	it("renders nothing on the server", () => {
		const client = new QueryClient({ isServer: true });
		expect(renderToString(<QueryDevtoolsPanel client={client} />)).toBe("");
		expect(renderToString(<QueryDevtools client={client} />)).toBe("");
	});
});

describe("QueryDevtools", () => {
	it("opens from the toggle button, closes, and remembers", async () => {
		using _dom = domCleanup();
		const client = new QueryClient({ isServer: false });
		const view = await mount(<QueryDevtools client={client} />);

		expect(screen.queryByRole("complementary")).toBeNull();
		fireEvent.click(
			screen.getByRole("button", { name: "Open raf-query devtools" }),
		);
		expect(
			screen.getByRole("complementary", { name: "raf-query devtools" }),
		).toBeTruthy();
		expect(window.localStorage.getItem("raf-query-devtools:open")).toBe("true");

		view.unmount();
		await mount(<QueryDevtools client={client} />);
		expect(screen.getByRole("complementary")).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: "Close raf-query devtools" }),
		);
		expect(screen.queryByRole("complementary")).toBeNull();
		expect(window.localStorage.getItem("raf-query-devtools:open")).toBe(
			"false",
		);
	});

	it("starts open with initialIsOpen, docked where asked", async () => {
		using _dom = domCleanup();
		const client = new QueryClient({ isServer: false });
		await mount(
			<QueryDevtools client={client} initialIsOpen position="right" />,
		);

		const panel = screen.getByRole("complementary");
		expect(panel.style.right).toBe("0px");
		expect(panel.style.width).toBe("320px");
	});

	it("resizes by dragging its edge, and remembers the size", async () => {
		using _dom = domCleanup();
		const client = new QueryClient({ isServer: false });
		await mount(<QueryDevtools client={client} initialIsOpen />);
		const handle = screen.getByRole("separator", {
			name: "Resize raf-query devtools",
		});

		await act(async () => {
			fireEvent.pointerDown(handle, { clientY: window.innerHeight - 320 });
			fireEvent.pointerMove(window, { clientY: window.innerHeight - 400 });
			fireEvent.pointerUp(window);
		});

		expect(screen.getByRole("complementary").style.height).toBe("400px");
		expect(window.localStorage.getItem("raf-query-devtools:size")).toBe("400");

		await act(async () => {
			fireEvent.pointerMove(window, { clientY: 0 });
		});
		expect(screen.getByRole("complementary").style.height).toBe("400px");
	});
});

describe("preview", () => {
	it("summarizes values in one line", () => {
		expect(preview("a")).toBe('"a"');
		expect(preview(1)).toBe("1");
		expect(preview(1n)).toBe("1n");
		expect(preview(undefined)).toBe("undefined");
		expect(preview(null)).toBe("null");
		expect(preview(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
		expect(preview(new Date(Number.NaN))).toBe("Invalid Date");
		expect(preview(new TypeError("nope"))).toBe("TypeError: nope");
		expect(preview(function load() {})).toBe("ƒ load()");
		expect(preview([1, 2])).toBe("Array(2)");
		expect(preview(new Map([[1, 2]]))).toBe("Map(1)");
		expect(preview(new Set())).toBe("Set(0)");
		expect(preview({ a: 1 })).toBe("{1 key}");
		expect(preview({ a: 1, b: 2 })).toBe("{2 keys}");
		expect(preview(Promise.resolve())).toBe("Promise");
	});
});
