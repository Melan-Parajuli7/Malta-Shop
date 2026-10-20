# MaltaShop Prototype: "Place an Order" Flow

A small microservices prototype for the **MaltaShop** case study (Unit 5: Service-Oriented Architecture and Microservices Fundamentals).
It shows how an order is placed across two independent services **without a shared database or a distributed transaction**, using a message broker and a saga with a compensating action.

## What the system is

| Service | Responsibility | Own data store |
|---|---|---|
| **Order service** (`order-service`, port 3001) | Accepts orders over REST, publishes `OrderPlaced`, confirms or cancels the order when Inventory answers | PostgreSQL database `orders` |
| **Inventory service** (`inventory-service`, port 3002) | Reserves stock when it receives `OrderPlaced`, answers `StockReserved` or `StockRejected` | PostgreSQL database `inventory` |
| **RabbitMQ** | Message broker between the two services (topic exchange `maltashop.events`) | n/a |

### The flow (choreography saga)

```mermaid
sequenceDiagram
    participant C as Client
    participant O as Order service
    participant B as RabbitMQ
    participant I as Inventory service

    C->>O: POST /orders
    O->>O: save order as PENDING
    O->>B: OrderPlaced
    O-->>C: 202 Accepted (orderId)
    B->>I: OrderPlaced
    alt enough stock
        I->>I: reserve stock (one local transaction)
        I->>B: StockReserved
        B->>O: StockReserved
        O->>O: order CONFIRMED
    else not enough stock
        I->>B: StockRejected
        B->>O: StockRejected
        O->>O: order CANCELLED (compensating action)
    end
```

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- *Optional, to run tests or the services without Docker:* Node.js 20 or newer

## Run it (one command)

```bash
docker compose up --build
```

Wait until the output shows both services listening. Then:

| URL | What |
|---|---|
| http://localhost:3001/health | Order service health |
| http://localhost:3002/health | Inventory service health |
| http://localhost:3002/stock | Current stock |
| http://localhost:15672 | RabbitMQ management UI (user `maltashop`, password `maltashop`) |

Stop everything and delete the data: `docker compose down -v`

## Try it

**Windows PowerShell**

```powershell
.\scripts\smoke-test.ps1
```

**Linux, macOS or Git Bash**

```bash
bash scripts/smoke-test.sh
```

The script places an order, checks it becomes `CONFIRMED`, repeats it with the same `Idempotency-Key`, places an order for too much stock and checks it becomes `CANCELLED`, and checks that the correlation ID appears in the logs of both services.

**Manually with curl**

```bash
# place an order (202 Accepted, status PENDING)
curl -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: demo-correlation-001" \
  -H "Idempotency-Key: demo-key-001" \
  -d '{"customerId":"customer-1","items":[{"sku":"KETTLE-003","quantity":1}]}'

# look at it a moment later (status CONFIRMED)
curl http://localhost:3001/orders/<orderId>

# see the same correlation ID in both services
docker compose logs order-service inventory-service | grep demo-correlation-001
```

Seed stock: `LAPTOP-001` (10), `PHONE-002` (25), `KETTLE-003` (5). Order more than is available to see the `CANCELLED` path.

## API

| Method | Path | Service | Description |
|---|---|---|---|
| POST | `/orders` | Order | Place an order. Body: `{"customerId": "...", "items": [{"sku": "...", "quantity": 1}]}`. Returns `202` with the order (status `PENDING`), or `200` with the existing order when the `Idempotency-Key` was already used, or `400` for invalid input. |
| GET | `/orders/{id}` | Order | Order status: `PENDING`, `CONFIRMED` or `CANCELLED` (with `cancelReason`). |
| GET | `/health` | Both | `200` only when the database and the broker connection both work, otherwise `503`. |
| GET | `/stock` | Inventory | Current stock levels. |

Headers: `X-Correlation-ID` (optional, generated if missing and always returned) and `Idempotency-Key` (optional, on `POST /orders`).

## Events

| Event | Routing key | Published by | Consumed by | Schema |
|---|---|---|---|---|
| `OrderPlaced` | `order.placed` | Order | Inventory | [`contracts/order-placed.schema.json`](contracts/order-placed.schema.json) |
| `StockReserved` | `stock.reserved` | Inventory | Order | [`contracts/stock-reserved.schema.json`](contracts/stock-reserved.schema.json) |
| `StockRejected` | `stock.rejected` | Inventory | Order | [`contracts/stock-rejected.schema.json`](contracts/stock-rejected.schema.json) |

## Environment variables

### Order service

