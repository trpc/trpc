'use client';

import { useEffect, useState } from 'react';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';

export function UrlBar() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      setUrl(window.location.pathname + window.location.hash);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return <pre className="rounded-lg border bg-card p-2 text-sm">{url}</pre>;
}

export function WithoutValueTest() {
  const [items, setItems] = useState(['Item 1', 'Item 2']);

  return (
    <>
      <Tabs items={items}>
        {items.map((item) => (
          <Tab key={item}>{item}</Tab>
        ))}
      </Tabs>
      <button
        className={cn(
          buttonVariants({
            variant: 'secondary',
          }),
        )}
        onClick={() => setItems(['Item 1', 'Item 3', 'Item 2'])}
      >
        Change Items
      </button>
    </>
  );
}
