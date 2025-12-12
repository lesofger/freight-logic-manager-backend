/**
 * Custom routes for freight-calc API
 * This is a custom API endpoint without a content type
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/freight-calc/calculate',
      handler: 'api::freight-calc.freight-calc.calculate',
      config: {
        auth: false,
      },
    },
  ],
};

