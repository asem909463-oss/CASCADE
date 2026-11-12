# CASCADE — Team Ownership & Git Workflow

## Team

| Owner | Responsibility | Must not own |
|---|---|---|
| ChatGPT | Product owner, project coordination, architecture decisions, review and release gates | Pretending to run agents outside available connections |
| Manus | Expo app, game engine, UI, animations, sound, haptics, local persistence and client tests | Supabase schema/security ownership |
| Perplexity | Supabase architecture, SQL migrations, RLS, Edge Functions, backend tests and API contracts | Game UI and gameplay implementation |
| Claude | Independent QA plans, code review, reproducible bug reports, performance and release audits | Competing game implementation or marketing |
| Marketing AI (TBD) | Marketing and launch creative, once appointed | Product or engineering decisions |

## Repository rules

- Repository: `asem909463-oss/CASCADE`.
- `main` is the integration branch and should remain buildable.
- Each agent works on a clearly named branch.
- Suggested branches: `manus/game-client`, `perplexity/backend`, `claude/qa`.
- Documentation-only coordination work uses `docs/*`.
- Do not force-push, rewrite shared history, or overwrite another agent's files.
- Do not push unfinished work directly to `main`.
- Submit a pull request for integration; include a summary, test evidence, screenshots where useful, and known limitations.
- Before editing, inspect the latest `main` and check for overlapping work.
- Keep commits focused and descriptive.

## File ownership boundaries

- Manus: app source, Expo configuration, assets and client tests.
- Perplexity: `supabase/**`, backend documentation and backend tests.
- Claude: QA documentation and isolated test tooling only, coordinated with the implementation owner.
- Shared contracts: agree changes with both client and backend owners before merging.

## Integration protocol

1. Owner reports the branch, commit SHA, changed files, tests run and blockers.
2. Claude reviews the relevant implementation and reports reproducible findings.
3. ChatGPT checks product scope, ownership boundaries, security implications and test evidence.
4. The responsible owner fixes requested changes.
5. Merge only after review and required checks pass.
6. Re-check the integrated `main`; do not assume a green branch means the combined app works.

## Reporting format

Every milestone update must include:
- **Completed:** specific working outcomes.
- **Branch / commit:** exact Git reference.
- **Tests:** commands or test names and actual results.
- **Evidence:** screenshots, logs or PR link when relevant.
- **Blockers:** access, credentials, dependencies or decisions needed.
- **Next:** the next concrete deliverable.

Never report a task as complete merely because code was generated. Never invent test results.
