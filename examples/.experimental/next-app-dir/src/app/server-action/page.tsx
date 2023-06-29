import { readFile } from 'node:fs/promises';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/accordion';
import { CodeBlock } from '~/components/codeblocks';
import { CollapsiblePreview } from '~/components/collapsible-preview';
import { FormWithUseActionExample } from './_components/FormWithUseActionExample';
import { RawExample } from './_components/RawExample';
import { RawFormExample } from './_components/RawFormExample';
import { ReactHookFormExample } from './_components/ReactHookFormExample';
import { ReactHookFormFactoryExample } from './_components/ReactHookFormFactoryExample';
import { UseActionExample } from './_components/UseActionExample';

export default async function Home() {
  const components: {
    Component: React.ComponentType;
    title: React.ReactNode;
    path: string;
  }[] = [
    {
      title: `useAction(testAction)`,
      Component: UseActionExample,
      path: './_components/UseActionExample.tsx',
    },
    {
      title: `RawTestMutation (inline call testAction(...) in an event handler)`,
      Component: RawExample,
      path: './_components/RawExample.tsx',
    },
    {
      title: `<form action=x> without any extras`,
      Component: RawFormExample,
      path: './_components/RawFormExample.tsx',
    },
    {
      title: `<form> with useAction`,
      Component: FormWithUseActionExample,
      path: './_components/FormWithUseActionExample.tsx',
    },
    {
      title: `<form> with react-hook-form (verbose)`,
      Component: ReactHookFormExample,
      path: './_components/ReactHookFormExample.tsx',
    },
    {
      title: `<form> with react-hook-form (factory)`,
      Component: ReactHookFormFactoryExample,
      path: './_components/ReactHookFormFactoryExample.tsx',
    },
  ];
  return (
    <>
      <div className="prose">
        <h2>Server Actions</h2>
        <p>Below are multiple examples of how to use server actions in tRPC.</p>
        <h3>How do I create actions in tRPC?</h3>
        <ComponentCode path="./_actions.tsx" />
      </div>
      <Accordion type="multiple">
        {components.map((it, index) => (
          <AccordionItem value={`item-${index}`} key={index}>
            <AccordionTrigger>{it.title}</AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="prose mb-6">
                <h4>Code</h4>
                <ComponentCode path={it.path} />
              </div>
              <div>
                <it.Component />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}

export async function ComponentCode(props: {
  path: string;
  expandText?: string;
}) {
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
