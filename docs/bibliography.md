# Research bibliography: LLM-as-judge bias controls

*Every entry was verified against its primary source (arXiv abstract page / official
proceedings) on 2026-06-13 and is tagged `[VERIFIED]`. Two candidate IDs/titles were
corrected during verification (flagged inline). Where a specific mechanism lives in the
paper body rather than the abstract, that is noted — cite the body for those.*

This bibliography backs the three controls in [`findings.md`](findings.md):
**(1) position-swap · (2) verbosity-norm · (3) stake-free / panel judge.**

---

## Control #1 — position / order bias → position-swap

### [zheng2023mtbench] — MT-Bench / Chatbot Arena `[VERIFIED]`
- **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena** — Zheng, Chiang, Sheng, et al.
- NeurIPS 2023 Datasets & Benchmarks — https://arxiv.org/abs/2306.05685
- Quote: *"we examine the usage and limitations of LLM-as-a-judge, including position, verbosity, and self-enhancement biases, as well as limited reasoning ability."*
- **Backs #1 and #2 — anchor paper.** Names all three biases; reports GPT-4 reaches **>80% agreement with humans (≈ human–human agreement)**. Position-bias fix = the **swap**: judge each pair in both orders, count a win only if consistent across orderings, else tie. *Mechanism lives in the paper body, not the abstract.*

### [wang2023fair] — LLMs are not Fair Evaluators `[VERIFIED]`
- **Large Language Models are not Fair Evaluators** — Wang, Li, Chen, et al.
- 2023 (later ACL 2024) — https://arxiv.org/abs/2305.17926
- Quote: *"The quality ranking of candidate responses can be easily hacked by simply altering their order of appearance in the context."*
- **Backs #1.** Order alone flipped rankings (Vicuna-13B beat ChatGPT on 66/80 queries by reordering). Three named fixes: **Multiple Evidence Calibration** (reason before scoring), **Balanced Position Calibration** (evaluate both orders and average — the formal version of our control), **Human-in-the-Loop Calibration** (position-diversity entropy flags ambiguous pairs).

### [shi2024position] — Judging the Judges `[VERIFIED]`
- **Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge** — Shi, Ma, Liang, Diao, Ma, Vosoughi (Dartmouth)
- 2024 → AACL-IJCNLP 2025 — https://arxiv.org/abs/2406.07791
- Quote: *"Position bias is strongly affected by the quality gap between solutions."*
- **Backs #1 — best source for metrics.** 15 judges × ~40 generators × 22 tasks = >150k instances. Three reusable metrics: **Repetition Stability**, **Position Consistency**, **Preference Fairness**.

---

## Control #2 — verbosity / length bias → verbosity-norm

### [dubois2024lc] — Length-Controlled AlpacaEval `[VERIFIED]`
- **Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators** — Dubois, Galambosi, Liang, Hashimoto *(title corrected — candidate list omitted the subtitle)*
- COLM 2024 — https://arxiv.org/abs/2404.04475
- Quote: *"Even simple, known confounders such as preference for longer outputs remain in existing automated evaluation metrics."*
- **Backs #2 — strongest citation.** Fits a **GLM (logistic regression)** predicting the annotator's preference with **length-difference as a mediator**, then reports the **counterfactual win-rate at zero length difference**. Directly copyable, runnable length-debias.

### [feuer2024style] — Style Outweighs Substance `[VERIFIED]`
- **Style Outweighs Substance: Failure Modes of LLM Judges in Alignment Benchmarking** — Feuer, et al.
- 2024 → ICLR 2025 — https://arxiv.org/abs/2409.15268
- Quote: *"LLM-judges have powerful implicit biases, prioritizing style over factuality and safety."*
- **Backs #2 — motivation.** Canonical "style over substance" evidence: judges reward presentation (including length/verbosity) over correctness.

---

## Control #3 — self-preference / single-judge bias → stake-free panel

### [verga2024poll] — PoLL `[VERIFIED]`
- **Replacing Judges with Juries: Evaluating LLM Generations with a Panel of Diverse Models** — Verga, Hofstätter, Althammer, et al. (Cohere) *(title corrected — not "...Panel of LLM evaluators")*
- 2024 — https://arxiv.org/abs/2404.18796
- Quote: *"using a PoLL composed of a larger number of smaller models outperforms a single large judge."*
- **Backs #3 — direct citation.** A panel of smaller models from **different families** beats a single large judge, **reduces intra-model (self-preference) bias**, and runs **>7× cheaper**.

### [wataoka2024selfpref] — Self-Preference Bias `[VERIFIED]`
- **Self-Preference Bias in LLM-as-a-Judge** — Wataoka, Takahashi, Ri (SB Intuitions)
- NeurIPS 2024 Safe Generative AI Workshop — https://arxiv.org/abs/2410.21819
- Quote: *"the self-preference bias exists because LLMs prefer texts more familiar to them"* (lower perplexity)
- **Backs #3.** Quantifies self-preference and ties it to familiarity/perplexity (not just literal self-recognition) — motivates cross-family panel diversity.

### [chan2023chateval] — ChatEval `[VERIFIED]`
- **ChatEval: Towards Better LLM-based Evaluators through Multi-Agent Debate** — Chan, Chen, Su, et al.
- 2023 → ICLR 2024 — https://arxiv.org/abs/2308.07201
- Quote: *"best practices of human evaluation processes often involve multiple human annotators collaborating in the evaluation."*
- **Backs #3 (panel/debate).** Multi-agent "referee team." `[INFERRED — confirm in body]` the role-diversity result (diverse personas beat homogeneous) is in the ablations, not the abstract.

### [du2023debate] — Multiagent Debate `[VERIFIED]`
- **Improving Factuality and Reasoning in Language Models through Multiagent Debate** — Du, Li, Torralba, Tenenbaum, Mordatch
- ICML 2024 (PMLR v235, pp. 11733–11763; confirmed via proceedings.mlr.press/v235/du24e.html) — https://arxiv.org/abs/2305.14325
- Quote: *"Our approach may be directly applied to existing black-box models and uses identical procedure and prompts for all tasks we investigate."*
- **Backs the debate substrate** (society-of-minds consensus loop) — frame as the mechanism, with PoLL as the judging-bias evidence.

---

## Cross-cutting — validity of the judge itself

### [liu2023geval] — G-Eval `[VERIFIED]`
- **G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment** — Liu, Iter, Xu, Wang, Xu, Zhu (Microsoft)
- EMNLP 2023 — https://arxiv.org/abs/2303.16634
- Quote: *"Recent studies suggest using large language models (LLMs) as reference-free metrics for NLG evaluation..."*
- **Backs methodology.** CoT + form-filling judging; **Spearman 0.514 with humans** on summarization (a concrete correlation target). Also flags the judge's bias toward LLM-generated text.

---

## Corrections carried from verification

1. **PoLL** title is *"...Panel of **Diverse Models**"*, not "...Panel of LLM evaluators."
2. **MT-Bench** and **ChatEval** *mechanism* specifics (swap rule, role-diversity) are in
   the paper bodies, not the abstracts — cite the body for those exact claims.
3. **Du et al.** venue confirmed as **ICML 2024** (PMLR v235), not ICLR.
