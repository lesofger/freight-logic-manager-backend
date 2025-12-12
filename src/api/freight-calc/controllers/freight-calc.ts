/**
 * Custom controller for freight-calc API
 * This controller does not use a content type - it's purely for calculations
 */

function estimatePostalCodeDistance(postal1: string, postal2: string): number {
  const combinedCode = `${postal1}${postal2}`;
  const hash = combinedCode.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  return (hash % 4900) + 100; // 100-5000 km
}

export default {
  /**
   * Calculate freight rate for items
   * POST /api/freight-calc/calculate
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
            strapi.log.info(`[Freight Calc] Using specified warehouse ${warehouseId} with postal code ${warehousePostalCode}`);
          } else {
            throw new Error(`Warehouse ${warehouseId} not found or has no zipcode`);
          }
        } catch (err) {
          strapi.log.error(`[Freight Calc] Error finding warehouse ${warehouseId}: ${err.message}`);
          return ctx.badRequest(`Warehouse ${warehouseId} not found`);
        }
      } else {
        try {
          const warehouses = await strapi.entityService.findMany('api::warehouse.warehouse', {
            limit: 1000,
          });

          if (!warehouses || warehouses.length === 0) {
            if (originPostalCode) {
              strapi.log.warn('[Freight Calc] No warehouses found, falling back to originPostalCode');
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
              `[Freight Calc] Found closest warehouse ${closestWarehouse.id} (${closestWarehouse.name}) with distance ${closestDistance}km`
            );
          }
        } catch (err) {
          strapi.log.error(`[Freight Calc] Error finding warehouses: ${err.message}`);
          if (originPostalCode) {
            strapi.log.warn('[Freight Calc] Falling back to originPostalCode');
            warehousePostalCode = originPostalCode;
          } else {
            return ctx.internalServerError('Failed to determine warehouse location');
          }
        }
      }

      if (!warehousePostalCode) {
        return ctx.badRequest('Could not determine origin postal code');
      }

      // Use the freight-calc service
      const freightCalcService = strapi.service('api::freight-calc.freight-calc');
      const result = await freightCalcService.calculateRate({
        items,
        distance,
      });
      strapi.log.info(`[Freight Calc] result: ${JSON.stringify(result)}`);

      return {
        data: {
          ...result,
          selectedWarehouseId,
          originPostalCode: warehousePostalCode,
        },
      };
    } catch (error) {
      strapi.log.error(`[Freight Calc Controller] Error: ${error.message}`);
      return ctx.internalServerError(`Rate calculation failed: ${error.message}`);
    }
  },
};

