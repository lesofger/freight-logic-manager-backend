/**
 * Custom routes for freight-rate API
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/freight-rates/calculate',
      handler: 'api::freight-rate.freight-rate.calculate',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/freight-rates/history',
      handler: 'api::freight-rate.freight-rate.history',
      config: {
        auth: false,
      },
    },
  ],
};
