import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
	component: () => <p>Sign in to continue.</p>,
});
