/**
 * freight-rate router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::freight-rate.freight-rate', {
  only: ['find', 'findOne'],
  config: {
    find: {
      auth: false,
    },
    findOne: {
      auth: false,
    },
  },
});
