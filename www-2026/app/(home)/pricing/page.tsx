import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Get premium features and support. Support open source. Win-win. tRPC is free to use, but we offer premium plans for teams that need tailored support and features.',
};

const tiers = [
  {
    name: 'Open Source',
    id: 'tier-free',
    price: 'Free. Forever.',
    priceSuffix: null,
    description:
      'Our MIT-licensed packages are free to use, forever. But you can donate.',
    features: [
      'Access to all MIT-licensed tRPC packages',
      'Community support through Discord and GitHub Discussions',
    ],
    featured: false,
    cta: 'Donate',
    href: '/sponsor',
    external: false,
  },
  {
    name: 'Pro',
    id: 'tier-pro',
    price: '$500',
    priceSuffix: '/month',
    description: 'A plan that scales with your rapidly growing business.',
    features: [
      'Everything in the Open Source plan',
      'Prioritized feature requests',
      'Prioritized bug fixes',
      'Prioritized support',
      'Dedicated Discord channel for your team',
      'Access to non-MIT-licensed tRPC packages',
      'Up to 2 hours consulting each month with a core team member',
      'Cancel any time',
      'Optional: Your company featured on the tRPC website and GitHub readme',
    ],
    featured: false,
    cta: 'Buy plan',
    href: '/buy/tier-pro',
    external: false,
  },
  {
    name: 'Enterprise',
    id: 'tier-enterprise',
    price: 'Custom',
    priceSuffix: null,
    description: 'Dedicated support and infrastructure for your company.',
    features: [
      'Everything in the Pro plan',
      'Tailored feature requests',
      'Access to enterprise tRPC packages',
      '24-hour support response time',
      'Dedicated Slack or Discord channel',
      'Optional: Your company featured on the tRPC website and GitHub readme',
    ],
    featured: true,
    cta: 'Contact us',
    href: 'mailto:sales@trpc.io?subject=Enterprise%20Plan%20Inquiry',
    external: true,
  },
];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <main className="space-y-28 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-fd-primary">
            Pricing
          </h2>
          <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            Get premium features and support. Support open source. Win-win.
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-fd-muted-foreground">
          tRPC is free to use, but we offer premium plans for teams that need
          tailored support and features.
        </p>
        <div className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-3xl p-8 ring-1 xl:p-10 space-y-6 ${
                tier.featured
                  ? 'bg-fd-primary text-fd-primary-foreground ring-fd-primary'
                  : 'ring-fd-border'
              }`}
            >
              <div className="space-y-4">
                <h3
                  id={tier.id}
                  className="text-lg font-semibold leading-8"
                >
                  {tier.name}
                </h3>
                <p
                  className={`text-sm leading-6 ${
                    tier.featured
                      ? 'text-fd-primary-foreground/80'
                      : 'text-fd-muted-foreground'
                  }`}
                >
                  {tier.description}
                </p>
              </div>
              <div className="space-y-4">
                <p className="flex items-baseline gap-x-1">
                  <span className="text-4xl font-bold tracking-tight">
                    {tier.price}
                  </span>
                  {tier.priceSuffix ? (
                    <span
                      className={`text-sm font-semibold leading-6 ${
                        tier.featured
                          ? 'text-fd-primary-foreground/80'
                          : 'text-fd-muted-foreground'
                      }`}
                    >
                      {tier.priceSuffix}
                    </span>
                  ) : null}
                </p>

                {tier.external ? (
                  <a
                    href={tier.href}
                    aria-describedby={tier.id}
                    className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                      tier.featured
                        ? 'bg-fd-primary-foreground text-fd-primary hover:bg-fd-primary-foreground/90'
                        : 'bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90'
                    }`}
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    href={tier.href}
                    aria-describedby={tier.id}
                    className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                      tier.featured
                        ? 'bg-fd-primary-foreground text-fd-primary hover:bg-fd-primary-foreground/90'
                        : 'bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90'
                    }`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
              <ul
                role="list"
                className={`mt-8 space-y-3 text-sm leading-6 xl:mt-10 ${
                  tier.featured
                    ? 'text-fd-primary-foreground/80'
                    : 'text-fd-muted-foreground'
                }`}
              >
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <CheckIcon
                      className={`h-6 w-5 flex-none ${
                        tier.featured
                          ? 'text-fd-primary-foreground'
                          : 'text-fd-primary'
                      }`}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-fd-muted-foreground">
        Got questions? Do not hesitate to email us at{' '}
        <a
          href="mailto:info@trpc.io?subject=Pricing"
          className="text-fd-primary underline hover:text-fd-primary/80"
        >
          info@trpc.io
        </a>
      </p>
    </main>
  );
}
