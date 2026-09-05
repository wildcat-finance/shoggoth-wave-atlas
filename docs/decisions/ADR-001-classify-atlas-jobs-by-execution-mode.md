# ADR-001: Classify Atlas jobs by execution mode

## Status

Accepted, 2026-09-05

## Context

The Atlas used one ready pool and generated a Fiat prompt for every selectable
Skills issue. Issue bodies now distinguish work that needs a Fiat run from work
that needs an ordinary pull request. Treating both alike can invoke a delivery
controller where none is required. Some issues do not contain a usable marker;
hiding them would make the data fault harder to repair, while guessing from a
title, label, wave, or apparent complexity would create execution authority
that the issue did not grant.

This changes the public job interface. Existing clients cannot safely infer
whether an old response carries the new selection guarantee.

## Decision

The Atlas reads one exact issue-body field. `Fiat-Required: 1` means `fiat`, and
`Fiat-Required: 0` means `pull_request`. A missing field, more than one field,
or any other value means `invalid`.

Fiat and pull-request issues remain selectable only when they are open and all
recorded hard dependencies are closed. Invalid issues remain visible in waves,
the dependency graph, the pick-up desk, and the API, but are never selected or
sent through a provider redirect.

The public API advances to `wildcat-wave-job/v3`. It reports the execution mode
on each valid job, provides distinct ready counts, exposes invalid issues and
their reason, and accepts `kind=fiat` or `kind=pull_request`. Its prompt is
specific to the selected mode.

## Alternatives

Use GitHub labels. Rejected because the field already lives with the issue
instructions and a second mutable metadata surface could disagree with it.

Infer the mode from the queue, title, wave, or work complexity. Rejected because
those are not an explicit grant to run Fiat or to bypass it.

Keep API v2 and vary its prompts silently. Rejected because existing clients
would receive different execution semantics without a schema change.

Drop invalid issues from the Atlas. Rejected because invisible metadata faults
cannot be distinguished from missing work and are less likely to be repaired.

## Consequences

Issue authors must keep exactly one valid `Fiat-Required` field. Clients can
choose one execution pool and can display invalid records without treating them
as jobs. Any future change to the field syntax or selection meaning requires an
explicit interface decision and, when compatibility changes, another schema
version.
