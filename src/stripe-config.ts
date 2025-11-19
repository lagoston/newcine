export const products = {
  premium: {
    id: 'prod_TS7VLXMErzpBKQ', // TODO: Replace with new product ID from Stripe
    priceId: 'price_1SVDGXElYXeJYKCBKbqjTvae', // TODO: Replace with new price ID from Stripe
    name: 'Premium Monthly',
    description: 'CineOracle Premium Monthly Subscription',
    price: 2.99,
    mode: 'subscription' as const,
  }
} as const;