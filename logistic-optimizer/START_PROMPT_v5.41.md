# START PROMPT — paste this into the new chat

I'm Gabriel, continuing work on my **Logistic Optimizer** Electron app (PVC/ALU window factory, Elwiz). We're at **v5.41**. I'm attaching the current build (`logistic-optimizer-phase5.41.zip`) and a full handoff (`HANDOFF_v5.41.md`).

**Before doing anything, read HANDOFF_v5.41.md in full.** It contains the architecture, the data/query model, the full changelog, the dev loop, and known open issues.

**The one rule that matters most:** never break working functionality — surgical changes only. In particular, the single ribbon Refresh button must keep refreshing BOTH Orders and Production together. This regressed many times; it's structurally fixed in v5.41 and must stay fixed.

To start: unzip to `/home/claude/`, confirm the version shows v5.41, and read the handoff. Then ask me what I want to work on. Don't make changes until I describe the task, and confirm any data-semantics ambiguity with me before building.

One known open question you can raise: in v5.39 I asked to relabel "stuck" → "pcs" in the totals/group headers. You did a pure text relabel but the underlying number is still the stuck-element count. Ask me whether I want that number changed to a real piece count.
