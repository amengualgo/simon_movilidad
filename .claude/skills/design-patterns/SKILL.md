---
name: design-patterns
description: Common design patterns with TypeScript examples (Factory, Builder, Strategy, Observer, Decorator, etc.). Use when user asks "implement pattern", "use factory", "strategy pattern", or when designing extensible components.
---

# Design Patterns Skill

Quick reference for common design patterns in TypeScript.

## When to Use
- User asks to implement a specific pattern
- Designing extensible/flexible components
- Refactoring rigid code

## Quick Reference: When to Use What

| Problem | Pattern | Use When |
|---------|---------|----------|
| Complex object construction | **Builder** | Many parameters, some optional |
| Create objects without specifying class | **Factory** | Type determined at runtime |
| Multiple algorithms, swap at runtime | **Strategy** | Behavior varies by context |
| Add behavior without changing class | **Decorator** | Dynamic composition needed |
| Notify multiple objects of changes | **Observer** | One-to-many dependency |
| Convert incompatible interfaces | **Adapter** | Integrate legacy/3rd party code |

---

## Creational Patterns

### Builder
**Problem:** Telescoping constructors, many optional parameters

```typescript
// ✅ Builder pattern
class User {
  private constructor(
    readonly name: string,
    readonly email: string,
    readonly age: number,
  ) {}

  static builder(name: string, email: string) {
    return new UserBuilder(name, email);
  }
}

class UserBuilder {
  private age = 0;

  constructor(private name: string, private email: string) {}

  withAge(age: number): this {
    this.age = age;
    return this;
  }

  build(): User {
    return new (User as any)(this.name, this.email, this.age);
  }
}

// Usage
const user = User.builder("John", "john@example.com").withAge(30).build();
```

### Factory
**Problem:** Create objects without knowing exact class upfront

```typescript
// ✅ Factory pattern
interface Notification {
  send(message: string): Promise<void>;
}

function createNotification(type: "EMAIL" | "SMS" | "PUSH"): Notification {
  switch (type) {
    case "EMAIL": return new EmailNotification();
    case "SMS": return new SmsNotification();
    case "PUSH": return new PushNotification();
    default: throw new Error(`Unknown type: ${type}`);
  }
}

// Fastify/DI version - preferred
class NotificationFactory {
  private senders = new Map<string, NotificationSender>();

  register(type: string, sender: NotificationSender) {
    this.senders.set(type, sender);
  }

  get(type: string): NotificationSender {
    const sender = this.senders.get(type);
    if (!sender) throw new Error(`Unknown type: ${type}`);
    return sender;
  }
}
```

---

## Behavioral Patterns

### Strategy
**Problem:** Multiple algorithms for same operation, choose at runtime

```typescript
// ✅ Strategy pattern (functional, idiomatic TS)
type PaymentStrategy = (amount: number) => Promise<void>;

const creditCardPayment: PaymentStrategy = async (amount) => {
  console.log(`Paid ${amount} with card`);
};

class ShoppingCart {
  constructor(private paymentStrategy: PaymentStrategy) {}

  async checkout(total: number) {
    await this.paymentStrategy(total);
  }
}

// Usage
const cart = new ShoppingCart(creditCardPayment);
await cart.checkout(99.99);
```

### Observer
**Problem:** Notify multiple objects when state changes

```typescript
// ✅ Event emitter (preferred in Node)
import { EventEmitter } from "node:events";

interface OrderEvents {
  "order:placed": (order: Order) => void;
}

class OrderEmitter extends EventEmitter {
  emit<K extends keyof OrderEvents>(event: K, ...args: Parameters<OrderEvents[K]>) {
    return super.emit(event, ...args);
  }
  on<K extends keyof OrderEvents>(event: K, listener: OrderEvents[K]) {
    return super.on(event, listener);
  }
}

const events = new OrderEmitter();

events.on("order:placed", (order) => {
  // reduce inventory
});

events.on("order:placed", async (order) => {
  // send email, fire-and-forget but logged
});

// In service
events.emit("order:placed", order);
```

---

## Structural Patterns

### Decorator
**Problem:** Add behavior dynamically without modifying class

```typescript
// ✅ Decorator pattern
interface Coffee {
  description(): string;
  cost(): number;
}

class SimpleCoffee implements Coffee {
  description() { return "Coffee"; }
  cost() { return 2.0; }
}

abstract class CoffeeDecorator implements Coffee {
  constructor(protected coffee: Coffee) {}
  abstract description(): string;
  abstract cost(): number;
}

class MilkDecorator extends CoffeeDecorator {
  description() { return `${this.coffee.description()}, Milk`; }
  cost() { return this.coffee.cost() + 0.5; }
}

// Usage
let coffee: Coffee = new SimpleCoffee();
coffee = new MilkDecorator(coffee);
```

### Adapter
**Problem:** Make incompatible interfaces work together

```typescript
// ✅ Adapter pattern
interface MessageSender {
  send(to: string, body: string): Promise<void>;
}

// Legacy/third-party SDK with a different shape
class LegacySmsGateway {
  dispatch(payload: { recipient: string; text: string }): Promise<void> {
    return Promise.resolve();
  }
}

class SmsAdapter implements MessageSender {
  constructor(private gateway: LegacySmsGateway) {}

  send(to: string, body: string) {
    return this.gateway.dispatch({ recipient: to, text: body });
  }
}
```

---

## Pattern Selection Guide

| Situation | Pattern |
|-----------|---------|
| Object creation is complex | Builder, Factory |
| Need to add features dynamically | Decorator |
| Multiple implementations of algorithm | Strategy |
| React to state changes | Observer |
| Integrate with legacy/3rd-party code | Adapter |

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Better Approach |
|--------------|---------|-----------------|
| Singleton abuse | Global state, hard to test | Dependency injection (Fastify plugin scope) |
| Factory everywhere | Over-engineering | Simple `new`/function if type known |
| Deep decorator chains | Hard to debug | Composition, keep chains short |
| Class-heavy OOP for simple data | Unneeded ceremony | Plain objects/functions where idiomatic in TS |
