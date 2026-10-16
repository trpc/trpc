import { type RouteConfig, route } from "@react-router/dev/routes";

export default [
	route("blog/:slug", "routes/blog.$slug.tsx"),
	route("posts/:slug", "routes/posts.$slug.tsx"),
] satisfies RouteConfig;
