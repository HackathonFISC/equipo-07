# Ponytail review — 2026-10-16

What this change does: AguaIA accepts water reports into a durable queue, runs three agents and
stores a priority proposal. A protected human review resumes LangGraph and records the final decision.

Review scope: all local changes, API callers, React views, graph nodes, database writes, migration,
provider adapter, tests and README. Expected load: a local hackathon demo with one worker on one host.

Looks good. Ship as a local demo within the documented limits.

Corrections made after the first review:

1. **Agents contained ORM writes.** Moved these writes into the finite `AgentTools` boundary.
   The consolidation tool checks real candidates again before writing; tests reject wrong sectors/types.
2. **The initial Vitest dependency tree had security advisories.** Updated to 5.0.5, reran tests/build,
   and the installation audit reports zero vulnerabilities. No forced bulk dependency upgrade was used.
3. **Configuration allowed the same file for business data and checkpoints.** The configuration now
   rejects that case before opening either store; a regression test covers it.
4. **Public execution responses had no explicit response schema.** Added `ExecutionReceipt` to the
   API contract. HTTP tests verify its states and that public responses exclude administrative data.
5. **A terminal business status could precede the final graph checkpoint.** A process death in that
   gap could leave an unfinished graph hidden behind APPROVED. Only the worker now publishes terminal
   status after the graph checkpoint; a test recovers after the decision commit and verifies one audit event.

Checks: transactional acceptance and review, replay idempotency, concurrent review conflicts,
worker process restart, candidate validation, priority rules, token handling, negative API/provider
tests, migration reversibility, frontend interactions, lint/types/build and preservation of README data.

No unnecessary plugin registry, general repository wrapper, message broker, routing solver or cloud
deployment was added. `AgentTools` exists for a concrete security boundary; it is not a generic CRUD layer.

Verdict: Ship for the local demo.
Not checked: live NVIDIA inference, PostgreSQL/Linux execution, a real browser accessibility audit,
remote CI, sustained load or public deployment. Shared tokens and a single worker remain MVP limits.

Files observed late in the workspace: `backend/config.py`, `backend/contracts.py`,
`backend/domain/priority.py` and their package markers were absent from the initial listing and
were not created by this implementation. Their origin is unconfirmed. They were preserved unchanged;
the tested runtime imports `backend/app` as package `app`. The alternative modules have different
contracts and priority thresholds and must not be mixed into this runtime without reconciliation.
