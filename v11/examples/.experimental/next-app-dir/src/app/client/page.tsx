import { Card, CardContent } from '@shared/ui/components/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@shared/ui/components/empty';
import { MonitorIcon } from 'lucide-react';
import { Suspense } from 'react';
import { Badge } from '../_components/client-ui';
import { PageHeader } from '../_components/page-header';
import { ClientGreeting } from './ClientGreeting';

export default function ClientPage() {
  return (
    <>
      <PageHeader
        title="Client-side data fetching"
        description={
          <>
            This page will call <code>greeting</code> from a Client Component,
            with <code>use()</code>.
          </>
        }
      />
      <Card>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MonitorIcon />
              </EmptyMedia>
              <EmptyTitle>Coming soon</EmptyTitle>
              <EmptyDescription>
                <code>ClientGreeting</code> doesn&apos;t fetch anything yet.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Badge variant="outline">
                <Suspense>
                  <ClientGreeting />
                </Suspense>
              </Badge>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </>
  );
}
