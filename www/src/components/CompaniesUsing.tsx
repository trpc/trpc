import * as React from 'react';
import ReactDOM from 'react-dom';
import { companies } from './CompaniesUsing.script.output';
import { SectionTitle } from './SectionTitle';

const TOOLTIP_OFFSET = 8;

function Tooltip(props: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
  } | null>(null);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => {
          const el = triggerRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          setPosition({
            top: rect.top - TOOLTIP_OFFSET,
            left: rect.left + rect.width / 2,
          });
          setOpen(true);
        }}
        onMouseLeave={() => {
          setOpen(false);
          setPosition(null);
        }}
      >
        {props.children}
      </span>
      {open &&
        position &&
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
            {props.content}
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
      <div className="group my-6 inline-flex w-full flex-nowrap overflow-hidden [mask-image:_linear-gradient(to_right,transparent_0,_black_128px,_black_calc(100%-200px),transparent_100%)]">
        {animationRow.map((_, index) => (
          <ul
            key={`animationRow${index}`}
            className="flex animate-infinite-scroll items-center justify-center md:justify-start [&_img]:max-w-none [&_li]:mx-8 group-hover:[animation-play-state:paused]"
            aria-hidden={index > 0}
          >
            {companies.map((it) => (
              <li key={it.src}>
                <Tooltip content={it.name}>
                  <img
                    src={it.src}
                    alt={it.name}
                    className="max-h-9 grayscale transition-all hover:grayscale-0 dark:invert"
                  />
                </Tooltip>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </>
  );
};
