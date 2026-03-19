# PromptSmith v0.2 - Iteration Update

**Date:** March 19, 2026

## 1. Current Progress
- File structures and stage flows are now connected end-to-end.
- MCP task generation is richer and includes more project context.
- Transport support was improved to reduce initialize/connect failures.
- Despite this, project sync is still inconsistent in some runs.

## 2. What Changed In This Iteration (v1 -> v2)

### MCP Transport + Stability
- Added Streamable HTTP MCP endpoint: `/api/mcp/http`.
- Kept SSE route but hardened it:
  - Safe stream write/close handling.
  - Abort-aware cleanup.
  - Reduced chance of `initialize` hang due to blocking connect flow.

### Task Prompt Context Improvements
- `get_pending_tasks` now prepends:
  - Workspace context (root, top-level folders/files, router guidance).
  - Stage prompt context (cumulative prompt snippets across stages).
  - Media context (from `project_features.media` output).

### Skeleton + Assets Guidance
- Added image/media folder summary in task output.
- Agent now gets explicit instruction to place generated/source images in detected/recommended folders.
- This is intended to make file skeleton generation asset-aware.

### Preflight / Stage 0 Guidance
- Added preflight checks in task output:
  - Detects JS/Python project manifests.
  - Checks dependency readiness (`node_modules`, lockfile hints, venv presence).
  - Provides setup commands when project/dependencies are missing.

## 3. Active Problems
1. Sync issue still appears even when structure is connected.
2. File structure can still feel confusing across stages.
3. Prompting can become too broad for some agents/models.

## 4. Next Direction: Hybrid Prompting
Use a hybrid strategy instead of only stage-monolithic prompts.

### Medium Model Strategy
- Medium-capability models should not receive large monolithic prompts.
- Keep each prompt unit small and bounded to one feature slice or one verification slice.
- Always include strict file targets, acceptance checks, and completion criteria.
- Use cumulative context in layers: global rules -> stage objective -> task details -> verification.
- If output quality drops, reduce scope per task before increasing prompt size.

### Proposed Hybrid Flow
1. Global constraints prompt:
- Router/style rules, architecture boundaries, coding standards, and non-negotiables.

2. Stage-level objective prompt:
- What this stage must produce, acceptance checks, and output format.

3. Feature/task-level focused prompt:
- Small, isolated implementation unit with exact file targets.

4. Verification prompt:
- Lint/test/build checks + contract validation + required follow-up action.

This keeps high-level alignment while reducing local hallucinations.

### Workflow Change (Flow-Wise)
1. Preflight (0th stage):
- Detect framework/runtime, check required tools, and output exact setup/install commands.

2. Skeleton + asset map stage:
- Generate folder/file skeleton plus image/media storage locations.
- Tell user exactly where to place images/assets before implementation starts.

3. Stage execution loop:
- Pick one focused task -> implement -> run checks -> mark complete.
- Re-fetch next task only after passing stage-specific validation.

4. Sync checkpoint after each task:
- Verify expected files exist and match intended paths.
- Reject mixed router output for the same feature.

5. Final verification:
- Run lint/build/tests and produce final readiness summary.

## 5. Recommended Immediate Actions
1. Add explicit sync checkpoints after each completed task:
- Re-read generated files + verify expected paths exist before marking complete.

2. Add a strict skeleton manifest per stage:
- Required folders/files, image locations, and prohibited paths.

3. Add a final "structure sanity" gate in preflight:
- Confirm router mode and reject mixed app/pages output for same feature.

## 6. Summary
This iteration improved transport reliability and prompt context quality. We also added preflight checks and image-folder guidance so skeleton generation is more practical. The major remaining gap is reliable sync and reducing structural confusion, which the hybrid prompting approach is meant to solve next.
