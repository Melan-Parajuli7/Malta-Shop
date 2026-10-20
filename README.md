# MaltaShop Prototype: "Place an Order" Flow

A small microservices prototype for the MaltaShop case study (Unit 5: Service-Oriented Architecture and Microservices Fundamentals). It shows an order being placed across two independent services **without a shared database or a distributed transaction**, using a message broker and a choreography saga with a compensating action.

This prototype shows how two microservices communicate asynchronously using **RabbitMQ**, each owning its own database, while maintaining consistency through a choreographed saga with compensating actions.

---

## Architecture Overview

| Service                | Responsibility                                           | Data Store | Port          |
| ---------------------- | -------------------------------------------------------- | ---------- | ------------- |
| **order-service**      | Accepts orders, owns order state, starts the saga        | Postgres   | 3000          |
| **inventory-service**  | Reserves stock, publishes failure events                 | Postgres   | 3001          |
| **RabbitMQ**           | Message broker for `OrderPlaced` / `order.failed`        | –          | 5672 / 15672  |
| **postgres-order**     | Database owned by order-service                          | –          | –             |
| **postgres-inventory** | Database owned by inventory-service                      | –          | –             |

### Flow

1. Client calls `POST /orders`
2. Order service creates the order in `PENDING` state and publishes an `OrderPlaced` event
3. Inventory service consumes the event and tries to reserve stock
4. On success → stock is reserved
5. On failure → publishes `order.failed`
6. Order service consumes the failure event and compensates by setting the order to `CANCELLED`
7. Both services share the same `correlationId` in structured logs

```mermaid
sequenceDiagram
    participant C as Client
    participant O as Order service
    participant B as RabbitMQ
    participant I as Inventory service
    C->>O: POST /orders (X-Correlation-ID)
    O->>O: save order as PENDING
    O->>B: OrderPlaced (order.placed)
    O-->>C: 202 Accepted {orderId, status}
    B->>I: OrderPlaced
    alt enough stock
        I->>I: reserve stock (one local transaction)
    else not enough stock
        I->>B: OrderFailed (order.failed)
        B->>O: OrderFailed
        O->>O: order CANCELLED (compensating action)
    end