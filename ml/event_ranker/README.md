# Operational event ranker

This isolated offline project trains the small model used to rank already-safe
event candidates. Production does not run Python and does not make a network
request: it loads the exported integer artifact and evaluates it in TypeScript.

From the application root:

```bash
pnpm ml:event-data
pnpm ml:event-train
```

The dataset generator uses production personas, event templates, Risk Analyzer,
parameter bounds, impact estimator, and Runtime Balance safety gates. The v1
label is a versioned weak-supervision policy emphasizing a difficulty-appropriate
challenge, meaningful choice separation, relevance, novelty, and recoverability.
Rows are split by matched seed, so candidates from one query never leak between
training and validation.

The trainer uses deterministic pairwise logistic regression with L2
regularization and exports quantized integer coefficients. Replace the weak
labels with multi-policy counterfactual rollout utility as the event catalog
grows; the production feature and artifact contracts do not need to change.

