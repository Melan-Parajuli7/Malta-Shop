# MaltaShop Place-Order Prototype

Minimal working demonstration of a choreographed saga for the “place an order” flow.

## What it is
- **order-service** – accepts `POST /orders`, writes its own Postgres table, publishes `OrderPlaced`.
- **inventory-service** – consumes `OrderPlaced`, attempts to reserve stock in its own Postgres table; on failure publishes `order.failed`.
- Order service compensates by marking the order `CANCELLED`.
- Both services log with a shared correlation ID (header `x-correlation-id` or auto-generated UUID).

## Prerequisites
- Docker & Docker Compose
- (Optional) Node 20+ if you want to run services outside containers

## Quick start
```bash
docker compose up --build   