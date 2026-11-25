# Inventory Service: API Contract

> Module: Microservices Architecture (MSOA), Master Data Science  
> Service: **Inventory** | Responsible: **Fadli Nouhaila**

---

## 1. Overview

| | |
|---|---|
| **Responsibility** | Manage product stock levels: consult stock, check availability, atomically reserve and release stock. |
| **Technology** | Node.js, Express 5, SQLite (`better-sqlite3`, WAL mode), `cors`, `dotenv`, `@grpc/grpc-js`, `@grpc/proto-loader` |
| **REST Base URL** | `http://localhost:8083` |
| **gRPC Address** | `localhost:50051` |
| **Database** | `db/inventory.db` (owned only by this service) |
| **Authentication** | None (endpoints are open, see section 7) |
| **Start** | `npm install`, `cp .env.example .env`, `npm start` |

### 1.1 Interactions with the other services

| Consumer | Provider | Endpoint / Method | Information exchanged |
|---|---|---|---|
| Frontend | **Inventory** | `GET /api/inventory/{productId}` | Stock of a product (product page) |
| Frontend | **Inventory** | `POST /api/inventory/check` | Availability of cart items before checkout |
| Orders | **Inventory** | `POST /api/inventory/reserve` | Reserve stock when an order is created (REST) |
| Orders | **Inventory** | `POST /api/inventory/release` | Restore stock when an order is cancelled (REST compensation) |
| Orders | **Inventory** | `CheckAvailability` (gRPC) | Check availability of requested items |
| Orders | **Inventory** | `ReserveStock` (gRPC) | Reserve stock for an order |
| Orders | **Inventory** | `ReleaseStock` (gRPC) | Release reserved stock |
| **Inventory** | Catalog | `GET /products/{id}` | Check that a product exists (only its existence is used, see section 6.1) |

Inventory exposes both REST and gRPC interfaces to allow other services to access stock operations.

### 1.2 General conventions

- REST requests and responses use JSON (`Content-Type: application/json`), UTF-8.
- REST error body: `{ "message": "<description>" }`.
- Quantities and product IDs are positive integers.
- The gRPC interface uses Protocol Buffers (`proto3`), defined in `proto/inventory.proto`.

### 1.3 Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8083` | REST listening port |
| `GRPC_PORT` | `50051` | gRPC listening port |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `ORDERS_SERVICE_URL` | `http://localhost:8084` | Second allowed CORS origin |
| `CATALOG_SERVICE_URL` | `http://localhost:8082` | Catalog base URL |
| `DB_FILE` | `db/inventory.db` | SQLite database file |

---

## 2. Data objects

### 2.1 Stock object

```json
{
  "productId": 1,
  "stock": 12
}
```

| Field | Type | Description |
|---|---|---|
| `productId` | integer | Product identifier (defined by Catalog) |
| `stock` | integer (>= 0) | Units currently available |

### 2.2 Item object

Used in the request body of `check`, `reserve` and `release`.

```json
{
  "productId": 1,
  "quantity": 2
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `productId` | integer | Yes | > 0 |
| `quantity` | integer | Yes | > 0 |

### 2.3 Items request body

```json
{
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 3, "quantity": 1 }
  ]
}
```

`items` is a required, non-empty array. Duplicate `productId` values in the same request are merged (quantities are added).

### 2.4 Error object

```json
{
  "message": "Insufficient stock for product 1."
}
```

### 2.5 Seed data

| Product ID | Initial stock |
|---|---:|
| 1 | 12 |
| 2 | 25 |
| 3 | 15 |
| 4 | 18 |
| 5 | 8 |
| 6 | 20 |

---

## 3. REST API Endpoints

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
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog is unreachable (only for a product not yet in the stock table) |

### 3.3 `POST /api/inventory/check`

Checks that **every** requested quantity is available. **Does not modify** the stock.

| | |
|---|---|
| **URL params** | None |
| **Data params** | Items request body (section 2.3) |
| **Headers** | `Content-Type: application/json` (required) |

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "available": true }` | All items are available |
| **200 OK** | `{ "available": false }` | At least one item has insufficient stock or is an unknown product |
| **400 Bad Request** | `{ "message": "items must be a non-empty array." }` | `items` is missing, empty or not an array |
| **400 Bad Request** | `{ "message": "Invalid productId." }` | Invalid product ID |
| **400 Bad Request** | `{ "message": "Invalid quantity for product 1." }` | Quantity is not a positive integer |
| **400 Bad Request** | `{ "message": "Invalid JSON body." }` | Malformed JSON |
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog is unreachable |

### 3.4 `POST /api/inventory/reserve`

Reserves (decrements) the stock for an order. **Atomic operation** (single SQL transaction): if one item cannot be reserved, no stock is modified.

