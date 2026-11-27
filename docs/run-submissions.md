# Model and harness entries in the run viewer

The viewer reads `public/data/v1.1.0/runs/index.json` (schema version `1`).
The index is for the `validation` split of `v1.1.0`. It must not contain hidden
test tasks.

Each item in `models` identifies one submission, with one scored run per
submitted task. An entry given as a plain string uses that string as both its
storage key and its base model id, and takes the top-level `harness`. An entry
given as an object names its own harness:

```json
{
  "schemaVersion": 1,
  "release": "v1.1.0",
  "split": "validation",
  "harness": "bare",
  "models": [
    "gpt_5_6_sol",
    {
      "id": "gpt_5_6_sol-hermes",
      "modelId": "gpt_5_6_sol",
      "harness": "hermes",
      "name": "GPT 5.6 Sol"
    }
  ],
  "verifiers": ["assertion", "dbdiff", "response", "instruction"],
  "cells": { "TASK_ID": ["Pppnn", null] },
  "terminations": {}
}
```

- `id` must be unique across submissions. Keep it stable: it identifies the
  storage directory, matrix column, trajectory selection and deep link.
- `modelId` identifies the base model. Different harness entries can share it.
- `harness` must match the run files exactly. Known harness ids use the display
  names in the source results; custom harness names are displayed unchanged.
- `name` optionally overrides the base model's displayed name. It does not
  change either identity.
- Each task's `cells` array follows `models` order. A code contains the overall
  `P`/`F` outcome followed by four `p`/`f`/`n` verifier results in `verifiers`
  order. `n` means not applicable, not missing.
- Use `null` for an unsubmitted task/entry pair. Omitted trailing slots and an
  absent task row are also unavailable. Never remove an interior slot and shift
  later entries. Missing submissions are not failures and do not count toward
  the number of scored runs.
- Non-completed termination reasons are keyed by task id and **entry id** in
  `terminations`. An early termination does not override the scored outcome.

A submitted run is stored at `runs/<entry.id>/<taskId>.json.gz`. Its JSON keeps
the base `modelId`, plus the matching `taskId` and `harness`. The loader checks
all three before displaying it. The verifier and trajectory fields are the same
for every run. Links use
`?release=v1.1.0#task=<taskId>&section=trajectories&model=<entry.id>`.

The TypeScript reader normalizes these entries to `RunModel`, whose `id` is the
submission key and whose `modelId` and `harness` preserve the source identities.
`RunIndex.cell(taskId, entryId)` returns `undefined` when a result is unavailable;
`scoredCount(taskId)` and `passedCount(taskId)` count submitted results only.

This describes what the viewer reads. `scripts/export_runs.py` writes and
checks the runs of the baselines under the bare harness, and it replaces the
whole runs directory: an export that adds submissions has to write every
submission, because files added by hand do not survive it.
