import { FC, ReactNode } from 'react';

interface ParagraphProps {
  children: ReactNode;
}

export const Paragraph: FC<ParagraphProps> = ({ children }) => {
  return <p className="leading-relaxed text-zinc-400">{children}</p>;
};
