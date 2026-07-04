# Step 5 — WebSocket audit (build streaming)

> Evidence-based review. Focus: connection lifecycle, auth, heartbeat, reconnect, backpressure, memory usage, horizontal scaling, Redis pub/sub fanout, connection limits.

## 1) Connection lifecycle
### Evidence
- Endpoint: `backend/api/builds.py:websocket_endpoint` at `router.websocket('/ws/{build_id}')`.
- After handshake + auth, it calls:
  - `manager.connect(websocket, build_id)`
  - then loops reading from socket with `await websocket.receive_text()` and `asyncio.wait_for(..., timeout=30)`.
- On disconnect: `manager.disconnect(websocket, build_id)`.

### Implications
- Connections are kept alive by a ping response every 30s if the client sends nothing.
- Server reads client messages only to keep the loop alive; message content is ignored.

## 2) Authentication mechanism
### Evidence
- `backend/services/ws_manager.py:authenticate_websocket`:
  - Accepts the socket.
  - Awaits the first message with timeout `WS_AUTH_TIMEOUT_SECONDS = 10`.
  - Requires JSON payload:
    - `{ "type": "auth", "token": ... }`
  - Validates token via `decode_token` and requires `payload.get('type') in ('access','ws')`.
  - Loads user from Mongo by `users.find_one({"id": user_id})`.
  - Loads build from Mongo by `builds.find_one({"id": build_id})` and checks `has_build_access`.

### Scalability implications
- Each WS connection performs 2 Mongo reads during auth.
- For high connection churn (reconnect storms), Mongo load scales linearly with connection attempts.

## 3) Heartbeat / keepalive
### Evidence
- Server sends `{"type":"ping"}` on a 30s receive timeout.
- Also `MAX_WS_PAYLOAD_BYTES` limits outgoing payload size.

### Risks
- No explicit client-driven heartbeat required; server-driven ping only if receive_text times out.
- If client/proxy closes idle connections earlier than 30s, clients will reconnect; reconnection storm can amplify Mongo auth reads.

## 4) Reconnect behavior
### Evidence
- Repo does not provide reconnect backoff config in code excerpt.
- Frontend hook (`frontend/src/hooks/useBuildSocket.ts`) exists (referenced in README), but not audited here.

### Risk statement
- Reconnect storms are a primary WS scale risk; without bounded client backoff, Mongo auth reads can spike.

## 5) Backpressure & memory usage
### Evidence
- `ConnectionManager._deliver_local` iterates over all websockets in a build and does `await ws.send_text(payload)` sequentially.
- If `send_text` throws, the websocket is removed.
- Outgoing payload cap:
  - `MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024`.

### Implications
- Backpressure is implicit: slow clients block the deliver loop for their build-id.
- Because delivery is sequential per connection, one slow client can degrade delivery to others sharing the same build channel.
- Memory usage grows with:
  - number of WS connections held in `self.active[build_id]`.
  - number of build-id keys in `self.active`.

## 6) Horizontal scaling
### Evidence
- `ConnectionManager.start_pubsub_listener`:
  - subscribes with `psubscribe('build:*')`.
  - on messages, parses channel -> build_id and delivers to local connections.
- `ConnectionManager._publish`:
  - first calls `_deliver_local(build_id, payload)`
  - then attempts `redis.publish(f'build:{build_id}', envelope)`.
  - if Redis publish fails, exception is swallowed.

### Fan-out strategy
- Redis pub/sub fan-out per build-id channel.
- Each backend process maintains a pub/sub listener and local delivery set.

### Risks
- Redis pub/sub is *best-effort*:
  - no persistence; if a backend pod is down, messages are lost.
  - this may cause WS event gaps until next full state update.

## 7) Connection limits
### Evidence
- No explicit max connections per pod or per build in `ws_manager.py`.
- Therefore limits are determined by:
  - OS file descriptor limits
  - uvicorn worker limits
  - Kubernetes pod resources
  - Redis pub/sub throughput

## 8) Estimated maximum concurrent WebSocket connections
### Evidence-based constraints
- Payload cap 5MB and sequential send implies CPU/event-loop cost rises with number of connections.

### Structural estimate (assumptions)
Because explicit per-pod connection limits are not defined in manifests/code here, we can only provide a bottleneck-form estimate:
- For N backend pods, each has a local `active` map and one pub/sub listener task.
- Max concurrent WS connections per pod is dominated by:
  - network sockets (file descriptors)
  - event-loop overhead and sequential send cost

Practical milestone expectations (qualitative):
- ~100 concurrent users (few WS per user) is feasible.
- 1,000+ concurrent active WS is feasible with multiple backend replicas.
- 10,000+ concurrent active WS likely becomes network/FD bound and sequential delivery CPU bound.

## 9) What prevents scaling milestones (top findings)
P0/P1 blockers for very high concurrency:
- No explicit connection caps/backpressure isolation; slow clients can delay delivery.
- Redis pub/sub is non-persistent; event loss during pod churn.
- Each WS auth performs Mongo reads; reconnect storms can load Mongo.

P2:
- No observed explicit per-build event rate limiting; if build pipeline emits frequent tokens, redis publish frequency can be high.

