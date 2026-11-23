import { buttonVariants } from '@shared/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@shared/ui/components/empty';
import Link from 'next/link';

export default function Custom404() {
  return (
    <Empty className="border bg-background">
      <EmptyHeader>
        <EmptyTitle className="text-6xl font-bold">404</EmptyTitle>
        <EmptyDescription>Page not found</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          Home
        </Link>
      </EmptyContent>
    </Empty>
  );
}
