# CASCADE — Ownership & Git Workflow

## Ownership

ChatGPT owns the product direction, implementation, code review, testing coordination, privacy documentation and release checklist for this project. No external AI agent is assigned implementation, QA or marketing work unless the user explicitly changes that decision.

## Repository rules

- Repository: `asem909463-oss/CASCADE`.
- `main` is the release integration branch and must remain buildable.
- Work on a named feature branch and open a pull request into `main`.
- Never force-push or rewrite shared history.
- Do not describe code generation as completion; report actual test and build evidence.
- Keep the product offline-first unless a future feature is explicitly approved.

## Release reporting

Every milestone report must include:
- Completed changes and exact branch/commit.
- Test commands and actual results.
- Build/export evidence.
- Remaining blockers, including anything requiring the user's Apple or Expo account.
- The next concrete step.

## Release discipline

A green TypeScript/test/bundle workflow is necessary but not sufficient for App Store release. The exact release commit must also pass native iOS build, device QA, privacy disclosure review, App Store metadata and screenshot checks. Never claim App Store approval or device testing without evidence.
