import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  header: string;
}

export const Spotlight = ({ children, header }: Props) => {
  return (
    <section className="flex flex-col items-center justify-center max-w-screen-xl px-4 mx-auto sm:px-6 md:px-8 pt-28 md:pt-56">
      <h2 className="w-full text-2xl font-bold text-center mb-11 sm:text-3xl lg:text-4xl">
        {header}
      </h2>
      <div className="flex flex-col gap-6 md:flex-row lg:gap-10">
        {children}
      </div>
    </section>
  );
};
