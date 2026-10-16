import { type RouteConfig, route } from "@react-router/dev/routes";

export default [
	route("posts/:slug", "routes/posts.$slug.tsx"),
] satisfies RouteConfig;
