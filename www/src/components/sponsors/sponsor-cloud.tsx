import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@shared/ui/components/tooltip';
import { cn } from '@shared/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { PartyPopper } from 'lucide-react';
import { type CSSProperties, useCallback, useState } from 'react';

import {
  avatarUrl,
  drawnSponsors,
  recentSponsorsOf,
  type Sponsor,
  sponsorKey,
  sponsorUrl,
} from '~/sponsors.ts';

import { animateCloud } from './jelly.ts';
import {
  type Bubble,
  cloudHeight,
  cloudPadding,
  packSponsors,
} from './pack.ts';
import { useTapTooltips } from './tap-tooltips.ts';

/** The reader's own bubble, asking them to join: as big as a middling sponsor's. */
const you = { weight: 20 } as const;
type You = typeof you;
const isYou = (entry: Sponsor | You): entry is You => entry === you;
const keyOf = (entry: Sponsor | You) =>
  isYou(entry) ? 'you' : sponsorKey(entry);

const packed = packSponsors<Sponsor | You>(
  [...drawnSponsors, you],
  cloudPadding,
);

/** The sponsors' bubbles, then the reader's: last, so it's tabbed to last. */
const bubbles = [
  ...packed.filter((bubble) => !isYou(bubble.sponsor)),
  ...packed.filter((bubble) => isYou(bubble.sponsor)),
];

/** How many sponsors' bubbles there are, before the reader's. */
const sponsorCount = bubbles.length - 1;

const height = cloudHeight(bubbles);

/**
 * Who the cloud celebrates, as of the build rather than the reader's
 * clock, so the prerendered page hydrates unchanged.
 */
const recent = recentSponsorsOf(drawnSponsors, import.meta.env.BUILT_AT);
const recentKeys = new Set(recent.sponsors.map(sponsorKey));

/** How much of the viewport's height, under the header, the heart leaves free, so it fits whole. */
const viewportPadding = '3rem';

/** The cloud's widest, in px: `max-w-4xl`. */
const maxWidth = 896;

/** GitHub resizes avatars; ask for the smallest of these that's sharp at 2x. */
const avatarSizes = [64, 120, 240, 460] as const;

const avatarSizeFor = (r: number) =>
  avatarSizes.find((size) => size >= r * 2 * maxWidth * 2) ?? 460;

