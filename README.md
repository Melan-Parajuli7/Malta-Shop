# MaltaShop Place-Order Prototype

Minimal working demonstration of a **choreographed saga** for the “place an order” flow of MaltaShop Ltd.

## Architecture Overview

| Service              | Responsibility                          | Data Store     | Port  |
|----------------------|-----------------------------------------|----------------|-------|
| **order-service**    | Accepts orders, owns order state, starts the saga | Postgres       | 3000  |
| **inventory-service**| Reserves stock, publishes failure events | Postgres       | 3001  |
| **RabbitMQ**         | Message broker for `OrderPlaced` / `order.failed` | –              | 5672 / 15672 |
| **postgres-order**   | Database owned by order-service         | –              | –     |
| **postgres-inventory**| Database owned by inventory-service    | –              | –     |

**Flow:**
1. Client calls `POST /orders`
2. Order service creates order in `PENDING` state and publishes `OrderPlaced` event
3. Inventory service consumes the event and tries to reserve stock
4. On failure → publishes `order.failed`
5. Order service consumes the failure event and compensates (sets order to `CANCELLED`)
6. Both services share the same `correlationId` in logs

## Prerequisites

- Docker & Docker Compose
- (Optional) Node.js 20+ if you want to run services outside containers

## Quick Start

```bash
# Clone and start everything
git clone <your-repo-url>
cd maltashop
docker compose up --build