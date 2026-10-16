export interface Post {
	readonly body: string;
	readonly id: number;
	readonly title: string;
}

export interface Comment {
	readonly author: string;
	readonly body: string;
	readonly id: number;
	readonly postId: number;
}

const titles = [
	"Render-as-you-fetch, explained",
	"Why loaders beat effects",
	"Suspense boundaries are layout",
	"The URL is your state manager",
	"Invalidate, don't normalize",
	"Streaming SSR without the waterfall",
];

const authors = ["Ada", "Grace", "Linus", "Margaret", "Ken", "Barbara"];

const remarks = [
	"This cleared up a lot for me.",
	"What happens when the request fails?",
	"Love the diagrams.",
	"We moved our dashboard to this pattern last week.",
	"Does this work with server components?",
	"The skeletons finally stopped jumping.",
	"Bookmarked.",
	"How does this compare with fetching in useEffect?",
];

export function seedPosts(): ReadonlyArray<Post> {
	return titles.map((title, index) => ({
		body: `${title}. A short post about data fetching, number ${index + 1}. It loads with the page, not after it.`,
		id: index + 1,
		title,
	}));
}

export function seedComments(): ReadonlyArray<Comment> {
	return titles.flatMap((_, postIndex) =>
		Array.from({ length: 3 + (postIndex % 3) }, (__, index) => ({
			author: authors[(postIndex + index) % authors.length] ?? "Ada",
			body: remarks[(postIndex * 3 + index) % remarks.length] ?? "Nice.",
			id: postIndex * 10 + index + 1,
			postId: postIndex + 1,
		})),
	);
}
