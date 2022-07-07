import { FC, ReactNode } from 'react';

interface UnorderedListProps {
  children: ReactNode;
}

export const UnorderedList: FC<UnorderedListProps> = ({ children }) => {
  return <ul className="pl-5 list-disc">{children}</ul>;
};
