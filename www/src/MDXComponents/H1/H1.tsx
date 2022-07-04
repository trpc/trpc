import { FC, ReactNode } from 'react';

interface H1Props {
  children: ReactNode;
}

export const H1: FC<H1Props> = ({ children }) => {
  return (
    <h1 className="flex items-center gap-3 pt-6 pb-3 text-3xl font-bold">
      {children}
    </h1>
  );
};
