import type { QueryClient } from "@raf-query/react";
import { Link } from "@tanstack/react-router";
import { postQuery } from "~/queries.ts";

declare const qc: QueryClient;

declare const slug: string;

declare const title: string;

// #region preloading-on-intent
<Link
	to="/posts/$slug"
	params={{ slug }}
	onPointerEnter={() => qc.prefetch(postQuery, { slug })}
>
	{title}
</Link>;
// #endregion
