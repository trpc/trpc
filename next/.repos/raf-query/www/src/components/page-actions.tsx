import { Button, buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Check, Copy, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";

import { absoluteUrl } from "~/seo.ts";

/**
 * Hands the page to an assistant: copy its markdown, open the markdown, or
 * start a chat that reads it.
 */
export function PageActions(props: { readonly slug: string }) {
	const markdownPath = `/docs/${props.slug}.md`;
	const prompt = `Read ${absoluteUrl(markdownPath)} so I can ask questions about it.`;
	const [status, setStatus] = useState<"Copied" | "Copy failed" | "Copy page">(
		"Copy page",
	);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				onClick={() => {
					// A promise in the `ClipboardItem` keeps the click's user
					// activation through the fetch, which Safari requires.
					const markdown = fetch(markdownPath).then(async (response) => {
						if (!response.ok) {
							throw new Error(`GET ${markdownPath}: ${response.status}`);
						}
						return new Blob([await response.text()], { type: "text/plain" });
					});
					void navigator.clipboard
						.write([new ClipboardItem({ "text/plain": markdown })])
						.catch(async () => {
							const blob = await markdown;
							await navigator.clipboard.writeText(await blob.text());
						})
						.then(
							() => "Copied" as const,
							() => "Copy failed" as const,
						)
						.then((result) => {
							setStatus(result);
							setTimeout(() => {
								setStatus("Copy page");
							}, 1500);
						});
				}}
				size="xs"
				variant="outline"
			>
				{status === "Copied" ? <Check /> : <Copy />}
				{status}
			</Button>
			<a
				className={cn(buttonVariants({ size: "xs", variant: "ghost" }))}
				href={markdownPath}
			>
				<FileText /> Markdown
			</a>
			<a
				className={cn(buttonVariants({ size: "xs", variant: "ghost" }))}
				href={`https://chatgpt.com/?hints=search&q=${encodeURIComponent(prompt)}`}
				rel="noopener"
				target="_blank"
			>
				Ask ChatGPT <ExternalLink />
			</a>
			<a
				className={cn(buttonVariants({ size: "xs", variant: "ghost" }))}
				href={`https://claude.ai/new?q=${encodeURIComponent(prompt)}`}
				rel="noopener"
				target="_blank"
			>
				Ask Claude <ExternalLink />
			</a>
		</div>
	);
}
