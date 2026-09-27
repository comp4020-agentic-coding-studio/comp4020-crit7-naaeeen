# Cross-agent entry point

`CLAUDE.md` is the canonical repository harness even when the active coding
agent is Codex, ChatGPT, Copilot or another tool. Read it completely before
changing code or process files.

Use this instruction order when guidance overlaps:

1. the live COMP4020 Crit 7 brief and spec;
2. `CLAUDE.md` for stable repository rules;
3. `README.md` and `spec/README.md` for the fixed platform this repo is built
   on;
4. focused tests in `spec/` for mechanical contracts;
5. the actual running app, including the deployed `*.fly.dev` URL.

Do not duplicate the full harness here: one owner per rule prevents drift.
Keep changes scoped, preserve unrelated work, collect evidence from commands
and running the real app, and commit only coherent green checkpoints.

Ordinary local commits and pushes to this existing remote are authorized.
Making the repository public, changing visibility, or running the course ship
workflow still requires an explicit ask.
