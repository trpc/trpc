import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Post } from "./api.ts";

export const getPost = createServerFn({ method: "GET" })
	.validator(z.object({ slug: z.string() }))
	.handler(async (args) => {
		const response = await fetch(
			`https://api.example.com/posts/${args.data.slug}`,
		);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return (await response.json()) as Post;
	});
