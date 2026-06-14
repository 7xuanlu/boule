# Bias controls reference

Three structural controls are applied at judging time to reduce known LLM-as-judge biases. Each is measured in `eval/` with an off-vs-on comparison.

## Position-swap

**Mechanism:** Candidates are presented to the judge in a counterbalanced (randomized) order. A verdict counts as a win only if consistent across both orderings; inconsistent pairs are scored as ties. This neutralizes the judge's tendency to favor whichever candidate appears first.

Sources: Zheng et al. 2023 (MT-Bench / Chatbot Arena, arXiv:2306.05685); Wang et al. 2023 (arXiv:2305.17926); Shi et al. 2024 (arXiv:2406.07791).

## Verbosity-normalization

**Mechanism:** The judge is instructed to weigh substance only and ignore length, formatting, and style. Length-difference is treated as a confound, not a signal. This counters documented preference for longer or more polished outputs independent of correctness.

Sources: Dubois et al. 2024 (Length-Controlled AlpacaEval, arXiv:2404.04475); Feuer et al. 2024 (arXiv:2409.15268).

## Stake-free judge

**Mechanism:** The synthesizer/judge is a structural non-participant, it authored none of the candidate answers and has no position to defend. Candidate identities are hidden. This eliminates self-preference bias, which arises when a judge evaluates its own outputs (lower perplexity → inflated preference).

Sources: Verga et al. 2024 (PoLL, arXiv:2404.18796); Wataoka et al. 2024 (arXiv:2410.21819).

---

These three controls map directly to the measurements in `eval/`: each control has a corresponding off-vs-on ablation that quantifies its effect on verdict consistency.
