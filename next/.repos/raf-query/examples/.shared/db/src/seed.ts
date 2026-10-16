import {
	type Comment,
	currentUser,
	type Issue,
	type IssueStatus,
	type Store,
	type User,
} from "./types.ts";

const users: ReadonlyArray<User> = [
	currentUser,
	{ id: "grace", name: "Grace Hopper", title: "Compiler engineer" },
	{ id: "alan", name: "Alan Turing", title: "Researcher" },
	{ id: "katherine", name: "Katherine Johnson", title: "Mathematician" },
	{ id: "linus", name: "Linus Torvalds", title: "Kernel maintainer" },
];

const subjects = [
	"Login form",
	"Search results",
	"Settings page",
	"Billing export",
	"Notification email",
	"Dark mode",
	"Avatar upload",
	"Keyboard shortcuts",
	"Onboarding checklist",
	"Audit log",
];

const problems = [
	"loses input on refresh",
	"is slow with 1000+ rows",
	"ignores the user's locale",
	"flickers when switching tabs",
	"shows a stale count",
	"needs an empty state",
	"breaks on narrow screens",
];

const replies = [
	"I can reproduce this on main.",
	"Looks like a caching issue to me.",
	"Could we add a test for this first?",
	"Fixed in my branch, opening a PR soon.",
	"This also happens on mobile.",
	"Bumping the priority, a customer hit it today.",
	"Is this related to the last release?",
	"Confirmed, closing once the fix ships.",
];

const statuses: ReadonlyArray<IssueStatus> = ["open", "in_progress", "closed"];

/** Small deterministic PRNG, so every server start sees the same data. */
function random(seedValue: number) {
	let state = seedValue;
	return () => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
		return state / 2_147_483_648;
	};
}

function pick<T>(next: () => number, items: ReadonlyArray<T>): T {
	const item = items[Math.floor(next() * items.length)];
	if (item === undefined) {
		throw new Error("pick: empty list");
	}
	return item;
}

export function seed(): Store {
	const next = random(42);
	const start = Date.UTC(2026, 0, 5);
	const day = 86_400_000;
	const issues: Array<Issue> = [];
	const comments: Array<Comment> = [];

	for (let id = 1; id <= 42; id++) {
		const createdAt = start + id * 2 * day + Math.floor(next() * day);
		const commentCount = Math.floor(next() * 11);
		for (let index = 0; index < commentCount; index++) {
			comments.push({
				author: pick(next, users),
				body: pick(next, replies),
				createdAt: new Date(createdAt + (index + 1) * 3_600_000).toISOString(),
				id: `seed-${comments.length + 1}`,
				issueId: id,
			});
		}
		issues.push({
			assigneeId: pick(next, users).id,
			body: `Steps to reproduce:\n\n1. Open the ${pick(next, subjects).toLowerCase()}.\n2. Wait a moment.\n3. Observe the problem.`,
			commentCount,
			createdAt: new Date(createdAt).toISOString(),
			id,
			status: pick(next, statuses),
			title: `${pick(next, subjects)} ${pick(next, problems)}`,
		});
	}

	return { comments, issues, users };
}
