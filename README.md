# MaltaShop Place-Order Prototype

Minimal working demonstration of a **choreographed saga** for the “place an order” flow of MaltaShop Ltd.

This prototype shows how two microservices communicate asynchronously using **RabbitMQ**, each owning its own database, while maintaining consistency through a choreographed saga with compensating actions.

---

## Architecture Overview

| Service                | Responsibility                                      | Data Store | Port         |
|------------------------|-----------------------------------------------------|------------|--------------|
| **order-service**      | Accepts orders, owns order state, starts the saga   | Postgres   | 3000         |
| **inventory-service**  | Reserves stock, publishes failure events            | Postgres   | 3001         |
| **RabbitMQ**           | Message broker for `OrderPlaced` / `order.failed`   | –          | 5672 / 15672 |
| **postgres-order**     | Database owned by order-service                     | –          | –            |
| **postgres-inventory** | Database owned by inventory-service                 | –          | –            |

### Flow

1. Client calls `POST /orders`
2. Order service creates the order in `PENDING` state and publishes an `OrderPlaced` event
3. Inventory service consumes the event and tries to reserve stock
4. On success → stock is reserved
5. On failure → publishes `order.failed`
6. Order service consumes the failure event and compensates by setting the order to `CANCELLED`
7. Both services share the same `correlationId` in structured logs

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose)
- Git
- (Optional) Node.js 20+ if you want to run the services outside Docker

---

## How to Run the Project (Step-by-Step)

### 1. Clone the repository

```bash
git clone https://github.com/Melan-Parajuli7/Malta-Shop.git
cd Malta-Shop
