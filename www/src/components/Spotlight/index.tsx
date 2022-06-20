import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  header: string;
}

export const Spotlight = ({ children, header }: Props) => {
  return (
    <section className="w-full">
      <h2 className="w-full text-center text-5xl font-bold mb-11">{header}</h2>
      <div className="flex gap-10">
        {children}
      </div>
    </section>
  );
};
