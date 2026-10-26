# Apply campaign actions locally and persist snapshots in order

The UI previously awaited each Firestore transaction before showing a started
level, purchase, training state or reward. A held-network browser repro left the
roster visible beyond 1.2 seconds after Start. The user requires uninterrupted
flow with optimistic updates.

The browser already owns single-player game validation (ADR 0001). It now applies
each transition once, then durably queues an immutable snapshot with the base
revision and unique receipt ID. Cloud commits check ownership/revision and write
that exact snapshot. This preserves generated attempt IDs, money and absolute
training deadlines; repeating a start or recomputing training on the cloud clock
would make subsequent moves or displayed timers inconsistent.

Queued snapshots are acknowledged in order. A response-lost prefix is trimmed by
its receipt. Restoring pending progress does not await the initial cloud read;
transmission stays paused until reconciliation, while further local actions can
continue. Transient failures retain the queue and retry. Conflicts preserve the
local campaign and pause uploads. Choosing the newer cloud save from the profile
archives local pending progress before loading it. Account switching to an
existing Google identity or signing out flushes the old identity's writes first.

This keeps the accepted casual-game trust model: rules protect private ownership,
shape and revisions, not self-cheating. There is no Functions backend or new IAM
permission. Meaningful acceptance includes held responses, multiple dependent
optimistic actions, refresh recovery, exact deadlines/attempt IDs, idempotent
acknowledgements and rejection of stale device writes.
