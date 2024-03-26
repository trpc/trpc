import { headers } from 'next/headers';

const auth = () => ({ userId: '123' });
const clerkClient: any = {};
const stripe: any = {};

export async function createStripeUrl(appId: string) {
  const { userId } = auth();
  const user = await clerkClient.users.getUser(userId);

  const customerId = user.privateMetadata.stripeCustomerId as
    | string
    | undefined;

  const redirectUrl = headers().get('x-forwarded-host') + `/dashboard/${appId}`;

  const session = await stripe.checkout.sessions.create({
    line_items: [{ priceId: '123' }],
    mode: 'subscription',
    client_reference_id: userId,
    customer: customerId,
    success_url: redirectUrl,
    cancel_url: redirectUrl,
  });

  return session.url as string | null;
}
