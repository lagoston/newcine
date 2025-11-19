export const products = {
  premium: {
    id: 'prod_NEW_ID', // TODO: Replace with new product ID from Stripe
    priceId: 'price_NEW_ID', // TODO: Replace with new price ID from Stripe
    name: 'Premium Monthly',
    description: 'CrystalBall Premium Monthly Subscription',
    price: 2.99,
    mode: 'subscription' as const,
  }
} as const;