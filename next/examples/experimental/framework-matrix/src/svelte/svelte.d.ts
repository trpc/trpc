// tsc can't read .svelte files; the Svelte plugin compiles and checks their
// markup, and this types their default export.
declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component<any>;
  export default component;
}
