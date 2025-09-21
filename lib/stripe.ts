import Stripe from 'stripe';

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  {
    apiVersion: '2024-11-20.acacia',
    typescript: true,
  }
);

export const PRODUCTS = {
  SINGLE_IMAGE: {
    name: '1 Edge Design Credit',
    price: 3900, // $39 in cents
    credits: 1,
  },
  THREE_IMAGES: {
    name: '3 Edge Design Credits',
    price: 9900, // $99 in cents
    credits: 3,
  },
} as const;