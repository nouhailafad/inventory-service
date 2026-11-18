# Inventory Service: API Contract

> Module: Microservices Architecture (MSOA), Master Data Science
> Service: **Inventory** | Responsible: **Fadli Nouhaila**

---

## 1. Overview

| | |
|---|---|
| **Responsibility** | Stock levels of the products: consult, check availability, **atomically** reserve and release stock |
| **Technology** | Node.js, Express 5, SQLite (`better-sqlite3`, WAL mode), `cors`, `dotenv` |
| **Base URL** | `http://localhost:8083` |
| **Database** | `db/inventory.db` (owned only by this service) |
| **Authentication** | None (endpoints are open, see section 6) |
| **Start** | `npm install`, `cp .env.example .env`, `npm start` |

### 1.1 Interactions with the other services

| Consumer | Provider | Endpoint | Information exchanged |
|---|---|---|---|
| Frontend | **Inventory** | `GET /api/inventory/{productId}` | Stock of a product (product page) |
| Frontend | **Inventory** | `POST /api/inventory/check` | Availability of the cart items before checkout |
| Orders | **Inventory** | `POST /api/inventory/reserve` | Reserve the stock when an order is created |
| Orders | **Inventory** | `POST /api/inventory/release` | Give the stock back when an order is cancelled (compensation) |
| **Inventory** | Catalog | `GET /products/{id}` | Check that a product exists (only its existence is used, see 5.1) |

### 1.2 General conventions

- Requests and responses use JSON (`Content-Type: application/json`), UTF-8.
- **Error body (all endpoints)**: `{ "message": "<description>" }`.
- Quantities and product ids are integers.

### 1.3 Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8083` | Listening port |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `ORDERS_SERVICE_URL` | `http://localhost:8084` | Second allowed CORS origin |
| `CATALOG_SERVICE_URL` | `http://localhost:8082` | Catalog base URL |
| `DB_FILE` | `db/inventory.db` | SQLite file |

---

## 2. Data objects

**Stock object**

```json
{ "productId": 1, "stock": 12 }
```

| Field | Type | Description |
|---|---|---|
| `productId` | integer | Product identifier (defined by Catalog) |
| `stock` | integer (>= 0) | Units currently available |

**Item object** (used in the request body of `check`, `reserve`, `release`)

```json
{ "productId": 1, "quantity": 2 }
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `productId` | integer | yes | > 0 |
| `quantity` | integer | yes | > 0 |

**Items request body**

```json
{ "items": [ { "productId": 1, "quantity": 2 }, { "productId": 3, "quantity": 1 } ] }
```

`items` is a required, non-empty array. Duplicate `productId`s in the same request are **merged** (quantities added).

**Error object**

```json
{ "message": "Insufficient stock for product 1." }
```

**Seed data**: product 1 → 12, 2 → 25, 3 → 15, 4 → 18, 5 → 8, 6 → 20.

---

## 3. Endpoints

### 3.1 `GET /health`

Returns the state of the service.

| | |
|---|---|
| **URL params** | None |
| **Data params** | None |
| **Headers** | None |

| Status | Body |
|---|---|
| **200 OK** | `{ "status": "UP", "service": "inventory" }` |

### 3.2 `GET /api/inventory/{productId}`

Returns the current stock of one product.

| | |
|---|---|
| **URL params** | Required: `productId` (integer) |
| **Data params** | None |
| **Headers** | None |

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "productId": 1, "stock": 12 }` | Known product |
| **400 Bad Request** | `{ "message": "Invalid productId." }` | `productId` is not an integer |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | The product does not exist in Catalog |
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog unreachable (only for a product not yet in the stock table) |

### 3.3 `POST /api/inventory/check`

Checks that **every** requested quantity is available. **Does not modify** the stock.

