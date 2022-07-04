import { FC, ReactNode } from 'react';

interface H2Props {
  children: ReactNode;
}

export const H2: FC<H2Props> = ({ children }) => {
  return (
    <h2 className="flex items-center gap-3 pt-6 pb-3 text-2xl font-bold">
      {children}
    </h2>
  );
};
