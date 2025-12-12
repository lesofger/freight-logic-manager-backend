/**
 * freight-rate controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::freight-rate.freight-rate', {
  /**
   * Calculate freight rate for items
   * POST /api/freight-rates/calculate
   * Body: {
   *   items: [{ productId, weight (g), length (mm), width (mm), height (mm), quantity }, ...],
   *   originPostalCode: string,
   *   destinationPostalCode: string,
   *   warehouseId?: string (optional, for warehouse location)
   * }
   */
  async calculate(ctx) {
    try {
      const { items, originPostalCode, destinationPostalCode, warehouseId } = ctx.request.body;

      // Validate request body
      if (!items || !Array.isArray(items) || items.length === 0) {
        return ctx.badRequest('Items array is required and must not be empty');
      }

      if (!originPostalCode || !destinationPostalCode) {
        return ctx.badRequest('Origin and destination postal codes are required');
      }

      // Validate each item
      for (const item of items) {
        if (!item.weight || !item.length || !item.width || !item.height || !item.quantity) {
          return ctx.badRequest('Each item must have weight, length, width, height, and quantity');
        }
      }

      // Get warehouse postal code if provided
      let warehousePostalCode = originPostalCode;
      if (warehouseId) {
        try {
          const warehouse = await strapi.entityService.findOne('api::warehouse.warehouse', warehouseId);
          if (warehouse && warehouse.zipcode) {
            warehousePostalCode = warehouse.zipcode;
          }
        } catch (err) {
          strapi.log.warn(`Could not find warehouse ${warehouseId}: ${err.message}`);
        }
      }

      // Calculate rate using service
      const freightRateService = strapi.service('api::freight-rate.freight-rate');
      const result = await freightRateService.calculateRate({
        items,
        originPostalCode: warehousePostalCode,
        destinationPostalCode,
        warehouseId,
      });

      // Create record in database
      const rateRecord = await strapi.entityService.create('api::freight-rate.freight-rate', {
        data: {
          originPostalCode: warehousePostalCode,
          destinationPostalCode,
          totalWeight: items.reduce((sum, item) => sum + item.weight * item.quantity, 0),
          totalVolume: items.reduce(
            (sum, item) => sum + item.length * item.width * item.height * item.quantity,
            0
          ),
          density: result.density,
          freightClass: result.freightClass,
          items,
          applicableRates: result.applicableRates,
          selectedRate: result.lowestRate,
          distance: result.distance,
          status: 'calculated',
        },
      });

      return {
        data: {
          id: rateRecord.id,
          ...result,
          freightRateId: rateRecord.id,
        },
      };
    } catch (error) {
      strapi.log.error(`[Freight Rate Controller] Error: ${error.message}`);
      return ctx.internalServerError(`Rate calculation failed: ${error.message}`);
    }
  },

  /**
   * Get rate history
   * GET /api/freight-rates/history
   */
  async history(ctx) {
    try {
      const rates = await strapi.entityService.findMany('api::freight-rate.freight-rate', {
        limit: 100,
        sort: { createdAt: 'desc' },
      });

      return {
        data: rates,
      };
    } catch (error) {
      strapi.log.error(`[Freight Rate Controller] Error fetching history: ${error.message}`);
      return ctx.internalServerError(`Failed to fetch history: ${error.message}`);
    }
  },
});
