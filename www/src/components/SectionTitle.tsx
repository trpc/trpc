import React, { FC, ReactNode } from 'react';

type SectionTitleProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
};

export const SectionTitle: FC<SectionTitleProps> = ({
  title,
  description,
  id,
}) => {
  return (
    <div className="text-center">
      <h2 id={id} className="text-2xl font-bold lg:text-3xl scroll-mt-20">
        {title} <a className="hash-link" href={`#${id}`}></a>
      </h2>
      {description && (
        <p className="text-gray-600 dark:text-gray-400 max-w-[50ch] mx-auto text-sm md:text-base">
          {description}
        </p>
      )}
    </div>
  );
};
