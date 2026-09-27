# COMP4020 Crit 7 harness

This repository builds a full-stack replacement for one ANU system for COMP4020
Crit 7. The deployed Fly.io app is the marked artefact; the repository is the
evidence trail for how it was directed, tested and corrected.

Read the live brief and spec before changing scope:

- https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/
- https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#marking-environment

## Instruction map

- The published brief and spec are the fixed contract.
- This file contains stable repository rules that should load every session.
- `README.md` is my own account of what the app is and what good looks like
  here; the deployed app serves it in full at `/readme/`.
- `fly.toml`, the `Dockerfile` and the CI workflow fix the deploy shape --- do
  not restate or contradict them here.
- `spec/` turns mechanical promises into automatic backpressure; `spec/README.md`
  explains what's shipped versus mine to write.
- Running the actual built server covers persistence and judgement that source
  alone cannot.
- `PROCESS.md` and `reflections/crit-7.md` record evidence after the work is
  real.
- `AGENTS.md` points non-Claude agents at this same canonical harness.

Do not copy session-specific tasks or course facts into this file. Link to
their source so the standing harness stays short and does not drift.

## Working loop

Given this is a one-day crit, keep planning light: a short note in `PLAN.md`
for anything touching the data model or more than one file is enough; skip a
heavier planning ritual.

1. Inspect the brief, `git status`, the relevant files and existing checks.
2. Establish a green baseline before editing.
3. For a mechanical promise, demonstrate RED with a focused test, implement the
   smallest GREEN change, then refactor while the suite stays green.
4. Run the actual built server and exercise the real flow: create something,
   reload, confirm it's still there.
5. Commit only coherent green checkpoints with descriptive messages --- these
   are exactly what `PROCESS.md` cites later.

Ask only when missing input materially changes the result or an action needs
authorization; otherwise keep moving. Ground claims about behaviour in files or
observed output, not assumption, and say plainly when browser verification
wasn't done.

## Toolchain and commands

Use the versions pinned in `mise.toml`. The non-interactive WSL shell may
expose an older system Node, so run project commands through `mise exec -- ...`.

- `mise exec -- pnpm dev` - serve the working tree.
- `mise exec -- pnpm test` - build, then run the spec suite against the built
  server.
- `mise exec -- pnpm check` - typecheck, build and test.
- `mise exec -- pnpm check:evidence` - validate assessed process files.
- `mise exec -- pnpm db:generate` - regenerate Drizzle migrations after a
  schema change in `src/lib/schema.ts`.
- `flyctl deploy --remote-only --ha=false -a comp4020-crit7-naaeeen` - deploy
  by hand while the repo is private; CI runs the same command once it's public.

Read a failed command's output before editing. Never weaken a check merely to
make it green.

## Architecture guardrails

- `fly.toml`'s machine, volume and auto-stop shape is fixed, and there is no
  `app` line by design --- the deploy command supplies the repo name. Leave it
  as shipped.
- `DATABASE_PATH` points at the mounted volume so state survives reload,
  restart and redeploy. Model data through the Drizzle schema and migrations,
  not ad hoc file writes.
- Keep `spec/invariants.test.ts` green (nav landmark, one `<h1>`, document
  language, real title, mobile viewport, alt text, the axe floor). Add every
  new page's route to `routes.ts`, or the invariants silently stop covering it.
- Keep `spec/readme.test.ts` green: `/readme/` must serve the whole of
  `README.md`.
- `spec/guestbook.test.ts` describes the starter's own plumbing. It is expected
  to go away once that plumbing is replaced by the real feature --- don't leave
  it red and unexplained; remove it when its code is gone.

## Verification boundary

Before accepting an implementation checkpoint:

- run `mise exec -- pnpm check`;
- run `mise exec -- pnpm build && mise exec -- pnpm preview` (the actual
  server), not only the dev server;
- exercise the core flow at `1920x1080` and `390x844`: create something,
  reload the page, confirm it persisted;
- inspect the browser console for errors or warnings;
- once deployed, hit the real `*.fly.dev` URL --- the spec is checked against
  the deployed app, not local dev.

Whether the modelled slice is a real ANU annoyance, and whether it's honestly
wired end to end rather than decorative, is a human judgement. Do not pretend a
passing check proves it.

## Git and safety

- Preserve unrelated user changes and inspect the diff before every commit.
- Never use destructive Git commands on an ambiguous target.
- Never commit keys, tokens, the Fly API token, or `.claude/` credentials ---
  `mise.local.toml` is gitignored precisely for the Fly token; keep it that way.
- Commit locally in small green checkpoints.
- Ordinary local commits and pushes to this existing remote are authorized.
  Making the repository public, changing visibility, or running the course
  ship workflow still requires an explicit ask.
