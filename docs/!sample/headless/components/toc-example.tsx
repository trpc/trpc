import { AnchorProvider, ScrollProvider, TOCItem } from 'fumadocs-core/toc';
import { type ReactNode, useRef } from 'react';
import type { TOCItemType } from 'fumadocs-core/server';

export function Page({
  items,
  children,
}: {
  items: TOCItemType[];
  children: ReactNode;
}) {
  const viewRef = useRef<HTMLDivElement>(null);

  return (
    <AnchorProvider toc={items}>
      <div ref={viewRef} className="overflow-auto">
        <ScrollProvider containerRef={viewRef}>
          {items.map((item) => (
            <TOCItem key={item.url} href={item.url}>
              {item.title}
            </TOCItem>
          ))}
        </ScrollProvider>
      </div>
      {children}
    </AnchorProvider>
  );
}
