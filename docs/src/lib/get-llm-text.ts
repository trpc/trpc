import { type Page } from '@/lib/source';
import { remarkInstall } from 'fumadocs-docgen';
import { remarkInclude } from 'fumadocs-mdx/config';
import { remarkAutoTypeTable } from 'fumadocs-typescript';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';

const processor = remark()
  .use(remarkMdx)
  .use(remarkInclude)
  .use(remarkGfm)
  .use(remarkAutoTypeTable)
  .use(remarkInstall);

export async function getLLMText(page: Page) {
  const category =
    {
      framework: 'tRPC Framework',
      server: 'tRPC Server',
      client: 'tRPC Client',
    }[page.slugs[0]] ?? page.slugs[0];

  const processed = await processor.process({
    path: page.data._file.absolutePath,
    value: page.data.content,
  });

  return `# ${category}: ${page.data.title}
URL: ${page.url}
Source: https://raw.githubusercontent.com/fuma-nama/fumadocs/refs/heads/main/apps/docs/content/docs/${page.path}

${page.data.description}
        
${processed.value}`;
}
