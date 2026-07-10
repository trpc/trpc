import { PageMetadata } from '@docusaurus/theme-common';
import { CheckIcon } from '@heroicons/react/20/solid';
import Layout from '@theme/Layout';
import React, { useState } from 'react';
import { docsParams } from '../../og-image/utils/zodParams';
import { Button } from '../components/Button';
import { useEnv } from '../utils/useEnv';

const frequencies = [
  { value: 'monthly', label: 'Monthly', priceSuffix: '/month' },
  { value: 'annually', label: 'Annually', priceSuffix: '/year' },
] as const satisfies { value: string; label: string; priceSuffix: string }[];

const tiers = [
  {
    name: 'Open Source',
    id: 'tier-free',
    price: 'Free. Forever.',
    description:
      'Our MIT-licensed packages are free to use, forever. But you can donate.',
    features: [
      'Access to all MIT-licensed tRPC packages',
      'Community support through Discord and GitHub Discussions',
    ],
    featured: false,
    cta: 'Donate',
    href: '/sponsor',
  },
  {
    name: 'Pro',
    id: 'tier-pro',
    href: '/buy/tier-pro',
    price: { monthly: '$500', annually: '$4500' },
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
  },
  {
    name: 'Enterprise',
    id: 'tier-enterprise',
    price: 'Custom',
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
    href: 'mailto:sales@trpc.io?subject=Enterprise%20Plan%20Inquiry',
    cta: 'Contact us',
  },
] as const satisfies {
  name: string;
  id: string;
  href: string;
  price: string | { monthly: string; annually: string };
  description: string;
  features: string[];
  featured: boolean;
  cta: string;
}[];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

function Pricing() {
  const [
    frequency,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setFrequency,
  ] = useState(frequencies[0]);

  return (
    <main className="space-y-28 bg-white px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-primary">
            Pricing
          </h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Get premium features and support. Support open source. Win-win.
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-600">
          tRPC is free to use, but we offer premium plans for teams that need
          tailored support and features.{' '}
        </p>
        {/* <div className="mt-16 flex justify-center">
          <RadioGroup
            value={frequency}
            onChange={setFrequency}
            className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center text-xs font-semibold leading-5 ring-1 ring-inset ring-gray-200"
          >
            <RadioGroup.Label className="sr-only">
              Payment frequency
            </RadioGroup.Label>
            {frequencies.map((option) => (
              <RadioGroup.Option
                key={option.value}
                value={option}
                className={({ checked }) =>
                  classNames(
                    checked ? 'bg-primary text-white' : 'text-gray-500',
                    'cursor-pointer rounded-full px-2.5 py-1',
                  )
                }
              >
                <span>{option.label}</span>
              </RadioGroup.Option>
            ))}
          </RadioGroup>
        </div> */}
        <div className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={classNames(
                tier.featured ? 'bg-gray-900 ring-gray-900' : 'ring-gray-200',
                'rounded-3xl p-8 ring-1 xl:p-10',
                'space-y-6',
              )}
            >
              <div className="space-y-4">
                <h3
                  id={tier.id}
                  className={classNames(
                    tier.featured ? 'text-white' : 'text-gray-900',
                    'text-lg font-semibold leading-8',
                  )}
                >
                  {tier.name}
                </h3>
                <p
                  className={classNames(
                    tier.featured ? 'text-gray-300' : 'text-gray-600',
                    'text-sm leading-6',
                  )}
                >
                  {tier.description}
                </p>
              </div>
              <div className="space-y-4">
                <p className="flex items-baseline gap-x-1">
                  <span
                    className={classNames(
                      tier.featured ? 'text-white' : 'text-gray-900',
                      'text-4xl font-bold tracking-tight',
                    )}
                  >
                    {typeof tier.price === 'string'
                      ? tier.price
                      : tier.price[frequency.value]}
                  </span>
                  {typeof tier.price !== 'string' ? (
                    <span
                      className={classNames(
                        tier.featured ? 'text-gray-300' : 'text-gray-600',
                        'text-sm font-semibold leading-6',
                      )}
                    >
                      {frequency.priceSuffix}
                    </span>
                  ) : null}
                </p>

                <Button
                  href={tier.href}
                  aria-describedby={tier.id}
                  variant="primary"
                  className="w-full"
                  external
                >
                  {tier.cta}
                </Button>
              </div>
              <ul
                role="list"
                className={classNames(
                  tier.featured ? 'text-gray-300' : 'text-gray-600',
                  'mt-8 space-y-3 text-sm leading-6 xl:mt-10',
                )}
              >
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <CheckIcon
                      className={classNames(
                        tier.featured ? 'text-white' : 'text-primary',
                        'h-6 w-5 flex-none',
                      )}
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <p className="text-italic text-center text-gray-900">
        Got questions? Do not hesitate to email us at{' '}
        <a href="mailto:info@trpc.io?subject=Pricing">info@trpc.io</a>
      </p>
    </main>
  );
}

export default function Page() {
  const env = useEnv();

  const ogImg = `${env.OG_URL}/api/docs?${docsParams.toSearchString({
    title: '💸💸💸 Pricing 💸💸💸💸',
    description:
      'Get premium features and support. Support open source. Win-win.',
    permalink: '/pricing',
  })}`;
  return (
    <Layout
      title="Pricing 💸"
      description="Get premium features and support. Support open source. Win-win. tRPC is free to use, but we offer premium plans for teams that need tailored support and features."
    >
      <PageMetadata image={ogImg} />
      <Pricing />
    </Layout>
  );
}
