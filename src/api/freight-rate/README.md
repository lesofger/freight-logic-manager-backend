# Freight Rate API Documentation

## Overview

The Freight Rate API calculates shipping costs based on item dimensions, weight, and postal codes. It integrates with the **Freight Classes** and **Price Tables** to provide accurate LTL (Less Than Truckload) freight pricing.

---

## Base URL

```
http://localhost:1337/api
```

---

## Endpoints

### 1. Calculate Freight Rate

**POST** `/freight-rates/calculate`

Calculates the freight rate for a shipment based on items and postal codes.

#### Request Body

```json
{
  "items": [
    {
      "productId": "string (required)",
      "weight": "number (required) - in grams",
      "length": "number (required) - in millimeters",
      "width": "number (required) - in millimeters",
      "height": "number (required) - in millimeters",
      "quantity": "number (required)"
    }
  ],
  "originPostalCode": "string (required)",
  "destinationPostalCode": "string (required)",
  "warehouseId": "string (optional) - will override originPostalCode with warehouse's zipcode"
}
```

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | Array | Yes | Array of line items with dimensions |
| `items[].productId` | string | Yes | Product identifier |
| `items[].weight` | number | Yes | Weight in **grams** (g) |
| `items[].length` | number | Yes | Length in **millimeters** (mm) |
| `items[].width` | number | Yes | Width in **millimeters** (mm) |
| `items[].height` | number | Yes | Height in **millimeters** (mm) |
| `items[].quantity` | number | Yes | Number of units |
| `originPostalCode` | string | Yes | Departure postal code (CA format) |
| `destinationPostalCode` | string | Yes | Destination postal code (CA format) |
| `warehouseId` | string | No | Warehouse ID to use postal code instead of originPostalCode |

#### Success Response (200 OK)

```json
{
  "data": {
    "id": "1",
    "freightRateId": "1",
    "density": 12.45,
    "freightClass": "85",
    "applicableRates": [
      {
        "id": "rate-001",
        "pricePer100lbs": 45.00
      }
    ],
    "lowestRate": 5520,
    "distance": 875
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Rate record ID in database |
| `freightRateId` | string | Same as `id` |
| `density` | number | Calculated density (lbs/in³) |
| `freightClass` | string/number | Freight class determined by density |
| `applicableRates` | Array | List of available rates for this freight class & distance |
| `lowestRate` | number | Final calculated price in **cents** (includes 15% markup) |
| `distance` | number | Estimated distance in km between postal codes |

#### Example Request (cURL)

```bash
curl -X POST http://localhost:1337/api/freight-rates/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "productId": "PROD-12345",
        "weight": 5000,
        "length": 300,
        "width": 200,
        "height": 150,
        "quantity": 2
      },
      {
        "productId": "PROD-67890",
        "weight": 3000,
        "length": 250,
        "width": 150,
        "height": 100,
        "quantity": 1
      }
    ],
    "originPostalCode": "H2K 4P5",
    "destinationPostalCode": "L0L 1P0"
  }'
```

#### Example Request (JavaScript/Fetch)

```javascript
const calculateFreightRate = async (items, originPostal, destinationPostal) => {
  const response = await fetch('http://localhost:1337/api/freight-rates/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: items.map(item => ({
        productId: item.id,
        weight: item.weight,      // in grams
        length: item.length,       // in mm
        width: item.width,         // in mm
        height: item.height,       // in mm
        quantity: item.quantity,
      })),
      originPostalCode: originPostal,
      destinationPostalCode: destinationPostal,
    }),
  });

  if (!response.ok) {
    throw new Error(`Rate calculation failed: ${response.statusText}`);
  }

  return response.json();
};

// Usage
try {
  const rate = await calculateFreightRate(
    [
      { id: 'PROD-1', weight: 5000, length: 300, width: 200, height: 150, quantity: 2 },
    ],
    'H2K 4P5',
    'L0L 1P0'
  );
  console.log('Freight Rate:', rate.data.lowestRate / 100, 'CAD');
} catch (error) {
  console.error('Error:', error.message);
}
```

#### Error Responses

**400 Bad Request** - Missing or invalid parameters

```json
{
  "error": "Items array is required and must not be empty"
}
```

**500 Internal Server Error** - Calculation failed

```json
{
  "error": "Rate calculation failed: No freight class found for density 5.2"
}
```

---

### 2. Get Rate Calculation History

**GET** `/freight-rates/history`

Retrieves the last 100 rate calculations.

#### Response (200 OK)

```json
{
  "data": [
    {
      "id": "1",
      "originPostalCode": "H2K 4P5",
      "destinationPostalCode": "L0L 1P0",
      "totalWeight": 13000,
      "totalVolume": 2250000,
      "density": 12.45,
      "freightClass": "85",
      "items": [...],
      "applicableRates": [...],
      "selectedRate": 5520,
      "distance": 875,
      "status": "calculated",
      "createdAt": "2025-12-11T14:30:00.000Z"
    }
  ]
}
```

#### Example Request (JavaScript)

```javascript
const getHistoricalRates = async () => {
  const response = await fetch('http://localhost:1337/api/freight-rates/history');
  const data = await response.json();
  return data.data;
};
```

---

## Integration Guide

### Frontend Implementation Example

```typescript
// services/freightService.ts

