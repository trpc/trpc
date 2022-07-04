import { FC, ReactNode } from 'react';

interface ListItemProps {
  children: ReactNode;
}

export const ListItem: FC<ListItemProps> = ({ children }) => {
  return <li className="text-zinc-400">{children}</li>;
};
