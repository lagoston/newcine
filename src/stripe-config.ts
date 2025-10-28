export const products = {
  premium: {
    id: 'prod_SEzGVeesZfkCgW',
    priceId: 'price_1RKVHvElYXeJYKCBWjxJgaub',
    name: 'Premium Monthly',
    description: 'CineOracle Premium Monthly Subscription',
    price: 4.99,
    mode: 'subscription' as const,
  },
  premiumYearly: {
    id: 'prod_SEysTJZmrOcRFa',
    priceId: 'price_1RKUv4ElYXeJYKCBpd7qimYp',
    name: 'Premium Yearly',
    description: 'CineOracle Premium Yearly Subscription', 
    price: 49.99,
    mode: 'subscription' as const,
  }
} as const;