import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@shared/ui/components/accordion';
import { Card, CardContent } from '@shared/ui/components/card';
import type { ReactNode } from 'react';
import { PageHeader } from '../_components/page-header';
import { FormWithUseActionExample } from './FormWithUseActionExample';
import { RawExample } from './RawExample';
import { RawFormExample } from './RawFormExample';
import { ReactHookFormExample } from './ReactHookFormExample';
import { UseActionExample } from './UseActionExample';

export default async function Home() {
  const components: {
    Component: React.ComponentType;
    title: ReactNode;
  }[] = [
    {
      title: (
        <span>
          <code>useAction(testAction)</code>
        </span>
      ),
      Component: UseActionExample,
    },
    {
      title: (
        <span>
          Raw inline call: <code>testAction(…)</code>
        </span>
      ),
      Component: RawExample,
    },
    {
      title: (
        <span>
          <code>&lt;form action=&#123;testAction&#125;&gt;</code> without any
          extras
        </span>
      ),
      Component: RawFormExample,
    },
    {
      title: (
        <span>
          <code>&lt;form&gt;</code> with <code>useAction</code>
        </span>
      ),
      Component: FormWithUseActionExample,
    },
    {
      title: (
        <span>
          <code>&lt;form&gt;</code> with <code>react-hook-form</code> (verbose)
        </span>
      ),
      Component: ReactHookFormExample,
    },
  ];
  return (
    <>
      <PageHeader
        title="Server Actions"
        description={
          <>
            Procedures wrapped in <code>createAction</code> work as Server
            Actions. Open an example to call <code>testAction</code> or{' '}
            <code>rhfAction</code>; their logs are in the server console.
          </>
        }
      />
      <Card className="py-2">
        <CardContent>
          <Accordion defaultValue={[0]} keepMounted>
            {components.map((it, index) => (
              <AccordionItem key={index} value={index}>
                <AccordionTrigger className="py-4 text-base">
                  {it.title}
                </AccordionTrigger>
                <AccordionContent className="pb-6">
                  <it.Component />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </>
  );
}
