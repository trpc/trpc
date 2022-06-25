import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  header: string;
}

export const Spotlight = ({ children, header }: Props) => {
  return (
    <section className="w-full flex items-center flex-col">
      <h2 className="w-full text-center text-4xl font-bold mb-11">{header}</h2>
      <div className="flex gap-10">{children}</div>
    </section>
  );
};