| | |
|---|---|
| **URL params** | None |
| **Data params** | Items request body (section 2.3) |
| **Headers** | `Content-Type: application/json` (required) |

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "success": true }` | All items reserved, stock decremented |
| **400 Bad Request** | `{ "message": "items must be a non-empty array." }` or a validation error | Invalid body |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | A product does not exist |
| **409 Conflict** | `{ "message": "Insufficient stock for product 1." }` | Not enough stock (nothing is reserved) |
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog is unreachable |

### 3.5 `POST /api/inventory/release`

Releases (increments) the stock. Used to cancel a reservation (compensation when an order is cancelled).

| | |
|---|---|
| **URL params** | None |
| **Data params** | Items request body (section 2.3) |
| **Headers** | `Content-Type: application/json` (required) |

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "success": true }` | Stock incremented |
| **400 Bad Request** | Same validation messages as `reserve` | Invalid body |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | A product does not exist |
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog is unreachable |

### 3.6 Errors common to REST endpoints

| Status | Body | When |
|---|---|---|
| **403 Forbidden** | `{ "message": "Origin not allowed." }` | Browser request from a non-allowed CORS origin |
| **500 Internal Server Error** | `{ "message": "Internal server error." }` | Unexpected error |

---

## 4. gRPC API

Inventory also exposes a gRPC interface using `@grpc/grpc-js` and `@grpc/proto-loader`.

| | |
|---|---|
| **Protocol** | gRPC |
| **Service name** | `inventory.InventoryService` |
| **Protocol definition** | `proto/inventory.proto` |
| **Default port** | `50051` |
| **Serialization** | Protocol Buffers (`proto3`) |

### 4.1 Available RPC methods

| Method | Request message | Response message | Description |
|---|---|---|---|
| `GetStock` | `StockRequest` | `StockResponse` | Returns the current stock of one product |
| `CheckAvailability` | `ItemsRequest` | `AvailabilityResponse` | Checks whether all requested quantities are available without modifying stock |
| `ReserveStock` | `ItemsRequest` | `OperationResponse` | Atomically reserves the requested stock |
| `ReleaseStock` | `ItemsRequest` | `OperationResponse` | Releases stock and restores the quantities |

### 4.2 Protocol Buffer messages

The gRPC messages are defined in `proto/inventory.proto`.

**StockRequest**

```protobuf
message StockRequest {
    int32 product_id = 1;
}
```

**StockResponse**

```protobuf
message StockResponse {
    int32 product_id = 1;
    int32 stock = 2;
}
```

**Item and ItemsRequest**

```protobuf
message Item {
    int32 product_id = 1;
    int32 quantity = 2;
}

message ItemsRequest {
    repeated Item items = 1;
}
```

**AvailabilityResponse**

```protobuf
message AvailabilityResponse {
    bool available = 1;
}
```

**OperationResponse**

```protobuf
message OperationResponse {
    bool success = 1;
}
```

### 4.3 Example gRPC request and response

**CheckAvailability**

Request:

```json
{
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
```

Response:

```json
{
  "available": true
}
```

**ReserveStock**

Request:

```json
{
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
```

Response:

```json
{
  "success": true
}
```

The gRPC server uses the same Inventory repository and business logic as the REST API. Both interfaces access the same Inventory database and maintain consistent stock information.

---

## 5. Examples

### 5.1 REST: Successful reservation

Request:

```http
POST /api/inventory/reserve
Content-Type: application/json

{
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
```

Response `200 OK`:

```json
{
  "success": true
}
```

### 5.2 REST: Insufficient stock

Request:

```http
POST /api/inventory/reserve
Content-Type: application/json

{
  "items": [
    { "productId": 1, "quantity": 9999 }
  ]
}
```

Response `409 Conflict`:

```json
{
  "message": "Insufficient stock for product 1."
}
```

---

## 6. Dependencies and API evolution

### 6.1 Dependency on Catalog

Inventory calls `GET {CATALOG_SERVICE_URL}/products/{id}` only when a product is not yet in its `stock` table (lazy initialization).

- If Catalog answers `404`, the product is unknown.
- If Catalog answers `200`, a stock row with quantity `0` is created.
- If Catalog cannot be reached, Inventory answers `503`.

Inventory uses only the HTTP status of the Catalog response (`response.ok`, `404`). It never reads the response body and, in particular, never reads the `price` field.

### 6.2 Impact of the Catalog price change (LAB 3, Part III)

The change of `price` from a number to an object `{ "amount": ..., "currency": ... }` does not affect Inventory, because the service does not use the `price` field.

The strategy agreed for the platform is backward-compatible: Catalog keeps `"price"` (number) and adds `"priceDetails": { "amount": 8499, "currency": "MAD" }`.

Inventory's behaviour is the same with the old and the new Catalog response.

---

## 7. Notes

- The REST endpoints are not authenticated. They are called by Orders and by the frontend. Any client able to reach the service can attempt to reserve or release stock.
- The gRPC interface is also exposed without authentication or TLS in the current configuration. It should be used only in a trusted development network.
- The `stock` table has a `CHECK(quantity >= 0)` constraint, providing a second protection against overselling.
- Inventory is the **only owner** of `db/inventory.db`.
- Other services must access inventory data through the REST API or the gRPC interface. They must never access the Inventory database directly.
- REST and gRPC use the same repository and database, ensuring consistent stock information.

---