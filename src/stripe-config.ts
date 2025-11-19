export const products = {
  premium: {
    id: 'prod_TSAe4gZmD8HB64', // TODO: Replace with new product ID from Stripe
    priceId: 'price_1SVGJ7ElYXeJYKCBOcWOAox4', // TODO: Replace with new price ID from Stripe
    name: 'Premium Monthly',
    description: 'CineOracle Premium Monthly Subscription',
    price: 2.99,
    mode: 'subscription' as const,
  }
} as const;