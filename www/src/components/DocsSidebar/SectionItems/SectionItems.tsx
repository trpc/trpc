import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC } from 'react';

interface SectionItemsProps {
  items: {
    title: string;
    path: string;
  }[];
}

export const SectionItems: FC<SectionItemsProps> = ({ items }) => {
  const router = useRouter();
  return (
    <>
      {items.map((item) => (
        <li key={item.title} className="flex w-full mb-1">
          <Link href={item.path}>
            <a
              className={clsx(
                'flex-1 px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-xs',
                router.pathname === item.path && 'bg-zinc-800 font-bold',
              )}
            >
              {item.title}
            </a>
          </Link>
        </li>
      ))}
    </>
  );
};
