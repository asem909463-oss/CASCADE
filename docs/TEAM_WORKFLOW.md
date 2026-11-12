# CASCADE — Development Workflow

## Ownership
- Product decisions, architecture, implementation, QA, backend integration and release coordination: ChatGPT.
- Product approval and account/device access: project owner.
- No external AI agents are assigned implementation or review work.

## Repository
- Repository: `asem909463-oss/CASCADE`.
- `main` is the integration branch and must remain buildable.
- Active implementation branch: `build/playable-core`.
- Keep commits focused and descriptive.
- Do not force-push or rewrite shared history.
- Work in feature branches and use pull requests for integration.
- Never report generated code as complete until it has been built and tested.

## Engineering gates
1. Inspect the current repository state before editing.
2. Implement a complete, usable milestone rather than adding placeholder screens.
3. Add automated tests for deterministic game logic.
4. Run typecheck, unit tests and platform bundle validation.
5. Review security, privacy, performance and offline behavior before release.
6. Merge only after validation results are available and reviewed.
7. Re-check the integrated `main` branch after merging.

## Reporting
Every milestone update must state:
- What now works.
- Exact branch and commit.
- Tests actually run and their real results.
- Evidence such as CI output or device screenshots.
- Remaining limitations and next implementation step.

Never invent test results, device testing, builds or release status.
