/**
 * freight-rate service
 */

import { factories } from '@strapi/strapi';

interface CartItem {
  id: string;
  productId: string;
  weight: number; // grams
  length: number; // mm
  width: number; // mm
  height: number; // mm
  quantity: number;
}

interface RateCalculationInput {
  items: CartItem[];
  originPostalCode: string;
  destinationPostalCode: string;
  warehouseId?: string;
}

interface RateCalculationResult {
  density: number;
  freightClass: string | number;
  applicableRates: any[];
  lowestRate: number;
  distance: number;
}

export default factories.createCoreService('api::freight-rate.freight-rate', {
  /**
   * Calculate density of items (weight per volume)
   * Density = weight(lbs) / volume(cubic inches)
   */
  async calculateDensity(items: CartItem[]): Promise<number> {
    let totalWeightLbs = 0;
    let totalVolumeCubicInches = 0;

    for (const item of items) {
      // Convert grams to pounds (1 pound = 453.592 grams)
      const weightLbs = (item.weight * item.quantity) / 453.592;
      totalWeightLbs += weightLbs;

      // Convert mm³ to in³ (1 inch = 25.4mm)
      // Volume in mm³ = length * width * height
      const volumeMm3 = item.length * item.width * item.height * item.quantity;
      // Convert to cubic inches: 1 in³ = 16387.064 mm³
      const volumeCubicInches = volumeMm3 / 16387.064;
      totalVolumeCubicInches += volumeCubicInches;
    }

    if (totalVolumeCubicInches === 0) {
      throw new Error('Invalid item dimensions: volume cannot be zero');
    }

    const density = totalWeightLbs / totalVolumeCubicInches;
    return Math.round(density * 100) / 100;
  },

  /**
   * Map density to freight class
   */
  async mapDensityToFreightClass(
    density: number
  ): Promise<{ freightClass: string | number; record: any }> {
    const freightClasses = await strapi
      .service('api::freight-classe.freight-classe')
      .find({ filters: { minDensity: { $lte: density }, maxDensity: { $gte: density } } });

    if (freightClasses.results.length === 0) {
      throw new Error(`No freight class found for density ${density}`);
    }

    const freightClass = freightClasses.results[0];
    return {
      freightClass: freightClass.freightClass,
      record: freightClass,
    };
  },

  /**
   * Estimate distance between two postal codes
   * This is a simplified estimation - in production you'd use a real API
   */
  async estimateDistance(
    originPostalCode: string,
    destinationPostalCode: string
  ): Promise<number> {
    // Simple hash-based estimation for demo purposes
    // In production, use postal code database or geolocation API
    const combinedCode = `${originPostalCode}${destinationPostalCode}`;
    const hash = combinedCode.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);

    // Estimate between 100-5000 km based on hash
    const distance = ((hash % 4900) + 100);
    return distance;
  },

  /**
   * Get applicable rates from price table
   */
  async getApplicableRates(
    freightClassId: string,
    distance: number
  ): Promise<any[]> {
    const rates = await strapi
      .service('api::price-table.price-table')
      .find({
        filters: {
          freightClass: freightClassId,
          distanceMin: { $lte: distance },
          distanceMax: { $gte: distance },
        },
      });

    return rates.results || [];
  },

  /**
   * Calculate freight rate for given cart/shipment
   */
  async calculateRate(input: RateCalculationInput): Promise<RateCalculationResult> {
    try {
      // Validate input
      if (!input.items || input.items.length === 0) {
        throw new Error('No items provided for rate calculation');
      }

      if (!input.originPostalCode || !input.destinationPostalCode) {
        throw new Error('Origin and destination postal codes are required');
      }

      // Step 1: Calculate density
      const density = await this.calculateDensity(input.items);
      strapi.log.info(`[Freight Rate] Calculated density: ${density}`);

      // Step 2: Map density to freight class
      const { freightClass, record: freightClassRecord } = await this.mapDensityToFreightClass(density);
      strapi.log.info(`[Freight Rate] Mapped to freight class: ${freightClass}`);

      // Step 3: Estimate distance
      const distance = await this.estimateDistance(
        input.originPostalCode,
        input.destinationPostalCode
      );
      strapi.log.info(`[Freight Rate] Estimated distance: ${distance} km`);

      // Step 4: Get applicable rates
      const applicableRates = await this.getApplicableRates(freightClassRecord.id, distance);
      strapi.log.info(`[Freight Rate] Found ${applicableRates.length} applicable rates`);

      if (applicableRates.length === 0) {
        throw new Error(
          `No rates found for freight class ${freightClass} and distance ${distance}km`
        );
      }

      // Step 5: Get lowest rate (first result is usually lowest)
      const lowestRate = applicableRates[0];
      const basePrice = Number(lowestRate.pricePer100lbs);

      // Calculate total price based on weight
      let totalWeightLbs = 0;
      for (const item of input.items) {
        const weightLbs = (item.weight * item.quantity) / 453.592;
        totalWeightLbs += weightLbs;
      }

      // Price per 100 lbs
      const price100lbs = basePrice;
      const units100lbs = Math.ceil(totalWeightLbs / 100);
      const totalPrice = price100lbs * units100lbs;

      // Add 15% markup (as per the freightcom code)
      const finalPrice = Math.floor(totalPrice * 1.15);

      strapi.log.info(`[Freight Rate] Final calculated price: ${finalPrice} cents`);

      return {
        density,
        freightClass,
        applicableRates: applicableRates.map((rate) => ({
          id: rate.id,
          pricePer100lbs: rate.pricePer100lbs,
        })),
        lowestRate: finalPrice,
        distance,
      };
    } catch (error) {
      strapi.log.error(`[Freight Rate] Error calculating rate: ${error.message}`);
      throw error;
    }
  },
});
