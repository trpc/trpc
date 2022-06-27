import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  header: string;
}

export const Spotlight = ({ children, header }: Props) => {
  return (
    <section className="px-4 sm:px-6 md:px-8 max-w-screen-xl mx-auto flex items-center justify-center flex-col md:mt-28">
      <h2 className="w-full text-center text-3xl sm:text-4xl lg:text-5xl font-bold mb-11">{header}</h2>
      <div className="flex gap-6 flex-col md:flex-row lg:gap-10">{children}</div>
    </section>
  );
};