const since = new Intl.DateTimeFormat('en', {
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

const names = new Intl.ListFormat('en').format(
  recent.sponsors.map((sponsor) => sponsor.name),
);

/** How long after the one before each bubble starts to pop in, in ms. */
const stagger = 18;
const lastDelay = 900;
/** How long bubble `index` waits to pop in, in ms: the heaviest first. */
const entranceDelay = (index: number) => Math.min(index * stagger, lastDelay);
/** How long a bubble takes to pop in, in ms (`duration-500`). */
const popMs = 500;

/** When the celebrated bubbles pop: after the rest have, or soon when they never hid. */
const celebrateDelayMs = (entrance: Entrance) =>
  entrance === 'shown' ? entranceDelay(sponsorCount - 1) + popMs : 300;

/** When the reader's bubble fades in: once the celebrated have popped and settled. */
const youDelayMs = (entrance: Entrance) => celebrateDelayMs(entrance) + 1400;

/** How long after the reader's bubble starts to fade in its caption does, in ms. */
const captionAfter = 700;

/** How long after a celebrated bubble starts to pop each flourish starts, in ms. */
const confettiAfter = 300;
const rippleAfter = 350;

const delayed = (ms: number) => ({ animationDelay: `${ms}ms` });

/** Where bubble `index` sits, and when it pops in after the cloud shows. */
const placed = (bubble: Bubble<Sponsor | You>, index: number) =>
  ({
    left: `${bubble.x * 100}%`,
    top: `${(bubble.y / height) * 100}%`,
    transitionDelay: `${entranceDelay(index)}ms`,
    width: `${bubble.r * 200}%`,
  }) satisfies CSSProperties;

const bubbleClass =
  'absolute aspect-square -translate-1/2 transition-[scale,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none in-data-[entrance=waiting]:pointer-events-none in-data-[entrance=waiting]:scale-50 in-data-[entrance=waiting]:opacity-0 has-[a:hover]:z-10 has-[a[data-popup-open]]:z-10';

const confettiColors = [
  'bg-amber-300',
  'bg-amber-400',
  'bg-pink-500',
  'bg-emerald-400',
  'bg-sky-400',
] as const;
const confettiCount = 10;

/**
 * Whether the bubbles wait to pop in: only when JavaScript runs, motion is
 * welcome and the cloud starts out of view, so a reader who can see it
 * never sees it disappear.
 */
type Entrance = 'none' | 'waiting' | 'shown';

/**
 * Every sponsor the site draws as a circle, sized by what they've given, in
 * a heart. The newest (`recentSponsorsOf`) wear a yellow ring with a
 * slow sheen, and say so in their tooltip; once the cloud is in view, and
 * motion is welcome, they pop in last with a burst of confetti. A last
 * bubble, "You?", fades in after them, linking to `/sponsor`, or on that
 * page (`you="github"`) to GitHub Sponsors.
 */
export function SponsorCloud(props: {
  readonly className?: string;
  readonly you?: 'github' | 'sponsor-page';
}) {
  const [entrance, setEntrance] = useState<Entrance>('none');
  const [celebrating, setCelebrating] = useState(false);
  const celebrateAt = celebrateDelayMs(entrance);
  const tap = useTapTooltips();
  // Stable, so React sets the cloud up once rather than on every render.
  const alive = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    let stop: (() => void) | undefined;
    let shown = false;
    const start = () => {
      const cloud = animateCloud(
        element,
        [...element.querySelectorAll<HTMLElement>('[data-bubble]')],
        bubbles,
      );
      let waiting = false;
      const show = () => {
        if (waiting && !shown) {
          // The celebrated bubbles drop in as they pop, after the rest.
          cloud.drop(
            // The reader's falls now, unseen, to fade in at rest.
            bubbles.map((bubble, index) =>
              isYou(bubble.sponsor)
                ? 0
                : recentKeys.has(sponsorKey(bubble.sponsor))
                  ? celebrateDelayMs('shown')
                  : entranceDelay(index),
            ),
          );
        }
        shown = true;
        setEntrance((now) => (now === 'waiting' ? 'shown' : now));
        setCelebrating(true);
        observer.disconnect();
        element.removeEventListener('focusin', show);
      };
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            show();
          } else {
            waiting = true;
            setEntrance((now) => (now === 'none' ? 'waiting' : now));
          }
        },
        { rootMargin: '0px 0px -20% 0px' },
      );
      observer.observe(element);
      // Keyboard focus mustn't land on a bubble that hasn't shown yet.
      element.addEventListener('focusin', show);
      stop = () => {
        observer.disconnect();
        element.removeEventListener('focusin', show);
        cloud.stop();
        setEntrance((now) => (now === 'waiting' ? 'none' : now));
        stop = undefined;
      };
    };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const follow = () => {
      if (motion.matches) {
        stop?.();
      } else if (stop === undefined) {
        start();
      }
    };
    follow();
    motion.addEventListener('change', follow);
    return () => {
      motion.removeEventListener('change', follow);
      stop?.();
    };
  }, []);
  return (
    <div className={props.className}>
      <div
        className="relative mx-auto w-full"
        data-entrance={entrance}
        ref={alive}
        style={
          {
            aspectRatio: `1 / ${height}`,
            maxWidth: `calc((100svh - var(--site-header) - ${viewportPadding}) / ${height})`,
          } satisfies CSSProperties
        }
      >
        {bubbles.map((bubble, index) => {
          const sponsor = bubble.sponsor;
          if (isYou(sponsor)) {
            return (
              <YouBubble
                delayMs={youDelayMs(entrance)}
                entering={entrance !== 'waiting'}
                key={keyOf(sponsor)}
                link={props.you ?? 'sponsor-page'}
                style={placed(bubble, index)}
              />
            );
          }
          const celebrated = recentKeys.has(sponsorKey(sponsor));
          return (
            <span
              className={cn(
                bubbleClass,
                celebrated && 'z-[5]',
                celebrated &&
                  celebrating &&
                  (entrance === 'shown'
                    ? 'motion-safe:animate-sponsor-pop'
                    : 'motion-safe:animate-sponsor-boing'),
              )}
              data-bubble=""
              key={sponsorKey(sponsor)}
              style={{
                ...(celebrated && celebrating ? delayed(celebrateAt) : {}),
                ...placed(bubble, index),
              }}
            >
              <Tooltip {...tap(sponsorKey(sponsor)).root}>
                <TooltipTrigger
                  delay={80}
                  render={
                    <a
                      {...tap(sponsorKey(sponsor)).trigger}
                      aria-label={
                        celebrated
                          ? `${sponsor.name}, ${recent.kind === 'new' ? 'a new' : 'one of the latest'} sponsor`
                          : sponsor.name
                      }
                      className={cn(
                        'relative block size-full overflow-hidden rounded-full bg-background shadow-md transition-[scale,box-shadow] duration-200 outline-none [-webkit-touch-callout:none] hover:scale-105 hover:shadow-lg focus-visible:scale-105 focus-visible:ring-3 focus-visible:ring-ring data-popup-open:scale-105 data-popup-open:shadow-lg',
                        celebrated
                          ? 'ring-2 ring-amber-400'
                          : 'ring-1 ring-foreground/10 hover:ring-2 hover:ring-brand data-popup-open:ring-2 data-popup-open:ring-brand',
                      )}
                      href={sponsor.link}
                      rel="sponsored noopener"
                      target="_blank"
                    />
                  }
                >
                  <img
                    alt=""
                    className="size-full object-cover"
                    decoding="async"
                    height={avatarSizeFor(bubble.r)}
                    loading="lazy"
                    src={avatarUrl(sponsor, avatarSizeFor(bubble.r))}
                    width={avatarSizeFor(bubble.r)}
                  />
                  {celebrated ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_40%,rgb(253_230_138/0.5)_50%,transparent_60%)] bg-size-[250%_100%] bg-position-[150%_0] bg-no-repeat motion-safe:animate-sponsor-shimmer"
                    />
                  ) : null}
                </TooltipTrigger>
                <TooltipContent
                  className="flex-col items-start gap-0"
                  render={
                    // The bubble is the link a keyboard or screen reader
                    // reaches; its tooltip is one more place to click it.
                    <a
                      aria-hidden
                      href={sponsor.link}
                      rel="sponsored noopener"
                      tabIndex={-1}
                      target="_blank"
                    />
                  }
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    {sponsor.name}
                    {celebrated ? (
                      <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide text-amber-950 uppercase">
                        {recent.kind === 'new' ? 'New' : 'Latest'}
                      </span>
                    ) : null}
                  </span>
                  <span className="opacity-70">
                    Since {since.format(sponsor.createdAt)}
                  </span>
                </TooltipContent>
              </Tooltip>
              {celebrated && celebrating ? (
                <span
                  aria-hidden
                  className="pointer-events-none motion-reduce:hidden"
                >
                  <span
                    className="absolute inset-0 rounded-full border-2 border-amber-400 opacity-0 motion-safe:animate-sponsor-ripple"
                    style={delayed(celebrateAt + rippleAfter)}
                  />
                  {Array.from({ length: confettiCount }, (_, piece) => (
                    <span
                      className="absolute inset-0"
                      key={piece}
                      style={{ rotate: `${(piece * 360) / confettiCount}deg` }}
                    >
                      <span
                        className={cn(
                          'absolute top-1/2 left-1/2 size-[15%] min-h-1.5 min-w-1.5 -translate-1/2 opacity-0 motion-safe:animate-sponsor-confetti',
                          piece % 2 === 0 ? 'rounded-full' : 'rounded-[1px]',
                          confettiColors[piece % confettiColors.length],
                        )}
                        style={delayed(celebrateAt + confettiAfter)}
                      />
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {recent.sponsors.length > 0 ? (
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <PartyPopper aria-hidden className="size-4 shrink-0 text-brand" />
          <span>
            {recent.kind === 'new' ? (
              <>
                Welcome to our newest{' '}
                {recent.sponsors.length === 1 ? 'sponsor' : 'sponsors'},{' '}
                <span className="font-medium text-foreground">{names}</span>!
              </>
            ) : (
              <>
                Our latest sponsors:{' '}
                <span className="font-medium text-foreground">{names}</span>.
                Thank you!
              </>
            )}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The reader's bubble: "You?", linking to where they'd sponsor, with a
 * caption that says so, always shown rather than a tooltip, so a single tap
 * follows it. It fades in `delayMs` after it starts `entering`, and its
 * caption a little after, unless keyboard focus reaches it first, which
 * shows both at once.
 */
function YouBubble(props: {
  readonly delayMs: number;
  readonly entering: boolean;
  readonly link: 'github' | 'sponsor-page';
  readonly style: CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  const github = props.link === 'github';
  const animate = props.entering && !focused;
  const caption = github ? 'Sponsor on GitHub' : 'Become a sponsor';
  const linkProps = {
    'aria-label': github
      ? 'Your bubble here? Sponsor tRPC on GitHub'
      : 'Your bubble here? Become a sponsor',
    children: (
      <>
        <span aria-hidden className="text-[24cqw] leading-none">
          You?
        </span>
        <span
          aria-hidden
          className={cn(
            'absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-full bg-foreground px-2 py-1 text-[11px] leading-none font-medium whitespace-nowrap text-background shadow-md',
            animate && 'motion-safe:animate-sponsor-you-caption',
          )}
          style={animate ? delayed(props.delayMs + captionAfter) : undefined}
        >
          {caption}
        </span>
      </>
    ),
    className:
      'relative flex size-full items-center justify-center rounded-full border-2 border-dashed border-foreground/25 bg-background font-semibold text-muted-foreground shadow-md transition-[scale,box-shadow,color,border-color] duration-200 outline-none @container hover:scale-105 hover:border-brand hover:text-brand hover:shadow-lg focus-visible:scale-105 focus-visible:ring-3 focus-visible:ring-ring',
  };
  return (
    <span
      className={cn(
        bubbleClass,
        'z-10',
        // From none to an animation replays it, once the cloud shows.
        animate && 'motion-safe:animate-sponsor-you',
      )}
      data-bubble=""
      onFocus={() => setFocused(true)}
      style={{
        ...props.style,
        ...(focused ? { transition: 'none' } : delayed(props.delayMs)),
      }}
    >
      {github ? (
        <a {...linkProps} href={sponsorUrl} rel="noopener" target="_blank" />
      ) : (
        <Link {...linkProps} to="/sponsor" />
      )}
    </span>
  );
}
