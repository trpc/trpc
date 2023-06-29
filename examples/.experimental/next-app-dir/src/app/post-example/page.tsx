import { readFile } from 'node:fs/promises';
import { Button } from '~/components/button';
import { CodeBlock } from '~/components/codeblocks';
import { CollapsiblePreview } from '~/components/collapsible-preview';
import { Input } from '~/components/input';
import { JsonPreTag } from '~/components/json-pretag';
import { api } from '~/trpc/server-http';
import { Suspense } from 'react';

async function action(fd: FormData) {
  'use server';

  // create the post
  await api.createPost.mutate({
    title: fd.get('title') as string,
    content: fd.get('content') as string,
  });

  // revalidate the latest post
  await api.getLatestPost.revalidate();
}

export default async function PostPage() {
  const latestPost = await api.getLatestPost.query();

  return (
    <div className="space-y-4">
      <div className="prose">
        <h1>Full Stack Revalidation</h1>
      </div>

      <JsonPreTag object={latestPost} />

      <form className="max-w-sm space-y-2" action={action}>
        <Input name="title" placeholder="title" />
        <Input name="content" placeholder="content" />
        <Button type="submit">Create Post!</Button>
      </form>

      <div className="space-y-2">
        <h2 className="text-lg font-bold">Code</h2>
        <Suspense fallback={'Reading page source...'}>
          <h3 className="font-semibold">page.tsx</h3>
          <ComponentCode path="./page.tsx" />
        </Suspense>
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
