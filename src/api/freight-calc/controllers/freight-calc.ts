/**
 * Custom controller for freight-calc API
 * This controller does not use a content type - it's purely for calculations
 */

import axios from 'axios';
import moment from 'moment';
import qs from 'qs';
import { inspect } from 'util';

type DistanceMatrix = {
  destination_addresses: string[];
  origin_addresses: string[];
  rows: {
    elements: {
      distance: {
        text: string;
        value: number; // meters
      };
      duration: {
        text: string;
        value: number; // seconds
      };
      duration_in_traffic?: {
        text: string;
        value: number;
      };
      status: string;
    }[];
  }[];
  status: string;
};

async function getGoogleDistance(originPostalCode: string, destinationPostalCode: string): Promise<number> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    strapi.log.warn('[Freight Calc] GOOGLE_API_KEY not set, using fallback distance estimation');
    return 500;
  }

  const queryData = {
    departure_time: 'now',
    origins: `${originPostalCode} Canada`,
    destinations: `${destinationPostalCode} Canada`,
    key: apiKey,
  };

  strapi.log.info(`[Freight Calc] Querying Google Maps API with ${inspect(queryData, false, null, true)}`);

  try {
    const distanceMatrix = await axios
      .get<DistanceMatrix>(`https://maps.googleapis.com/maps/api/distancematrix/json?${qs.stringify(queryData)}`)
      .then((res) => res.data);

    strapi.log.info(`[Freight Calc] Google API response: ${inspect(distanceMatrix, false, null, true)}`);

    if (distanceMatrix.status !== 'OK') {
      strapi.log.error(`[Freight Calc] Google API error status: ${distanceMatrix.status}`);
      throw new Error(`Google API error: ${distanceMatrix.status}`);
    }

    const element = distanceMatrix.rows[0]?.elements[0];
    if (!element || element.status !== 'OK') {
      strapi.log.error(`[Freight Calc] Google API element error: ${element?.status || 'No element'}`);
      throw new Error(`Could not calculate distance: ${element?.status || 'No element'}`);
    }

    const distanceKm = element.distance.value / 1000;
    strapi.log.info(`[Freight Calc] Distance calculated: ${distanceKm}km (${element.distance.text})`);

    return distanceKm;
  } catch (error) {
    strapi.log.error(`[Freight Calc] Error calling Google Distance Matrix API: ${error.message}`);
    throw error;
  }
}

type RateResponse = {
  status: {
    done: boolean;
    total: number;
    complete: number;
  };
  rates: {
    service_id: string;
    valid_until: {
      year: number;
      month: number;
      day: number;
    };
    total: {
      value: string;
      currency: string;
    };
    base: {
      value: string;
      currency: string;
    };
    surcharger: {
      type: string;
      amount: {
        value: string;
        currency: string;
      };
    }[];
    taxes: {
      type: string;
      amount: {
        value: string;
        currency: string;
      };
    }[];
    transit_time_days: number;
    carrier_name: string;
    service_name: string;
  }[];
};

