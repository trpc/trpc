// @ts-check
function remarkHtmlToJsx() {
  // @ts-ignore
  async function transform(...args) {
    const { visit, SKIP } = await import("unist-util-visit");
    const { mdxFromMarkdown } = await import("mdast-util-mdx");
    const { fromMarkdown } = await import("mdast-util-from-markdown");
    const { mdxjs } = await import("micromark-extension-mdxjs");
    const [ast] = args;
    visit(ast, "html", (node) => {
      const escapedHtml = JSON.stringify(node.value);
      const element = `<div dangerouslySetInnerHTML={{__html: ${escapedHtml} }}/>`;

      const rawHtmlNode = fromMarkdown(element, {
        extensions: [mdxjs()],
        mdastExtensions: [mdxFromMarkdown()],
      }).children[0];

      Object.assign(node, rawHtmlNode);

      return SKIP;
    });
  }

  return transform;
}

module.exports = remarkHtmlToJsx;
