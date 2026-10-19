// @ts-check
function remarkHtmlToJsx() {
  // @ts-ignore
  async function transform(...args) {
    const { visit, SKIP } = await import('unist-util-visit');
    const { mdxFromMarkdown } = await import('mdast-util-mdx');
    const { fromMarkdown } = await import('mdast-util-from-markdown');
    const { mdxjs } = await import('micromark-extension-mdxjs');
    const [ast] = args;
    visit(ast, 'html', (node) => {
      const codeBlockMarkup = node.value.length
        ? node.value.replace(
            /<\/code><\/div><\/pre>/g,
            '</code></div><button type="button" aria-label="Copy code to clipboard" ' +
              'class="copy-button" onclick="navigator.clipboard.writeText(this.previousSibling.innerText);' +
              "this.classList.add('copied');this.textContent = 'Copied';" +
              "setTimeout(() => {this.classList.remove('copied');this.textContent = 'Copy'}, 2000)\">Copy</button></pre>",
          )
        : node.value;
      const escapedHtml = JSON.stringify(codeBlockMarkup);
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
