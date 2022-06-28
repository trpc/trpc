import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  header: string;
}

export const Spotlight = ({ children, header }: Props) => {
  return (
    <section className="flex flex-col justify-center items-center px-4 mx-auto max-w-screen-xl sm:px-6 md:px-8 md:mt-28">
      <h2 className="mb-11 w-full text-2xl font-bold text-center sm:text-3xl lg:text-4xl">
        {header}
      </h2>
      <div className="flex flex-col gap-6 md:flex-row lg:gap-10">
        {children}
      </div>
    </section>
  );
};
