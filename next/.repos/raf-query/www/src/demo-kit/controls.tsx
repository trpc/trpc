import { Button } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Zap } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { FakeServer } from "./server.ts";

/** A row of radio buttons styled as a segmented control. */
export function Segmented<TValue extends string>(props: {
	readonly label: string;
	readonly onChange: (value: TValue) => void;
	readonly options: ReadonlyArray<{
		readonly label: string;
		readonly value: TValue;
	}>;
	readonly value: TValue;
}) {
	return (
		<fieldset className="flex flex-wrap items-center gap-1.5 text-sm">
			<legend className="sr-only">{props.label}</legend>
			<span aria-hidden="true" className="mr-1 text-xs text-muted-foreground">
				{props.label}
			</span>
			{props.options.map((option) => (
				<label
					className={cn(
						"cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs has-focus-visible:ring-2 has-focus-visible:ring-ring",
						props.value === option.value && "border-foreground bg-accent",
					)}
					key={option.value}
				>
					<input
						checked={props.value === option.value}
						className="sr-only"
						name={props.label}
						onChange={() => {
							props.onChange(option.value);
						}}
						type="radio"
					/>
					{option.label}
				</label>
			))}
		</fieldset>
	);
}

/** Makes the fake server fail its next `count` requests. */
export function FailNextButton(props: {
	readonly count?: number;
	readonly server: FakeServer<unknown>;
}) {
	const server = props.server;
	const failures = useSyncExternalStore(
		server.subscribe,
		() => server.failures,
		() => 0,
	);
	const count = props.count ?? 1;
	return (
		<Button
			onClick={() => {
				server.failNext(failures + count);
			}}
			size="xs"
			variant="outline"
		>
			<Zap />
			{count === 1
				? "Fail the next request"
				: `Fail the next ${count} requests`}
			{failures > 0 ? (
				<span className="rounded bg-destructive/15 px-1 text-destructive tabular-nums">
					{failures}
				</span>
			) : null}
		</Button>
	);
}

/** A small spinner for background fetches; hidden from assistive tech, which gets `aria-busy`. */
export function Spinner(props: { readonly className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-block size-3 animate-spin rounded-full border-2 border-current border-r-transparent text-sky-600 dark:text-sky-400",
				props.className,
			)}
		/>
	);
}

export function formatTime(ms: number) {
	return new Date(ms).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}
