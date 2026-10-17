// vue-tsc reads `.vue` files itself; the docs' Twoslash blocks only see this.
declare module "*.vue" {
	import type { DefineComponent } from "vue";

	const component: DefineComponent;
	export default component;
}
