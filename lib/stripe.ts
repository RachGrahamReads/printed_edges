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
    priceId: process.env.STRIPE_SINGLE_CREDIT_PRICE_ID, // "Single Edge Design Credit" product
    credits: 1,
    // Fallback to hardcoded pricing if Price ID not set
    fallbackPrice: 3900, // $39 in cents
    fallbackName: "Single Edge Design Credit",
  },
  THREE_IMAGES: {
    priceId: process.env.STRIPE_THREE_CREDITS_PRICE_ID, // "Three Edge Design Credits" product
    credits: 3,
    // Fallback to hardcoded pricing if Price ID not set
    fallbackPrice: 9900, // $99 in cents
    fallbackName: "Three Edge Design Credits",
  },
} as const;