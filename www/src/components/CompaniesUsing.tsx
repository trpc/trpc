import * as React from 'react';
import ReactDOM from 'react-dom';
import { companies } from './CompaniesUsing.script.output';
import { SectionTitle } from './SectionTitle';
import { cn } from '../utils/cn';

const TOOLTIP_OFFSET = 8;

function CompanyLogo(props: { src: string; name: string }) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
  } | null>(null);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn(
          'inline-flex items-center justify-center rounded-lg px-3 py-2 transition-colors',
          position && 'dark:bg-white/90',
        )}
        onMouseEnter={() => {
          const el = triggerRef.current;
          if (el) {
            const rect = el.getBoundingClientRect();
            setPosition({
              top: rect.top - TOOLTIP_OFFSET,
              left: rect.left + rect.width / 2,
            });
          }
        }}
        onMouseLeave={() => setPosition(null)}
      >
        <img
          src={props.src}
          alt={props.name}
          className={cn(
            'max-h-9 grayscale transition-all dark:invert',
            position && 'grayscale-0 dark:invert-0',
          )}
        />
      </span>
      {position &&
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <span
            className="pointer-events-none z-50 whitespace-nowrap rounded-lg bg-zinc-800 px-2.5 py-1 text-sm font-medium text-zinc-100 shadow-lg dark:bg-zinc-700"
            style={{
              position: 'fixed',
              left: position.left,
              top: position.top,
              transform: 'translate(-50%, -100%)',
            }}
            aria-hidden
          >
            {props.name}
          </span>,
          document.body,
        )}
    </>
  );
}

const animationRow = Array(2).fill(0) as [number, number];

/**
 * An animated logo carousel to show companies using tRPC. Tailwind code taken from Cruip
 * @see https://cruip.com/create-an-infinite-horizontal-scroll-animation-with-tailwind-css/
 */
export const CompaniesUsing = () => {
  return (
    <>
      <SectionTitle
        id="companies-using"
        title="As used by"
        description="tRPC is tried and trusted by leading tech teams and many Fortune 500 companies."
      />
      <div className="group my-6 inline-flex w-full flex-nowrap py-4 [mask-image:_linear-gradient(to_right,transparent_0,_black_128px,_black_calc(100%-200px),transparent_100%)]">
        {animationRow.map((_, index) => (
          <ul
            key={`animationRow${index}`}
            className="flex animate-infinite-scroll items-center justify-center group-hover:[animation-play-state:paused] md:justify-start [&_img]:max-w-none [&_li]:mx-8"
            aria-hidden={index > 0}
          >
            {companies.map((it) => (
              <li key={it.src}>
                <CompanyLogo src={it.src} name={it.name} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </>
  );
};
