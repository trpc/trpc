import { buttonVariants } from '@shared/ui/components/button';
import { Card, CardContent, CardFooter } from '@shared/ui/components/card';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '../../_components/page-header';
import { postById } from '../_data';

export default async function Page(props: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await props.params;
  const post = await postById({ id });

  return (
    <>
      <PageHeader
        title={post.title}
        parents={[{ href: '/posts', label: 'Server Adapter' }]}
        description={
          <>
            Loaded with the <code>postById</code> query. An unknown id calls{' '}
            <code>notFound()</code>.
          </>
        }
      />
      <Card>
        <CardContent>
          <p className="leading-relaxed break-words whitespace-pre-wrap">
            {post.content}
          </p>
        </CardContent>
        <CardFooter>
          <Link
            href="/posts"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ArrowLeftIcon />
            All posts
          </Link>
        </CardFooter>
      </Card>
    </>
  );
}
