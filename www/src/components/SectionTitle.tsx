import React, { FC } from 'react';

type SectionTitleProps = {
  readonly title: string;
  readonly description?: string;
};

export const SectionTitle: FC<SectionTitleProps> = ({ title, description }) => {
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold">{title}</h2>
      {description && (
        <p className="text-gray-600 dark:text-gray-400 max-w-[60ch] mx-auto">
          {description}
        </p>
      )}
    </div>
  );
};
