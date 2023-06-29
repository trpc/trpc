import { readFile } from 'node:fs/promises';
import { Button } from '~/components/button';
import { CodeBlock } from '~/components/codeblocks';
import { CollapsiblePreview } from '~/components/collapsible-preview';
import { Input } from '~/components/input';
import { JsonPreTag } from '~/components/json-pretag';
import { api } from '~/trpc/server-http';
import { createPostAction } from './_actions';

export default async function Page() {
  const post = await api.getLatestPost.query();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Post</h1>
        <JsonPreTag object={post} />
      </div>

      <h1 className="text-xl font-bold">Create post</h1>
      <form action={createPostAction} className="space-y-2">
        <Input type="text" name="title" placeholder="title" />
        <Input type="text" name="content" placeholder="content" />
        <Button type="submit">Create</Button>
      </form>

      <div className="space-y-2">
        <h2 className="text-lg font-bold">Code</h2>
        <h3 className="font-semibold">_actions.ts</h3>
        <ComponentCode path="./_actions.ts" />
        <h3 className="font-semibold">page.tsx</h3>
        <ComponentCode path="./page.tsx" />
      </div>
    </div>
  );
}

async function ComponentCode(props: { path: string; expandText?: string }) {
  const fileContent = await readFile(
    new URL(props.path, import.meta.url),
    'utf-8',
  );

  return (
    <CollapsiblePreview expandButtonTitle={props.expandText}>
      <CodeBlock code={fileContent} lang="tsx" />
    </CollapsiblePreview>
  );
}
