# Async Remote Execution (202 + Callback) — AGO

This document describes how remote service execution works when your Core calls AGORA Center: the request returns immediately with **202 Accepted**, execution runs in the background, and the **result is delivered by callback** to a URL you provide. All cross-instance execution is billed in **AGO** only; the calling instance must have sufficient balance.

## Goals

- **Fast response**: The API returns as soon as the execution is accepted (no waiting for the provider’s webhook).
- **Result by callback**: The actual service result is sent later via HTTP POST to your `callback_url`.
- **Single currency**: Only AGO is used for remote execution; the Central checks and reserves balance in AGO.

## Flow Overview

1. **Agent** → `POST /execute` on **this Core** with:
   - `instance_id` or `slug` (target instance)
   - `service_id` (service ref in the target instance)
   - `request` (payload for the service)
   - **`callback_url`** (required for remote) — where the result will be POSTed
   - **`callback_token`** (optional) — sent in `X-Callback-Token` when calling `callback_url`

2. **Core** → Resolves the target instance via Central (`getInstanceByIdOrSlug`). If the target is another instance, it calls Central’s execute endpoint with `callback_url` and `callback_token`.

3. **Central** → Checks AGO balance (with optional Redis cache for speed), reserves funds, creates a pending transfer, enqueues a `RUN_REMOTE_EXECUTION` job, and responds **202** with `{ execution_id, status: 'accepted' }`.

4. **Core** → Forwards **202** to the agent with the same body (`execution_id`, `status`).

5. **Central worker** → Processes the queue: calls the provider Core’s execute-from-central endpoint, then either:
   - **Success**: Settles the transfer (ledger, treasury), and POSTs the result to your `callback_url`.
   - **Failure**: Releases the reservation, rejects the transfer, and POSTs the error to your `callback_url`.

So: **no provider call happens in the request path**; the provider is invoked asynchronously by the Central worker, and the caller only gets the result via callback.

## Request (Core)

For **remote** execution you must send:

- **`callback_url`** (required): Full URL that will receive a POST when the execution finishes.
- **`callback_token`** (optional): If set, the Central sends it in the `X-Callback-Token` header when calling `callback_url` (so you can verify the request).

Example body:

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "service_id": "my-service-ref",
  "request": { "input": "data" },
  "callback_url": "https://my-app.com/agora/callback",
  "callback_token": "optional-secret"
}
```

Or using `slug` instead of `instance_id`:

```json
{
  "slug": "provider-instance",
  "service_id": "my-service-ref",
  "request": { "input": "data" },
  "callback_url": "https://my-app.com/agora/callback"
}
```

## Response (Core)

- **202 Accepted**: Execution accepted. Body example:
  ```json
  { "execution_id": "uuid-from-central", "status": "accepted" }
  ```
  The actual result will be sent to `callback_url`.

- **4xx/5xx**: Validation error, insufficient balance (402), instance not found, or Central/network error. No callback will be sent for these.

## Callback Payload

When the Central worker finishes (success or failure), it POSTs to your `callback_url` with:

- **Headers**: `Content-Type: application/json`, and `X-Callback-Token: <callback_token>` if you provided one.
- **Body** (example):
  ```json
  {
    "execution_id": "uuid",
    "status": "success",
    "response": { ... },
    "status_code": 200
  }
  ```
  Or on failure:
  ```json
  {
    "execution_id": "uuid",
    "status": "failed",
    "response": { "error": "...", "message": "..." },
    "status_code": 502
  }
  ```

You should respond with **2xx** to the callback request so the Central can consider it delivered.

## Why Callback Is Required for Remote

Remote execution goes through the Central and the provider Core. The Central does not call the provider during the HTTP request; it enqueues work and returns 202. So there is no synchronous response from the service to return. The only way to get the result is by having the Central POST it to your `callback_url` when the background job completes. That is why `callback_url` is **required** for remote execution (when `instance_id` or `slug` is set).

## Configuration (Core)

For remote execution to work, this Core must have:

- `AGORA_CENTER_URL` — Central base URL
- `INSTANCE_ID` — This instance’s UUID (from Central)
- `INSTANCE_TOKEN` — This instance’s activation token

If any of these are missing, the Core responds with **503** and `CENTRAL_NOT_CONFIGURED` when a remote execution is requested.

## Summary

| Aspect              | Behavior                                                                 |
|---------------------|--------------------------------------------------------------------------|
| Response            | 202 + `execution_id` (no service result in the response)                 |
| Result              | Delivered by POST to `callback_url` (with optional `X-Callback-Token`)   |
| Currency            | AGO only; balance checked and reserved by Central                        |
| When callback is used | For **remote** execution only (when `instance_id` or `slug` is set)   |