async function getFreightComRates(
  items: any[],
  originPostalCode: string,
  destinationPostalCode: string,
  serviceId?: string
): Promise<RateResponse['rates'] | null> {
  try {
    const apiKey = process.env.FREIGHTCOM_API_KEY;
    if (!apiKey) {
      strapi.log.warn('[Freight Calc] FREIGHTCOM_API_KEY not set, skipping freight API call');
      return null;
    }

    const client = axios.create({
      baseURL: 'https://external-api.freightcom.com',
      headers: {
        Authorization: apiKey,
      },
    });

    const deliveryDate = moment().add(7, 'days');
    const [day, month, year] = deliveryDate.format('DD MM YYYY').split(' ');

    strapi.log.info(`[Freight Calc] Delivery date: ${deliveryDate.format('DD MM YYYY')}`);

    if (!serviceId) {
      strapi.log.warn('[Freight Calc] No serviceId provided, skipping freight API call');
      // return null;
    }

    const rateData = {
      // services: [serviceId],
      details: {
        origin: {
          address: {
            country: 'CA',
            postal_code: originPostalCode,
          },
        },
        destination: {
          address: {
            country: 'CA',
            postal_code: destinationPostalCode,
          },
          ready_at: {
            hour: 15,
            minute: 6,
          },
          ready_until: {
            hour: 15,
            minute: 6,
          },
          signature_requirement: 'not-required',
        },
        expected_ship_date: {
          year: Number(year),
          month: Number(month),
          day: Number(day),
        },
        packaging_type: 'pallet',
        packaging_properties: {
          pallet_type: 'ltl',
          pallets: items.flatMap((item) => {
            const pallets = [];
            for (let i = 0; i < item.quantity; i++) {
              pallets.push({
                measurements: {
                  weight: {
                    unit: 'g',
                    value: item.weight,
                  },
                  cuboid: {
                    unit: 'mm',
                    l: item.length,
                    w: item.width,
                    h: item.height,
                  },
                },
                description: 'string',
                freight_class: 'string',
              });
            }
            return pallets;
          }),
        },
      },
    };

    strapi.log.info(`[Freight Calc] Rate data: ${inspect(rateData, false, null, true)}`);

    strapi.log.info('[Freight Calc] Sending rate request to freight API');
    const rateId = await client.post('/rate', rateData).then((res) => res.data.request_id as string);
    strapi.log.info(`[Freight Calc] Received rate id: ${rateId}`);

    strapi.log.info('[Freight Calc] Waiting for rates to be available');
    const rates: RateResponse['rates'] = await new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        try {
          const response = await client.get('/rate/' + rateId).then((res) => res.data as RateResponse);
          strapi.log.info(
            `[Freight Calc] Waiting for rates - status: ${inspect(response.status, false, null, true)}`
          );
          if (response.status.done) {
            clearInterval(timer);
            resolve(response.rates);
          }
        } catch (error) {
          clearInterval(timer);
          reject(error);
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(timer);
        reject(new Error('Timeout waiting for freight rates'));
      }, 30000);
    });

    strapi.log.info(`[Freight Calc] Received rates: ${inspect(rates, false, null, true)}`);

    return rates;
  } catch (error) {
    strapi.log.error(`[Freight Calc] Error calling freight API: ${error.message}`);
    return null;
  }
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
   *   originPostalCode?: string (optional, fallback if warehouse not found),
   *   freightServiceId?: string (optional, service ID for freight.com API comparison)
   * }
   * 
   * Returns both internal calculation and freight.com API rates for comparison
   */
  async calculate(ctx) {
    try {
      const { items, destinationPostalCode, warehouseId, originPostalCode, freightServiceId } = ctx.request.body;

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
            distance = await getGoogleDistance(warehouse.zipcode, destinationPostalCode);
            strapi.log.info(`[Freight Calc] Using specified warehouse ${warehouseId} with postal code ${warehousePostalCode}, distance: ${distance}km`);
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
              distance = await getGoogleDistance(originPostalCode, destinationPostalCode);
            } else {
              return ctx.badRequest('No warehouses found and originPostalCode not provided');
            }
          } else {
            const warehouseDistances = await Promise.all(
              warehouses.map(async (warehouse) => {
                try {
                  const dist = await getGoogleDistance(warehouse.zipcode, destinationPostalCode);
                  return { warehouse, distance: dist };
                } catch (err) {
                  strapi.log.warn(`[Freight Calc] Could not calculate distance for warehouse ${warehouse.id}: ${err.message}`);
                  return { warehouse, distance: Infinity };
                }
              })
            );

            const closest = warehouseDistances.reduce((prev, curr) =>
              curr.distance < prev.distance ? curr : prev
            );

            if (closest.distance === Infinity) {
              throw new Error('Could not calculate distance for any warehouse');
            }

            distance = closest.distance;
            warehousePostalCode = closest.warehouse.zipcode;
            selectedWarehouseId = String(closest.warehouse.id);
            strapi.log.info(
              `[Freight Calc] Found closest warehouse ${closest.warehouse.id} (${closest.warehouse.name}) with distance ${distance}km`
            );
          }
        } catch (err) {
          strapi.log.error(`[Freight Calc] Error finding warehouses: ${err.message}`);
          if (originPostalCode) {
            strapi.log.warn('[Freight Calc] Falling back to originPostalCode');
            warehousePostalCode = originPostalCode;
            try {
              distance = await getGoogleDistance(originPostalCode, destinationPostalCode);
            } catch (distErr) {
              strapi.log.error(`[Freight Calc] Error calculating fallback distance: ${distErr.message}`);
              return ctx.internalServerError('Failed to calculate shipping distance');
            }
          } else {
            return ctx.internalServerError('Failed to determine warehouse location');
          }
        }
      }

      if (!warehousePostalCode) {
        return ctx.badRequest('Could not determine origin postal code');
      }

      const freightCalcService = strapi.service('api::freight-calc.freight-calc');
      const internalResult = await freightCalcService.calculateRate({
        items,
        distance,
      });
      strapi.log.info(`[Freight Calc] Internal result: ${JSON.stringify(internalResult)}`);

      // Call freight API for comparison
      const freightApiRates = await getFreightComRates(
        items,
        warehousePostalCode,
        destinationPostalCode,
        freightServiceId
      );

      return {
        data: {
          internalCalculation: {
            ...internalResult,
            selectedWarehouseId,
            originPostalCode: warehousePostalCode,
          },
          freightApiRates: freightApiRates || null,
          comparison: freightApiRates && freightApiRates.length > 0
            ? {
                internalPrice: internalResult.lowestRate, // in cents
                freightApiLowestPrice: Math.min(
                  ...freightApiRates.map((rate) => parseFloat(rate.total.value) * 100) // Convert to cents
                ),
                freightApiRates: freightApiRates.map((rate) => ({
                  serviceId: rate.service_id,
                  serviceName: rate.service_name,
                  carrierName: rate.carrier_name,
                  totalPrice: parseFloat(rate.total.value), // in dollars
                  totalPriceCents: parseFloat(rate.total.value) * 100, // in cents
                  basePrice: parseFloat(rate.base.value), // in dollars
                  currency: rate.total.currency,
                  transitTimeDays: rate.transit_time_days,
                })),
              }
            : null,
        },
      };
    } catch (error) {
      strapi.log.error(`[Freight Calc Controller] Error: ${error.message}`);
      return ctx.internalServerError(`Rate calculation failed: ${error.message}`);
    }
  },
};

