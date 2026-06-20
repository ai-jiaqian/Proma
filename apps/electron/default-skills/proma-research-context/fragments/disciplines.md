<!-- disciplines-version: 1 -->
<!--
两条科研纪律的单一信源（source of truth）。只在本文件编辑。
proma-research-context 的 init 脚本会把本文件正文原样拷贝到工作区
workspace-files/research-disciplines.md（带受管头部），--refresh 时按版本号刷新。
不要在 SKILL.md / PROJECT.md 里改写这段文字——指向它即可。
改动正文时，把上面的 disciplines-version 版本号 +1。
-->

## Experiment Run Discipline

The smoke exists for ONE purpose: to de-risk the expensive run so it does not waste
time or compute. Before scaling ANY real run, say plainly **what this run must prove**,
then make the smoke measure THAT — not merely that the pipeline executed. A run is wasted
when it is silently MISCONFIGURED (an auxiliary subsystem fails while the headline metric
looks normal), WASTEFUL (correct but needlessly slow / expensive), or INVALID (the thing
it was meant to test was never actually tested). The recurring trap: a smoke confirms the
machinery RUNS and that is mistaken for proof the machinery is GOOD (fast enough, correct
on representative data, actually helpful).

**Instrument for complete logs from day one (set up at project init, not retrofitted).**
The experiment code should persist the full process data of every run: each stage's inputs
and outputs, the RAW request/response of every model/API call (BEFORE any cleaning /
parsing / sanitizing), and the fully-assembled input actually fed to each component. You
cannot retrofit a log onto a run you already did. Two payoffs: (1) failures become visible
in the record instead of hidden in discarded intermediate data — the wasteful/broken thing
(leaked reasoning, truncation, swallowed errors, a junk-filled prompt) is usually exactly
what a cleaning layer strips before it reaches the stored artifact; (2) complete logs ARE
the experiment's primary data asset — later analysis and insight are limited to what you
recorded. "Logged" means logged to the RAW form, not the post-processed artifact.

**A smoke meets the bar only when ALL THREE hold:**
1. **Runs clean.** Completes the real pipeline at tiny scale (few items / few steps) on the
   exact same code / config / endpoint, no errors.
2. **Every step's I/O matches expectation in the complete log.** Open the actual logged
   inputs and outputs and check them against what you expect. Read the COMPLETE record of
   the HARDEST / longest representative cases in RAW (pre-sanitization) form — not a sample,
   not a summary, not the convenient/easy slice (`--limit N` that takes a sorted prefix is
   usually the easiest category). The failure mode here is never "I didn't log it"; it is
   "I looked, but at the wrong slice or the wrong field." Raw junk (leaked reasoning,
   duplicated / malformed calls, truncation, a 40K-token prompt) is self-evidently wrong
   once you actually read it.
3. **If the run's purpose is to show an intervention X helps, A/B it.** Run the same items
   with X on vs X off and check the SIGN of the effect. A single run's log shows what
   happened, never the counterfactual ("would it have worked WITHOUT X?"); only the control
   reveals help-vs-harm. "X ran / wrote / retrieved and the metric looks normal" ≠ "X helped."

**Necessary but not sufficient — gate the real run too.** Some failures emerge only at scale
(bank density, growing context length, accumulation, retrieval collapse on dense near-
duplicates) and a tiny smoke structurally cannot reproduce them — there is nothing bad in
the smoke log to see. For these, instrument the REAL run to self-check at the first point the
mechanism becomes active (e.g. the first eval where retrieval / memory is in play) and
auto-abort on regression vs baseline, rather than trusting the smoke and running to the end.

Supporting checks (apply within the above):
- **Project the full run's cost from the smoke, and gate on it.** Measure one unit's
  wall-time / tokens / $ and multiply out (`unit × N`); state it before launching; STOP if
  surprising. Reconcile per-unit cost against an order-of-magnitude expectation (a small-model
  tool call ≈ 1s, not 13s; a 10× gap is a red flag, not a detail).
- **A config field being present does not mean it took effect** — confirm it in the produced
  output; a flag set on one model/component does not apply to a separate one (e.g.
  `enable_thinking` on the memory LLM does not touch a separate agent handler).
- **Confirm the service/endpoint actually serves the model / version / dataset requested.**
- **When a metric is surprisingly slow / expensive / large, isolate the smallest unit and
  measure before attributing a cause.** Decompose, don't rationalize.
- **Trust only unbiased, complete metrics**; **hold out a test set** for any generalization
  claim, preferring the official split. A directionally-adverse signal — even within noise at
  tiny n — is a hypothesis to test at scale, not noise to wave off.
- After the run starts, re-verify these once the first results land; record any failure mode
  in `PITFALLS.md`.

## Claim & Memory Discipline

Run Discipline (above) keeps results trustworthy when you PRODUCE them. This keeps
them trustworthy when you later RETRIEVE and REPEAT them. The common failure: a
navigation doc or memory index says "X works / component Y carries it / +N points";
you glance at that one-liner and assert it — but it was a preliminary, correlational,
or already-overturned conclusion, and nothing in the line flagged that. Before stating
any experimental result:

- **Verify before asserting.** Before stating a number, a per-component contribution,
  or an "X beats Y" conclusion, open the source under `experiment_records/` (or the raw
  result/log) and cite it. Root docs (`PROJECT.md`, `exp.md`) and memory index lines are
  POINTERS, not evidence — a glance at a summary line is not verification. If you cannot
  point to where a claim came from, grep / re-derive it, or say you have not checked.
- **Tag the strength of every quantitative claim.** When you record a result in a
  navigation doc or index, mark its evidential weight: `[correlational]` vs `[causal]`,
  `[1-seed, noisy]` vs `[3-seed]`, `[prelim, no sig test]` vs `[confirmed]`. A bare
  number reads as hard fact and gets repeated as one.
- **Reversal hygiene.** When a new result overturns a prior conclusion, PATCH the old
  entry in place — mark it ⚠️ SUPERSEDED and link the new evidence — do not only add a
  new entry elsewhere. Two contradictory pointers coexisting means whichever is read
  first wins, and the stale one gets repeated.
- **Correlational ≠ causal.** Attribution by association (vote/credit by co-occurrence,
  "this was present when it worked") is a hypothesis; a controlled ablation is the test.
  Never let a correlational summary stand in for the causal result.
