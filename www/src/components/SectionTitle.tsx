import React, { FC } from 'react';

type SectionTitleProps = {
  readonly title: string;
  readonly description?: string;
};

export const SectionTitle: FC<SectionTitleProps> = ({ title, description }) => {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold lg:text-3xl">{title}</h2>
      {description && (
        <p className="text-gray-600 dark:text-gray-400 max-w-[50ch] mx-auto text-sm md:text-base">
          {description}
        </p>
      )}
    </div>
  );
};
