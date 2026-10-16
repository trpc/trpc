declare module "@effect/markdown-toc" {
  const markdownToc: (content: string, options: { readonly bullets: string }) => { readonly content: string }
  export default markdownToc
}
