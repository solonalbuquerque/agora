# Instance Slugs and Cross-Instance Execution

This document explains how **instance slugs** work and how execution on **other instances** is performed through this Core and AGORA Center, including why a **callback** is required for remote execution.

## Instance identification: UUID vs slug

An AGORA instance is uniquely identified in the Central by:

1. **`instance_id`** — UUID assigned by the Central at registration (e.g. `550e8400-e29b-41d4-a716-446655440000`).
2. **`slug`** — A human-readable alias chosen at (pre)registration (e.g. `acme-prod`, `billing-service`). It must be unique across the Central.

When you call a service (on this or another instance), you can specify the target in two ways:

### Single field: `service`

You can send a single field **`service`** in the body:

- **No colon** (e.g. `pokk`) — service in the **current instance**. Equivalent to omitting instance and using service `pokk`.
- **One colon** (e.g. `auto:a11`) — the **first** `:` splits the string: the part before is the **instance** (UUID or slug), the part after is the **service** (UUID or slug). Example: instance `auto`, service `a11`. If the service identifier itself contains colons, only the first colon is used for the split (e.g. `x:svc:v2` → instance `x`, service `svc:v2`).

When `service` is present and non-empty, it **replaces** the use of `service_id` and `instance_id`/`slug` for determining the target. Both parts must be non-empty when a colon is present (e.g. `:a11` or `auto:` is invalid).

### Legacy fields: `service_id` and `instance_id` / `slug`

Alternatively, you indicate the target with separate fields (for backward compatibility):

- **`instance_id`** (single field, three semantics):
  - **Omitted or empty string** — this instance (local execution). No Central call.
  - **UUID** — that instance by ID. This Core resolves it via the Central; if it is the current instance, runs local; otherwise forwards to the Central (remote).
  - **Non-empty string (e.g. instance slug)** — that instance by slug. Same resolution and routing as UUID.

The body field **`slug`** (when present) refers to the **instance** slug, not the service. It is deprecated: prefer sending the instance slug in `instance_id`. If `instance_id` is empty and `slug` is set, the Core uses `slug` as the target instance identifier for backward compatibility. You must not send both `instance_id` and `slug` with values.

You must provide **either** `service` **or** `service_id` (and optionally instance targeting). This Core resolves the target via the Central’s public directory when an instance is specified, then either runs locally (if the target is this instance) or forwards the execute request to the Central (if the target is another instance).

**Service identification (within the target instance):** both in the `service` field (after the colon, if any) and in `service_id`, the value can be the service **UUID** or the service **slug**. The slug is a unique, human-readable identifier for the service **within that instance** (e.g. `billing-v1`). It is defined and stored only in the instance; the Central stores it in the directory for resolution when you call by slug, but the canonical identifier in the Central remains `service_ref` (the UUID). When executing remotely, you may send either the UUID or the slug; the Central resolves slug to the service and then calls the provider with the UUID.

## Local vs remote execution

When a request arrives at `POST /execute`, this Core **determines whether the current instance is the one that should run the service** or whether it must **forward the request to another instance via the Central**:

- **Local execution**  
  - `instance_id` is omitted, null, or empty string (and no `slug` used as target).  
  - The Core runs the service in **this** instance: looks up the service by **UUID or slug** (`service_id`), debits the agent’s wallet, calls the service webhook, and returns the result (or a pending status and callback URL for local callbacks).  
  - No Central involved for the execution itself.

- **Remote execution**  
  - `instance_id` (or, for backward compatibility, `slug`) is set to a non-empty value (UUID or instance slug).  
  - The Core:  
    1. Resolves the target instance with the Central (`getInstanceByIdOrSlug`).  
    2. If the target is the **current** instance, runs **local** execution.  
    3. If the target is **another** instance, checks that it is active/registered, then **forwards immediately** to the Central execute API with `callback_url` and `callback_token` (remote).  
  - The Central checks AGO balance, reserves funds, enqueues a job, and returns **202** with an `execution_id`.  
  - The Core forwards that **202** to the agent. The actual execution is done by the Central’s worker (which calls the **provider** Core), and the result is sent to the agent’s **callback_url**.

So: **cross-instance execution always goes through the Central** and is **asynchronous** (202 + callback). This Core only orchestrates the call to the Central and returns the 202.

## Flow summary

```
Agent
  │  POST /execute { service or (service_id [, instance_id or slug]), request, callback_url[, callback_token] }
  │  service: "pokk" (local) or "auto:a11" (instance:service)
  ▼
This Core
  │  If service field: parse (first ":" = instance:service); else use service_id + instance_id/slug
  │  getInstanceByIdOrSlug when target specified  →  Central (public)
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
| **service**       | Single field: `"service"` = local service; `"instance:service"` = first `:` splits instance and service. When present, overrides service_id and instance_id/slug. |
| **instance_id**    | Omit or empty = this instance (local). UUID or instance slug = resolve via Central; then local or forward to Central (remote). Used when `service` is not provided. |
| **slug (body)**    | Deprecated: instance slug. Use `instance_id` for instance slug. When `instance_id` is empty, `slug` is still accepted as target instance. |
| **Service id/slug**  | In `service` (after `:`) or `service_id`: service UUID or service slug (unique per instance). |
| **Resolution**      | This Core resolves instance via Central when a target is specified; service by id or slug locally; Central resolves service_ref or service_slug for remote. |
| **Validation**      | On request arrival: if no target or target is this instance → local; if target is another instance → forward to Central immediately. |
| **Local**            | No target (service without `:`, or instance_id empty/omit) or target is this instance → execution on this Core. |
| **Remote**           | Target is another instance → request goes to Central, 202 + callback only.    |
| **Callback**         | Required when a target instance is specified (needed for remote; also required when target resolves to this instance, to keep one code path). |
