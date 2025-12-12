# Freight Rate API - Quick Reference

## 🚀 Quick Start

### Calculate Shipping Cost

```bash
curl -X POST http://localhost:1337/api/freight-rates/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "productId": "PROD-123",
        "weight": 5000,
        "length": 300,
        "width": 200,
        "height": 150,
        "quantity": 2
      }
    ],
    "originPostalCode": "H2K 4P5",
    "destinationPostalCode": "L0L 1P0"
  }'
```

## 📋 Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/freight-rates/calculate` | Calculate freight rate for items |
| GET | `/api/freight-rates/history` | Get last 100 rate calculations |

## 📦 Request Format

```json
{
  "items": [
    {
      "productId": "string",
      "weight": 5000,      // grams
      "length": 300,       // mm
      "width": 200,        // mm
      "height": 150,       // mm
      "quantity": 2
    }
  ],
  "originPostalCode": "H2K 4P5",
  "destinationPostalCode": "L0L 1P0",
  "warehouseId": "optional-warehouse-id"
}
```

## ✅ Response Format

```json
{
  "data": {
    "id": "1",
    "freightRateId": "1",
    "density": 12.45,
    "freightClass": "85",
    "lowestRate": 5520,     // in cents ($55.20)
    "distance": 875,        // km
    "applicableRates": [...]
  }
}
```

## 🔄 Workflow

```
Product Dimensions
      ↓
  [Calculate Density]
      ↓
  [Map to Freight Class]
      ↓
  [Estimate Distance]
      ↓
  [Lookup Price Table]
      ↓
  [Apply 15% Markup]
      ↓
  [Return Final Price]
```

## 💡 Unit Reference

- **Weight**: Grams (g) → `5000g = 5kg = 11.02 lbs`
- **Length**: Millimeters (mm) → `300mm = 30cm = 11.8 inches`
- **Price**: Cents → `5520 cents = $55.20 CAD`
- **Distance**: Kilometers (km) → `875km = 543 miles`

## 🛠️ JavaScript Example

```javascript
async function getShippingCost(cartItems, fromPostal, toPostal) {
  const response = await fetch('http://localhost:1337/api/freight-rates/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: cartItems,
      originPostalCode: fromPostal,
      destinationPostalCode: toPostal,
    }),
  });
  
  const { data } = await response.json();
  return (data.lowestRate / 100).toFixed(2); // Convert cents to dollars
}

// Usage
const cost = await getShippingCost(
  [{ productId: 'P1', weight: 5000, length: 300, width: 200, height: 150, quantity: 2 }],
  'H2K 4P5',
  'L0L 1P0'
);
console.log(`Shipping: $${cost}`);
```

## ⚠️ Common Errors

| Error | Fix |
|-------|-----|
| "Items array is required" | Add items array with at least one item |
| "Each item must have weight..." | Include weight, length, width, height, quantity |
| "postal codes are required" | Add originPostalCode and destinationPostalCode |
| "No freight class found" | Check Freight Classes table has matching density ranges |
| "No rates found" | Check Price Table has entries for the freight class |

## 📚 Full Documentation

See [src/api/freight-rate/README.md](src/api/freight-rate/README.md) for complete API documentation.
