import Link from 'next/link';
import type * as React from 'react';
import { Item } from './client-ui';

/**
 * An `Item` in an `ItemGroup` list, made clickable by an `ItemLink` inside it.
 * The link covers the item, but only its own text names it, not the
 * description.
 */
export function LinkItem({
  className,
  ...props
}: React.ComponentProps<typeof Item>) {
  return (
    <Item
      role="listitem"
      className={[
        'relative has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50 has-[a:hover]:bg-muted',
        className,
      ].join(' ')}
      {...props}
    />
  );
}

export function ItemLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={['outline-none after:absolute after:inset-0', className].join(
        ' ',
      )}
      {...props}
    />
  );
}