interface CartItem {
  id: string;
  weight: number;      // grams
  length: number;      // mm
  width: number;       // mm
  height: number;      // mm
  quantity: number;
}

interface FreightRateResult {
  lowestRate: number;  // cents
  density: number;
  freightClass: string | number;
  distance: number;
}

export async function calculateShippingCost(
  items: CartItem[],
  originPostal: string,
  destPostal: string
): Promise<FreightRateResult> {
  const response = await fetch(
    `${process.env.REACT_APP_API_URL}/freight-rates/calculate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        originPostalCode: originPostal,
        destinationPostalCode: destPostal,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shipping calculation failed: ${error}`);
  }

  const result = await response.json();
  return result.data;
}

// React Component Example
import React, { useState } from 'react';

export function ShippingCalculator() {
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);

    try {
      const cartItems = [
        {
          id: 'item-1',
          weight: 5000,    // 5kg in grams
          length: 300,     // 30cm in mm
          width: 200,      // 20cm in mm
          height: 150,     // 15cm in mm
          quantity: 2,
        },
      ];

      const result = await calculateShippingCost(
        cartItems,
        'H2K 4P5',    // Origin postal
        'L0L 1P0'     // Destination postal
      );

      // Convert cents to dollars
      setShippingCost(result.lowestRate / 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleCalculate} disabled={loading}>
        {loading ? 'Calculating...' : 'Calculate Shipping'}
      </button>
      {shippingCost !== null && (
        <p>Shipping Cost: ${shippingCost.toFixed(2)}</p>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

---

## Unit Conversions Reference

When preparing data for the API, use these conversions:

| Measurement | API Unit | Conversion |
|------------|----------|-----------|
| Weight | Grams (g) | 1 kg = 1000 g, 1 lb = 453.592 g |
| Length | Millimeters (mm) | 1 cm = 10 mm, 1 inch = 25.4 mm |
| Width | Millimeters (mm) | 1 cm = 10 mm, 1 inch = 25.4 mm |
| Height | Millimeters (mm) | 1 cm = 10 mm, 1 inch = 25.4 mm |
| Price | Cents | $1.00 = 100 cents |
| Distance | Kilometers (km) | 1 mile = 1.609 km |

---

## Business Logic

### Density Calculation

```
Density = Total Weight (lbs) / Total Volume (cubic inches)

Where:
- Weight in lbs = weight (g) / 453.592
- Volume in cubic inches = (length × width × height × quantity) / 16387.064
```

### Freight Class Mapping

The calculated density is matched against the **Freight Classes** table to determine the applicable freight class. Classes are defined by density ranges:

```
Min Density ≤ Calculated Density ≤ Max Density
```

### Rate Lookup

Rates are retrieved from the **Price Table** based on:
1. Freight class from density mapping
2. Distance between origin and destination postal codes

### Final Price Calculation

```
Base Price = Price Per 100 lbs from Price Table
Units of 100 lbs = CEIL(Total Weight in lbs / 100)
Subtotal = Base Price × Units of 100 lbs
Final Price = FLOOR(Subtotal × 1.15)  // 15% markup
```

---

## Error Handling

### Common Error Codes

| Error | Cause | Solution |
|-------|-------|----------|
| "Items array is required" | Missing or empty items | Ensure items array is provided with at least one item |
| "Each item must have weight, length, width, height, and quantity" | Missing required item fields | Verify all item properties are present |
| "Origin and destination postal codes are required" | Missing postal codes | Provide both originPostalCode and destinationPostalCode |
| "Invalid item dimensions: volume cannot be zero" | Item has zero volume | Check length, width, height are positive numbers |
| "No freight class found for density X" | Density doesn't match any class | Verify freight class ranges in Freight Classes table |
| "No rates found for freight class X and distance Y" | No matching rate | Check Price Table has rates for this class and distance |

---

## Testing

### Sample Test Data

```json
{
  "items": [
    {
      "productId": "TEST-001",
      "weight": 5000,
      "length": 300,
      "width": 200,
      "height": 150,
      "quantity": 1
    }
  ],
  "originPostalCode": "H2K 4P5",
  "destinationPostalCode": "L0L 1P0"
}
```

### Expected Response Variations

The response will vary based on:
- Freight Classes defined in database
- Price Table entries
- Distance estimation algorithm
- Current date (affects valid_until dates)

---

## Rate Limiting & Performance

Currently, there are no rate limits on the API. However, be mindful that:

- Each calculation queries the database
- Complex calculations with many items may take longer
- Consider caching results for identical shipments

---

## Support

For issues or questions:
1. Check error messages in the response
2. Verify all required fields are provided
3. Ensure postal codes are valid Canadian postal codes
4. Check that Freight Classes and Price Tables have appropriate entries
5. Review logs: `tail -f pm2.log` or Strapi admin panel

---

## Changelog

### Version 1.0.0 (2025-12-11)
- Initial release
- Calculate freight rates endpoint
- Rate history endpoint
- Integration with Freight Classes and Price Tables
