"use client";

import {
	latencyOptions,
	type LoaderVerb,
	loaderVerbs,
	staleTimeOptions,
} from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import {
	NativeSelect,
	NativeSelectOption,
} from "@examples/ui/components/native-select";
import { RotateCcw } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * The top bar's settings: the loader verb, link prefetching, stale time,
 * latency, and Reset. Each `on…Change` gets the chosen option's value as a
 * string.
 */
export function SettingsControls(props: {
	readonly latency: number;
	readonly onLatencyChange: (value: string) => void;
	readonly onPrefetchChange: (value: string) => void;
	readonly onReset: () => void;
	readonly onStaleTimeChange: (value: string) => void;
	readonly onVerbChange: (value: string) => void;
	readonly prefetch: string;
	readonly prefetchOptions: ReadonlyArray<{
		readonly label: string;
		readonly value: string;
	}>;
	readonly staleTime: number;
	readonly verb: LoaderVerb;
}) {
	return (
		<div className="flex items-end gap-2">
			<div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-none">
				<Setting
					label="Loader"
					onChange={(event) => {
						props.onVerbChange(event.target.value);
					}}
					value={props.verb}
				>
					{loaderVerbs.map((verb) => (
						<NativeSelectOption key={verb} value={verb}>
							{verb}
						</NativeSelectOption>
					))}
				</Setting>
				<Setting
					label="Prefetch links"
					onChange={(event) => {
						props.onPrefetchChange(event.target.value);
					}}
					value={props.prefetch}
				>
					{props.prefetchOptions.map((option) => (
						<NativeSelectOption key={option.value} value={option.value}>
							{option.label}
						</NativeSelectOption>
					))}
				</Setting>
				<Setting
					label="Stale time"
					onChange={(event) => {
						props.onStaleTimeChange(event.target.value);
					}}
					value={props.staleTime}
				>
					{staleTimeOptions.map((option) => (
						<NativeSelectOption key={option.label} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</Setting>
				<Setting
					label="Latency"
					onChange={(event) => {
						props.onLatencyChange(event.target.value);
					}}
					value={props.latency}
				>
					{latencyOptions.map((option) => (
						<NativeSelectOption key={option.ms} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</Setting>
			</div>
			<Button
				aria-label="Reset settings"
				onClick={props.onReset}
				size="icon-sm"
				title="Reset settings"
				variant="ghost"
			>
				<RotateCcw />
			</Button>
		</div>
	);
}

function Setting(
	props: { readonly label: string } & Omit<
		ComponentProps<typeof NativeSelect>,
		"className" | "size"
	>,
) {
	const { label, ...select } = props;
	return (
		<label className="flex min-w-0 flex-col gap-1">
			<span className="text-[0.7rem] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase">
				{label}
			</span>
			<NativeSelect {...select} className="w-full sm:w-fit" size="sm" />
		</label>
	);
}
