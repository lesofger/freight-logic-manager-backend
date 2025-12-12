# Freight Rate API - Quick Reference

## 🚀 Quick Start

### Auto-select closest warehouse

```bash
curl -X POST http://localhost:1337/api/freight-rates/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "weight": 5000,
        "length": 300,
        "width": 200,
        "height": 150,
        "quantity": 2
      }
    ],
    "destinationPostalCode": "L0L 1P0"
  }'
```

### Or specify a warehouse

```bash
curl -X POST http://localhost:1337/api/freight-rates/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "weight": 5000,
        "length": 300,
        "width": 200,
        "height": 150,
        "quantity": 2
      }
    ],
    "destinationPostalCode": "L0L 1P0",
    "warehouseId": "warehouse-123"
  }'
```

## 📋 Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/freight-rates/calculate` | Calculate freight rate (auto-selects closest warehouse) |
| GET | `/api/freight-rates/history` | Get last 100 rate calculations |

## 📦 Request Format

```json
{
  "items": [
    {
      "weight": 5000,      // grams (required)
      "length": 300,       // mm (required)
      "width": 200,        // mm (required)
      "height": 150,       // mm (required)
      "quantity": 2,       // required
      "productId": "PROD-1" // optional
    }
  ],
  "destinationPostalCode": "L0L 1P0",      // required
  "warehouseId": "warehouse-123",          // optional
  "originPostalCode": "H2K 4P5"            // optional fallback
}
```

## ✅ Response Format

```json
{
  "data": {
    "id": "1",
    "freightRateId": "1",
    "selectedWarehouseId": "warehouse-001",
    "originPostalCode": "H2K 4P5",
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
Client Request with Destination Postal Code
           ↓
   Check if warehouseId provided?
      ↙           ↘
    YES            NO
     ↓              ↓
Use it      Fetch all warehouses
     ↓              ↓
     └──→ Calculate distance to each
          ↓
        Select Closest Warehouse
             ↓
    [Calculate Density]
             ↓
    [Map to Freight Class]
             ↓
   [Lookup Distance Class]
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
async function getShippingCost(cartItems, destinationPostal, warehouseId) {
  const body = {
    items: cartItems,
    destinationPostalCode: destinationPostal,
  };
  
  if (warehouseId) body.warehouseId = warehouseId;
  
  const response = await fetch('http://localhost:1337/api/freight-rates/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  const { data } = await response.json();
  return {
    cost: (data.lowestRate / 100).toFixed(2),
    warehouse: data.selectedWarehouseId,
    distance: data.distance,
  };
}

// Usage - Auto-select warehouse
const result = await getShippingCost(
  [{ weight: 5000, length: 300, width: 200, height: 150, quantity: 2 }],
  'L0L 1P0'
);
console.log(`Shipping: $${result.cost} from warehouse ${result.warehouse}`);

// Usage - Specific warehouse
const result2 = await getShippingCost(
  [{ weight: 5000, length: 300, width: 200, height: 150, quantity: 2 }],
  'L0L 1P0',
  'warehouse-001'
);
console.log(`Shipping: $${result2.cost}`);
```

## ⚠️ Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Items array is required" | Missing items | Add items array with at least one item |
| "Destination postal code is required" | Missing destination | Add destinationPostalCode |
| "Warehouse X not found" | Invalid warehouseId | Use valid warehouse ID or omit to auto-select |
| "No warehouses found" | No warehouses in database | Add warehouses or provide originPostalCode fallback |
| "No freight class found" | Density out of range | Check Freight Classes table |
| "No rates found" | Missing price entry | Check Price Table has entries |

## 🚀 Key Features

✅ **Auto-selects closest warehouse** - No need to specify origin postal code  
✅ **Optional warehouse override** - Specify exact warehouse if needed  
✅ **Integrated density calculation** - Automatically maps to freight classes  
✅ **Distance-based pricing** - Rates vary by destination distance  
✅ **Rate history tracking** - All calculations stored in database  

## 📚 Full Documentation

See [src/api/freight-rate/README.md](src/api/freight-rate/README.md) for complete API documentation.
