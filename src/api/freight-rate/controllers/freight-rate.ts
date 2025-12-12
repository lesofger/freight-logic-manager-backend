import { factories } from '@strapi/strapi';

function estimatePostalCodeDistance(postal1: string, postal2: string): number {
  const combinedCode = `${postal1}${postal2}`;
  const hash = combinedCode.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  return (hash % 4900) + 100; // 100-5000 km
}

export default factories.createCoreController('api::freight-rate.freight-rate', {
  /**
   * Calculate freight rate for items
   * POST /api/freight-rates/calculate
   * Body: {
   *   items: [{ 
   *     weight (g), 
   *     length (mm), 
   *     width (mm), 
   *     height (mm), 
   *     quantity,
   *     productId?: string (optional, for reference)
   *   }, ...],
   *   destinationPostalCode: string (required),
   *   warehouseId?: string (optional, use specific warehouse),
   *   originPostalCode?: string (optional, fallback if warehouse not found)
   * }
   */
  async calculate(ctx) {
    try {
      const { items, destinationPostalCode, warehouseId, originPostalCode } = ctx.request.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return ctx.badRequest('Items array is required and must not be empty');
      }

      if (!destinationPostalCode) {
        return ctx.badRequest('Destination postal code is required');
      }

      for (const item of items) {
        if (!item.weight || !item.length || !item.width || !item.height || !item.quantity) {
          return ctx.badRequest('Each item must have weight, length, width, height, and quantity');
        }
      }

      let warehousePostalCode: string | null = null;
      let selectedWarehouseId: string | null = null;

      let distance: number = 0;

      if (warehouseId) {
        try {
          const warehouse = await strapi.entityService.findOne('api::warehouse.warehouse', warehouseId);
          if (warehouse && warehouse.zipcode) {
            warehousePostalCode = warehouse.zipcode;
            selectedWarehouseId = warehouseId;
            distance = estimatePostalCodeDistance(warehouse.zipcode, destinationPostalCode);
            strapi.log.info(`[Freight Rate] Using specified warehouse ${warehouseId} with postal code ${warehousePostalCode}`);
          } else {
            throw new Error(`Warehouse ${warehouseId} not found or has no zipcode`);
          }
        } catch (err) {
          strapi.log.error(`[Freight Rate] Error finding warehouse ${warehouseId}: ${err.message}`);
          return ctx.badRequest(`Warehouse ${warehouseId} not found`);
        }
      } else {
        try {
          const warehouses = await strapi.entityService.findMany('api::warehouse.warehouse', {
            limit: 1000,
          });

          if (!warehouses || warehouses.length === 0) {
            if (originPostalCode) {
              strapi.log.warn('[Freight Rate] No warehouses found, falling back to originPostalCode');
              warehousePostalCode = originPostalCode;
            } else {
              return ctx.badRequest('No warehouses found and originPostalCode not provided');
            }
          } else {
            let closestWarehouse = warehouses[0];
            let closestDistance = estimatePostalCodeDistance(closestWarehouse.zipcode, destinationPostalCode);

            for (const warehouse of warehouses) {
              const distance = estimatePostalCodeDistance(warehouse.zipcode, destinationPostalCode);
              if (distance < closestDistance) {
                closestDistance = distance;
                closestWarehouse = warehouse;
              }
            }

            distance = closestDistance;
            warehousePostalCode = closestWarehouse.zipcode;
            selectedWarehouseId = String(closestWarehouse.id);
            strapi.log.info(
              `[Freight Rate] Found closest warehouse ${closestWarehouse.id} (${closestWarehouse.name}) with distance ${closestDistance}km`
            );
          }
        } catch (err) {
          strapi.log.error(`[Freight Rate] Error finding warehouses: ${err.message}`);
          if (originPostalCode) {
            strapi.log.warn('[Freight Rate] Falling back to originPostalCode');
            warehousePostalCode = originPostalCode;
          } else {
            return ctx.internalServerError('Failed to determine warehouse location');
          }
        }
      }

      if (!warehousePostalCode) {
        return ctx.badRequest('Could not determine origin postal code');
      }

      const freightRateService = strapi.service('api::freight-rate.freight-rate');
      const result = await freightRateService.calculateRate({
        items,
        distance,
      });
      strapi.log.info(`[Freight Rate] result: ${JSON.stringify(result)}`);

      // const rateRecord = await strapi.entityService.create('api::freight-rate.freight-rate', {
      //   data: {
      //     originPostalCode: warehousePostalCode,
      //     destinationPostalCode,
      //     totalWeight: items.reduce((sum, item) => sum + item.weight * item.quantity, 0),
      //     totalVolume: items.reduce(
      //       (sum, item) => sum + item.length * item.width * item.height * item.quantity,
      //       0
      //     ),
      //     density: result.density,
      //     freightClass: result.freightClass,
      //     items,
      //     applicableRates: result.applicableRates,
      //     selectedRate: result.lowestRate,
      //     distance: result.distance,
      //     status: 'calculated',
      //   },
      // });

      return {
        data: {
          // id: rateRecord.id,
          ...result,
          // freightRateId: rateRecord.id,
          selectedWarehouseId,
          originPostalCode: warehousePostalCode,
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
