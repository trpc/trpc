import React from 'react';

type Props = {
  cards: Array<{
    title: string;
    link: string;
    time: string;
    people: string[];
  }>;
};

export const ContentSlider = ({ cards }: Props) => {
  return (
    <div className="px-4 no-scrollbar grid sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 snap-x snap-mandatory overflow-x-auto gap-8">
      {cards.map((card) => {
        return (
          <a
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            key={card.title}
            className="p-6 flex flex-none justify-between flex-col snap-center snap-always border-2 rounded"
          >
            <p className="text-lg font-bold text-white">{card.title}</p>
            <div>
              <p className="mt-4 mb-4 text-white">{card.people.join(', ')}</p>
              <p className="text-gray-400">{card.time}</p>
            </div>
          </a>
        );
      })}
    </div>
  );
};
