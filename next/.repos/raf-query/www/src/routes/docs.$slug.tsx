import { useQuery } from "@raf-query/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";

import { DocBody } from "~/components/doc-body.tsx";
import { PageActions } from "~/components/page-actions.tsx";
import { TableOfContents } from "~/components/toc.tsx";
import { docQuery, findDoc, neighbours } from "~/content/docs.ts";
import { demoQuery } from "~/demos/registry.ts";
import { absoluteUrl, pageHead } from "~/seo.ts";
import { site } from "~/site.ts";

export const Route = createFileRoute("/docs/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const meta = findDoc(args.params.slug);
		if (!meta) {
			throw notFound();
		}
		// The manifest lists each page's demos, so their code starts loading
		// with the page instead of after it renders.
		const demos = Object.fromEntries(
			meta.demos.map((id) => [id, qc.prefetch(demoQuery, { id })]),
		);
		return {
			demos,
			doc: await qc.ensure(docQuery, { slug: args.params.slug }),
		};
	},
	head: (args) => {
		const meta = findDoc(args.params.slug);
		if (!meta) {
			return { meta: [{ title: `Not found | ${site.name}` }] };
		}
		const path = `/docs/${meta.slug}`;
		return pageHead({
			description: meta.description,
			markdownPath: `${path}.md`,
			path,
			structuredData: [
				{
					"@type": "TechArticle",
					dateModified: meta.lastModified,
					description: meta.description,
					headline: meta.title,
					inLanguage: "en",
					isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
					mainEntityOfPage: absoluteUrl(path),
					proficiencyLevel: "Expert",
				},
				{
					"@type": "BreadcrumbList",
					itemListElement: [
						{
							"@type": "ListItem",
							item: site.url,
							name: site.name,
							position: 1,
						},
						{ "@type": "ListItem", name: meta.section, position: 2 },
						{
							"@type": "ListItem",
							item: absoluteUrl(path),
							name: meta.title,
							position: 3,
						},
					],
				},
			],
			title: meta.title,
			type: "article",
		});
	},
	component: DocPage,
});

function DocPage() {
	const data = Route.useLoaderData();
	const [doc] = useQuery(docQuery, data.doc);
	const around = neighbours(doc.slug);

	return (
		<div className="grid min-w-0 gap-10 py-8 xl:grid-cols-[minmax(0,1fr)_13rem]">
			<article className="min-w-0">
				<header className="mb-8 grid gap-3 border-b pb-6">
					<p className="text-sm font-medium text-muted-foreground">
						{doc.section}
					</p>
					<h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
						{doc.title}
					</h1>
					<p className="text-lg text-pretty text-muted-foreground">
						{doc.description}
					</p>
					<PageActions key={doc.slug} slug={doc.slug} />
				</header>
				<DocBody demos={data.demos} segments={doc.segments} />
				<footer className="mt-12 grid gap-6 border-t pt-6">
					<a
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						href={`${site.github}/edit/main/www/content/${doc.slug}.md`}
					>
						<Pencil className="size-3.5" /> Edit this page on GitHub
					</a>
					<nav aria-label="Pagination" className="grid gap-3 sm:grid-cols-2">
						{around.previous ? (
							<Link
								className="group grid gap-1 rounded-lg border p-4 hover:bg-accent/50"
								params={{ slug: around.previous.slug }}
								to="/docs/$slug"
							>
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									<ArrowLeft className="size-3" /> Previous
								</span>
								<span className="font-medium">{around.previous.title}</span>
							</Link>
						) : (
							<span />
						)}
						{around.next ? (
							<Link
								className="group grid gap-1 rounded-lg border p-4 text-right hover:bg-accent/50"
								params={{ slug: around.next.slug }}
								to="/docs/$slug"
							>
								<span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
									Next <ArrowRight className="size-3" />
								</span>
								<span className="font-medium">{around.next.title}</span>
							</Link>
						) : null}
					</nav>
				</footer>
			</article>
			<aside className="hidden xl:block">
				<div className="sticky top-22">
					<TableOfContents headings={doc.headings} key={doc.slug} />
				</div>
			</aside>
		</div>
	);
}
