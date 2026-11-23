import Link from 'next/link';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './client-ui';

export function PageHeader(props: {
  title: React.ReactNode;
  description: React.ReactNode;
  parents?: { href: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Showcase</BreadcrumbLink>
          </BreadcrumbItem>
          {props.parents?.map((parent) => (
            <Fragment key={parent.href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={parent.href} />}>
                  {parent.label}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </Fragment>
          ))}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{props.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-3xl font-bold tracking-tight">{props.title}</h1>
      <p className="max-w-2xl text-muted-foreground">{props.description}</p>
    </div>
  );
}
