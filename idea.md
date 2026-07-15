# Euno: Human CRM

A place that brings people you already met in your life back to you and strengthens your connections -- your internal network.

Not a sales CRM. A personal memory layer over the people of your life.

## Core loop (the heart)

Search and find people based on what you remember.
You bring a fragment ("the piano guy from the residency", "healthcare founder from Ship Week", "my college roommate's cofounder") and Euno finds the person.

## V1 decisions so far

- Back catalog: import existing contacts, whole graph searchable from day one.
- Enrichment v1: keep it simple -- the user can add context to each person by hand. That's it.
- Consent story shifts from "ask before saving" (capture era) to "you invited the import" (memory era).

## Enrichment ideas (beyond v1)

Four ways thin imported contacts can become rich, searchable memories:

1. Enrich on touch (V1 -- shipping this)
   Whenever you search for or open someone, add context in one line ("college roommate, now at Stripe").
   Memory deepens exactly where you care. No busywork.

2. Proactive interview
   Euno works through the imported list over time and asks a few people a day, skippable:
   "Who is Jason Wu -- where do you know him from?"
   Builds coverage without waiting for searches.

3. Automatic context mining
   With consent, cross-reference calendar history, photo metadata, or email/message metadata
   to guess context ("appears in 4 events with you in 2024"), then the user confirms.
   Fastest coverage, biggest privacy surface.

4. Rich capture for new people only
   Old contacts stay thin; the existing Friendy / tinder-for-old-friends loops keep doing
   rich capture for everyone met from now on.

## Prior experiments in this repo

- Friendy: passive capture (macOS contact adds + calendar), confirm and search over iMessage.
- tinder-for-old-friends: active capture (event screenshots), Keep/Forget swipe triage, mobile.

Both proved out the same primitives: event anchor, pending person, human consent gate,
relationship memory, natural-language recall. The human CRM is the umbrella they grow into.
