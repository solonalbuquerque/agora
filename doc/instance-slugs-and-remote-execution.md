# Instance Slugs and Cross-Instance Execution

This document explains how **instance slugs** work and how execution on **other instances** is performed through this Core and AGORA Center, including why a **callback** is required for remote execution.

## Instance identification: UUID vs slug

An AGORA instance is uniquely identified in the Central by:

1. **`instance_id`** — UUID assigned by the Central at registration (e.g. `550e8400-e29b-41d4-a716-446655440000`).
2. **`slug`** — A human-readable alias chosen at (pre)registration (e.g. `acme-prod`, `billing-service`). It must be unique across the Central.

When you call a service on **another** instance, you can target it by either:

- **`instance_id`**: use the UUID.
- **`slug`**: use the slug.

You must send **exactly one** of them in the request body (not both). This Core resolves the target via the Central’s public directory (e.g. `GET /public/instances/by-id-or-slug/:idOrSlug`) to get the instance’s `id`, `status`, and `base_url` before forwarding the execute request.

## Local vs remote execution

- **Local execution**  
  - No `instance_id` and no `slug` in the body.  
  - The Core runs the service in **this** instance: looks up the service by UUID, debits the agent’s wallet, calls the service webhook, and returns the result (or a pending status and callback URL for local callbacks).  
  - No Central involved for the execution itself.

- **Remote execution**  
  - Either `instance_id` or `slug` is set (and the other must be omitted).  
  - The Core does **not** call any provider. It:  
    1. Resolves the target instance with the Central (`getInstanceByIdOrSlug`).  
    2. If the target is the **current** instance, falls back to local execution.  
    3. If the target is **another** instance, checks that it is active/registered, then calls the **Central** execute API with `callback_url` and `callback_token`.  
  - The Central checks AGO balance, reserves funds, enqueues a job, and returns **202** with an `execution_id`.  
  - The Core forwards that **202** to the agent. The actual execution is done by the Central’s worker (which calls the **provider** Core), and the result is sent to the agent’s **callback_url**.

So: **cross-instance execution always goes through the Central** and is **asynchronous** (202 + callback). This Core only orchestrates the call to the Central and returns the 202.

## Flow summary

```
Agent
  │  POST /execute { instance_id or slug, service_id, request, callback_url[, callback_token] }
  ▼
This Core
  │  getInstanceByIdOrSlug(instance_id or slug)  →  Central (public)
  │  If target == this instance  →  local execution (same Core)
  │  If target != this instance  →  executeRemoteService(...)  →  Central
  ▼
Central
  │  Check AGO balance (optional Redis cache), reserve, create transfer, enqueue RUN_REMOTE_EXECUTION
  │  Response: 202 { execution_id, status: 'accepted' }
  ▼
This Core  →  202 to Agent

Later:
Central worker  →  POST to provider Core (execute-from-central)  →  settle or release
                 →  POST to callback_url with result (or error)
```

## Why callback is required for remote execution

- The Central does **not** call the provider’s webhook inside the HTTP request that the Core makes. It accepts the execution, enqueues it, and returns **202**.
- The provider is invoked **asynchronously** by the Central’s outbox worker. So there is **no synchronous response** from the service to send back to the agent in the same request.
- The only way to deliver the result (or failure) to the caller is to **POST it to a URL** after the job completes. That URL is **`callback_url`**; optionally you can pass **`callback_token`** so the receiver can verify the callback with the `X-Callback-Token` header.

Therefore, for any request that targets another instance (`instance_id` or `slug`), **`callback_url` is required**. If it is missing, the Core returns **400** with a message that `callback_url` is required for remote execution (AGO async flow).

## Using slugs in practice

- **Stable references**: Slugs are easier to use in configs and scripts than UUIDs (e.g. `slug: "billing"` instead of a long UUID).
- **Same API**: The Core accepts either `instance_id` or `slug` in the same field semantics; only the value format differs (UUID vs string). The Central resolves both and returns the same instance metadata.
- **Reserved slugs**: Some slugs may be reserved by the Central; if so, registration might require a license or special handling (see Central docs).

## Summary

| Topic              | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| **Instance id/slug** | Target instance by `instance_id` (UUID) or `slug` (alias); one per request. |
| **Resolution**      | This Core resolves both via Central’s public directory before executing.   |
| **Local**            | No instance_id/slug → execution on this Core, synchronous or local callback. |
| **Remote**           | instance_id or slug set → request goes to Central, 202 + callback only.    |
| **Callback**         | Required for remote: result is delivered by POST to `callback_url`.        |
