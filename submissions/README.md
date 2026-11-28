# Leaderboard submissions

This folder holds the submitted entries of the validation set leaderboard. An entry is one model under one harness, evaluated on the 400 validation tasks of a release. Each entry is one score file:

```text
submissions/<release>/<entry>.json        for example submissions/v1.1.0/my_model-bare.json
submissions/reference/<release>.validation.json   what a score file is checked against
```

The leaderboard on the site is the baselines of the paper plus the score files in this folder. Every entry names who ran its evaluation: the baselines, and any other entry the maintainers add themselves, carry the submitter "MultiVerse admin". `scripts/build_board.py` puts them together whenever the site is built, so merging a score file is all it takes to add an entry.

## How to submit

Submissions are made with the `multiverse submit` command of the [code repository](https://github.com/google-deepmind/MultiVerse). Its [submission guide](https://github.com/google-deepmind/MultiVerse/blob/main/docs/leaderboard-submission.md) has the details. In short:

1. Evaluate the model on the four task settings of the validation set (ST, IF, MT, MTIF) with `multiverse eval`, with the default user simulator, verifier, and limit on model calls, from committed code.
2. Run `multiverse submit` on the four finished evaluations. It checks them and writes two files: the score file, and a trajectory archive with the trajectory and the verifier votes of every task.
3. Run it again with `--publish`. It uploads the trajectory archive, or takes the public address you uploaded it to, and opens a pull request here that adds the score file.

The pull request is checked automatically and the result is posted as a comment. A maintainer then merges it, and the site is rebuilt with the new entry.

## What is checked

The same checks run in `multiverse submit` and on the pull request (`scripts/check_submission.py`, with the format in `scripts/submission_format.py`):

- The pull request adds or changes score files only, each named after its entry.
- The run used the released task files of the release (by their sha256), the API version, the user simulator, the verifier with three votes, and the limit on model calls that the baselines used, and came from committed code.
- The limit on one model request is a setting of `multiverse eval` (240 seconds by default; a slow self-hosted model may need more). It is not fixed for a submission: the score file lists the limits its cases ran under, the check confirms them against the trajectories, and the comment on the pull request shows them.
- The score file has a result for each of the 400 validation tasks and for no other task, with the task's own setting.
- Every check that applies to a task has a verdict. Which checks apply is a property of the task, so a failed check cannot be reported as not applicable.
- A task counts as passed exactly when the final assertion and the DB-level check pass and no other applicable check fails. The summary equals the counts of the task results.
- The trajectory archive at the given address is the file the score file names by sha256. For every task, the verifier votes in the archive give the verdicts in the score file.
- The entry does not collide with a baseline or with another submission.

A score file names a page about its model: the developer's page or announcement of the model, its model card, or its paper, whichever represents the model best. The name of the model on the leaderboard links to it. The pages of the baseline models are in `src/data/model-links.json`.

A score file states the settings its run was made under that can affect the result: the settings of the action model as the result files record them (the model and its provider, the context window and the limits on input and output tokens, sampling and temperature, the reasoning effort or budget, and the route of the requests), and which message carried the developer instructions. For a self-hosted model it also states how the model was served, where the run recorded it: the model files and their revision, the quantization, the parsers for tool calls and reasoning, and the version of the server. Cases that ran under other settings, for example with a larger context window, are listed apart with their number of tasks, and the check confirms the list against the trajectory archive.

The leaderboard keeps a row short. The ℹ️ mark after the name of a model opens the run details of the entry: these settings, and who submitted it. A ⚠️ mark before the name says that the run differs from the default, and the run details say how: tasks were run again after a scored result, the developer instructions were not in the system message, or some tasks ran under different model settings than the rest of the entry (for example with a larger context window). The limit on one model request is shown in the run details and raises no mark.

For every task the score file also counts the attempts in its evaluation: those that reached a score and those that were skipped for an infrastructure failure. Retrying a skipped case is part of a normal run. A task with more than one scored attempt was run again after it had a result; the newest result is the one submitted. The comment on the pull request shows both totals, and the run details of the entry on the leaderboard show them too. The counts come from the submitter's own run records, like the scores.

The scores are the submitter's own: the run is not repeated. The checks establish that the numbers follow from the published trajectories and verifier votes, and the trajectory archive lets anyone inspect them.

## For maintainers

- Read the comment of the check on the pull request. It lists the entry, its success rates, and the paths in which the code of the run differs from the public code. A submission of a new model normally differs by its model configuration only.
- Merge the pull request when the check passes and the entry is in order. The merge starts the deployment (`.github/workflows/deploy.yml`), which checks every score file again and rebuilds the leaderboard.
- To withdraw an entry, remove its score file. To correct one, the submitter runs `multiverse submit --publish` again: the pull request then changes the existing file.
- `python3 scripts/check_submission.py` checks every committed score file, including its trajectory archive; `npm run validate:submissions` checks them without the download and builds the board.

`submissions/reference/<release>.validation.json` is written by `scripts/export_submission_reference.py` from the exported tasks and the runs of the baselines. The code repository ships a copy of it and of `scripts/submission_format.py`; the two copies of each file must stay identical.