| Variable | Default in compose | Description |
|---|---|---|
| `SERVICE_NAME` | `order-service` | Name written into every log line |
| `PORT` | `3001` | HTTP port |
| `DATABASE_URL` | `postgres://maltashop:maltashop@order-db:5432/orders` | Connection string of the Order database |
| `RABBITMQ_URL` | `amqp://maltashop:maltashop@rabbitmq:5672` | Connection string of the broker |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

### Inventory service

| Variable | Default in compose | Description |
|---|---|---|
| `SERVICE_NAME` | `inventory-service` | Name written into every log line |
| `PORT` | `3002` | HTTP port |
| `DATABASE_URL` | `postgres://maltashop:maltashop@inventory-db:5432/inventory` | Connection string of the Inventory database |
| `RABBITMQ_URL` | `amqp://maltashop:maltashop@rabbitmq:5672` | Connection string of the broker |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

### Docker Compose (optional `.env` file, see [`.env.example`](.env.example))

`RABBITMQ_USER`, `RABBITMQ_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `IMAGE_TAG`, `LOG_LEVEL`. The defaults work without any `.env` file. Change the passwords before using anything like this outside a laptop.

## Tests

```bash
cd order-service     && npm ci && npm test   # unit tests: validation, saga consumer
cd inventory-service && npm ci && npm test   # unit tests: reservation rules, consumer
cd tests             && npm ci && npm test   # contract tests between the two services
```

The **contract tests** check that every event the producer builds matches its JSON schema and that the consuming service can read it, without starting any service or broker.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and on pull requests:

1. **unit-tests**: both services, in parallel
2. **contract-tests**: Order and Inventory agree on the event shapes
3. **build-and-integration-test**: builds the Docker images once (tagged with the commit SHA), starts the whole system with `docker compose up --wait` from those same images, and runs `scripts/smoke-test.sh`

## How the design goals are met

| Goal | How |
|---|---|
| Each service owns its data | Separate PostgreSQL databases; the services only share events |
| Consistency without one big transaction | Saga: Order saves `PENDING`, Inventory reserves stock in one local transaction, the result event confirms or cancels the order |
| Compensating action | `StockRejected` makes the Order service cancel the order |
| Idempotent operations | `Idempotency-Key` on `POST /orders`; `processed_messages` tables; one reservation per order; a replayed `OrderPlaced` re-sends the stored outcome and never reserves stock twice |
| No lost messages | Durable queues, persistent messages, publisher confirms, acknowledgement only after processing |
| Poison messages | A message that fails twice goes to the dead-letter queue `maltashop.dead-letters.queue` |
| Traceability | One correlation ID travels HTTP header → logs → message → other service's logs |
| Structured logs | JSON lines with `time`, `level`, `service`, `correlationId`, `message` |
| Resilience at startup | Both services retry the database and broker connections; compose waits for health checks |
| Container best practice | Multi-stage build, non-root `node` user, `HEALTHCHECK`, configuration only through environment variables |

## Known limitations (what to change before production)

- **No transactional outbox.** The Order service saves the order and then publishes the event. If the process crashes between the two, the order stays `PENDING`. A production system would write the event to an outbox table in the same transaction and publish it from there.
- **No Payment service.** Payment is described in the report; the prototype implements the Order and Inventory part of the saga.
- **No authentication or API gateway.** Customer and partner requests are not authenticated here.
- **No timeout for `PENDING` orders** if the Inventory service never answers.
- **Single RabbitMQ node and single database instances,** with default passwords.
- **Metrics and tracing are not included;** only structured logs.

## Project structure

```
maltashop-prototype/
├── docker-compose.yml
├── .env.example
├── .github/workflows/ci.yml        CI pipeline
├── contracts/                      JSON schemas of the three events
├── tests/                          contract tests
├── scripts/                        smoke-test.sh / smoke-test.ps1
├── docs/screenshots/               evidence for the report
├── order-service/
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.js               HTTP API, startup, shutdown
│   │   ├── db.js                   Order database
│   │   ├── broker.js               RabbitMQ helper (retry, confirms, ack, dead-letter)
│   │   ├── events.js               event builders and parsers
│   │   ├── sagaHandlers.js         reacts to StockReserved / StockRejected
│   │   ├── validation.js           request validation
│   │   ├── correlation.js          correlation ID middleware
│   │   └── logger.js               structured logging
│   └── tests/
└── inventory-service/
    ├── Dockerfile
    ├── src/
    │   ├── server.js               HTTP API, startup, shutdown
    │   ├── db.js                   Inventory database, stock reservation transaction
    │   ├── broker.js
    │   ├── events.js
    │   ├── handlers.js             reacts to OrderPlaced
    │   ├── reservation.js          pure stock rule
    │   ├── correlation.js
    │   └── logger.js
    └── tests/
```