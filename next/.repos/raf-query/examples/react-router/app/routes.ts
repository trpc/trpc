import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("prefetch/issues", "routes/prefetch/issues/route.tsx"),
	route(
		"prefetch/issues/:issueId",
		"routes/prefetch/issues/$issueId/route.tsx",
	),
	route("ensure/issues", "routes/ensure/issues/route.tsx"),
	route("ensure/issues/:issueId", "routes/ensure/issues/$issueId/route.tsx"),
	route("fetch/issues", "routes/fetch/issues/route.tsx"),
	route("fetch/issues/:issueId", "routes/fetch/issues/$issueId/route.tsx"),
	route("issues/*", "routes/issues.$.tsx"),
	route("api/*", "routes/api.$.ts"),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