| | |
|---|---|
| **URL params** | None |
| **Data params** | Items request body (section 2) |
| **Headers** | `Content-Type: application/json` (required) |

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "available": true }` | All items are available |
| **200 OK** | `{ "available": false }` | At least one item has insufficient stock **or is an unknown product** (no 404 here) |
| **400 Bad Request** | `{ "message": "items must be a non-empty array." }` | `items` missing, empty or not an array |
| **400 Bad Request** | `{ "message": "Invalid productId." }` | Invalid product id |
| **400 Bad Request** | `{ "message": "Invalid quantity for product 1." }` | Quantity is not a positive integer |
| **400 Bad Request** | `{ "message": "Invalid JSON body." }` | Malformed JSON |
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog unreachable |

### 3.4 `POST /api/inventory/reserve`

Reserves (decrements) the stock for an order. **Atomic** (single SQL transaction): if one item cannot be reserved, **no stock is modified**.

| | |
|---|---|
| **URL params** | None |
| **Data params** | Items request body (section 2) |
| **Headers** | `Content-Type: application/json` (required) |

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "success": true }` | All items reserved, stock decremented |
| **400 Bad Request** | `{ "message": "items must be a non-empty array." }` / `"Invalid productId."` / `"Invalid quantity for product X."` / `"Invalid JSON body."` | Invalid body |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | A product does not exist |
| **409 Conflict** | `{ "message": "Insufficient stock for product 1." }` | Not enough stock (nothing is reserved) |
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog unreachable |

### 3.5 `POST /api/inventory/release`

Releases (increments) the stock. Used to cancel a reservation (compensation when an order is cancelled).

| | |
|---|---|
| **URL params** | None |
| **Data params** | Items request body (section 2) |
| **Headers** | `Content-Type: application/json` (required) |

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "success": true }` | Stock incremented |
| **400 Bad Request** | same messages as `reserve` | Invalid body |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | A product does not exist |
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog unreachable |

### 3.6 Errors common to all endpoints

| Status | Body | When |
|---|---|---|
| **403 Forbidden** | `{ "message": "Origin not allowed." }` | Browser request from a non-allowed CORS origin |
| **500 Internal Server Error** | `{ "message": "Internal server error." }` | Unexpected error |

---

## 4. Examples

```http
POST /api/inventory/reserve
Content-Type: application/json

{ "items": [ { "productId": 1, "quantity": 2 } ] }
```

Response `200 OK`: `{ "success": true }`

```http
POST /api/inventory/reserve
Content-Type: application/json

{ "items": [ { "productId": 1, "quantity": 9999 } ] }
```

Response `409 Conflict`: `{ "message": "Insufficient stock for product 1." }`

---

## 5. Dependencies and API evolution

### 5.1 Dependency on Catalog

Inventory calls `GET {CATALOG_SERVICE_URL}/products/{id}` only when a product is **not yet** in its `stock` table (lazy initialisation). If Catalog answers `404`, the product is unknown. If it answers `200`, a stock row with quantity `0` is created. If Catalog cannot be reached, Inventory answers `503`.

Inventory uses **only the HTTP status** of the Catalog response (`response.ok`, `404`). It **never reads the body**, and in particular never reads the `price` field.

### 5.2 Impact of the Catalog price change (LAB 3, Part III)

The change of `price` from a number to an object `{ "amount": ..., "currency": ... }` **does not affect Inventory**, because the service does not use the `price` field. **No change is required** in the code or in this contract.

The strategy agreed for the platform is backward-compatible: Catalog **keeps** `"price"` (number) and **adds** `"priceDetails": { "amount": 8499, "currency": "MAD" }`. Inventory's behaviour is the same with the old and the new Catalog response.

---

## 6. Notes

- The endpoints are **not authenticated**: they are called by Orders and by the frontend. Any client can reserve or release stock.
- The `stock` table has a `CHECK(quantity >= 0)` constraint, a second protection against overselling.
- Inventory is the only owner of `db/inventory.db`; other services must use the REST API.
