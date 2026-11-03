'use client';

// These components render through Base UI's `useRender` hook, so Server
// Components use them through this client boundary.
export { Badge } from '@shared/ui/components/badge';
export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@shared/ui/components/breadcrumb';
export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@shared/ui/components/item';
