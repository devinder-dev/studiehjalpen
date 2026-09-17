# Studiehjälpen

RAG assistant answering questions about Swedish student and worker bureaucracy
(CSN, Försäkringskassan, A-kassa, Skatteverket, YH/LIA) from official documents,
with source citations. See @docs/PLAN.md for the build plan and @docs/STATUS.md
for current state.

## Build order
- Create files, install packages and add config ONLY when the current step needs them.
- No scaffolding ahead of time. No empty folders, no placeholder files.
- If something isn't needed yet, note it in docs/IDEAS.md and move on.
- One step at a time. Finish and commit before starting the next.

## Working agreement
- Ask before adding any dependency. Say what it does and why we can't use what's installed.
- No RAG framework (LangChain, LlamaIndex). Every pipeline step is hand-written.
- Never claim something works without running it. Show the command and its output.
- If you disagree with my approach, say so before implementing.
- When unsure, stop and ask. Don't guess, don't invent APIs.

## Comments
- Explain WHY, never WHAT. Max 2 lines. Plain English.

## Git
- Never add "Co-Authored-By", "Generated with Claude Code", or any session URL
  to commits or PRs. Commit as me.
- One logical change per commit. Conventional Commits.
- Use the GitHub CLI (`gh`) for PRs.

## Session protocol
- Before ending work, update docs/STATUS.md: what's done, what's half-finished
  and in which file, what's next.
- Record decisions in docs/DECISIONS.md as they happen.