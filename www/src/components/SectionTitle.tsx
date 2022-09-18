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
      <a
        href={`#${id}`}
        id={id}
        className="text-2xl font-bold text-black hover:no-underline lg:text-3xl scroll-mt-20 dark:text-white"
      >
        {title}
      </a>
      {description && (
        <p className="text-gray-600 dark:text-gray-400 max-w-[60ch] pt-2 mx-auto text-sm md:text-base">
          {description}
        </p>
      )}
    </div>
  );
};
