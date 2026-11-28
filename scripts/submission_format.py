# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Format of a leaderboard submission, and the checks that accept one.

A submission is two files:

  * a score file (JSON): who submits which model under which harness, the
    settings of the run, and for each validation task whether the run passed
    and the verdict of every check;
  * a trajectory archive (tar.gz): for each task, the result file of the run
    without the database states.

`multiverse submit` writes both from finished evaluations, and the leaderboard
repository runs the same checks on a submitted score file. This module is
therefore kept identical in both repositories and uses only the Python
standard library.

The format is described in docs/leaderboard-submission.md.
"""

from __future__ import annotations

import datetime
import gzip
import hashlib
import io
import json
import re
import tarfile
from typing import Any
from typing import Callable
from typing import Iterator

FORMAT = "multiverse-leaderboard-submission"
SCHEMA_VERSION = 1
# The version of the result files a trajectory archive is built from.
RESULT_SCHEMA_VERSION = 1

SETTINGS = ("ST", "IF", "MT", "MTIF")
HARNESSES = ("bare", "hermes", "opencode", "openhands", "openclaw")
BARE_HARNESS = "bare"
ACCESS = ("open", "closed")

# The checks of a case, under the names the result files use.
FINAL_ASSERTION = "final_assertion"
VERIFIERS = ("dblevel", "inspection", "rubrics")
CHECKS = (FINAL_ASSERTION, *VERIFIERS)
# A case passes when these pass and no other applicable check fails.
REQUIRED_CHECKS = (FINAL_ASSERTION, "dblevel")
PASS, FAIL, NOT_APPLICABLE = "pass", "fail", "not_applicable"
VERDICTS = (PASS, FAIL, NOT_APPLICABLE)

MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_MEMBER_BYTES = 64 * 1024 * 1024
MAX_UNPACKED_BYTES = 4 * 1024 * 1024 * 1024
# The limit the leaderboard repository puts on a submitted score file.
MAX_SCORE_FILE_BYTES = 2 * 1024 * 1024
# A longer list of changed paths ends with one entry that counts the rest.
MAX_CHANGED_PATHS = 500
# The settings of the action model that a submission states, under the names
# the result files use (`multiverse_inference_identity.action_model_behavior`).
# They decide what the model is asked to do, so a reader needs them to compare
# two entries: the limits on input and output, sampling, reasoning, and the
# route the requests take.
MODEL_SETTING_FIELDS = (
    "name",
    "provider",
    "transport",
    "context_window",
    "max_input_tokens",
    "max_tokens",
    "supports_sampling",
    "default_temperature",
    "supports_thinking",
    "thinking_level",
    "thinking_contract",
    "thinking_budget_tokens",
    "whole_toolset_discovery",
    "openrouter_provider_pin",
    "openrouter_quantization_pin",
    "vllm_profile",
)
# Which message carries the developer instructions of a task.
INSTRUCTION_PLACEMENTS = ("system", "user")
# The attempts of a task that a score file counts: those that reached a
# score, and those that were skipped for an infrastructure failure.
ATTEMPT_KINDS = ("scored", "skipped")
MAX_ATTEMPTS = 1000
# The limit on one model request, in seconds: the one a case ran under when
# its result file states none, and the range a stated one lies in.
DEFAULT_MODEL_CALL_TIMEOUT_SECONDS = 240
MIN_MODEL_CALL_TIMEOUT_SECONDS = 1
MAX_MODEL_CALL_TIMEOUT_SECONDS = 3600

_SHA256 = re.compile(r"[0-9a-f]{64}")
_COMMIT = re.compile(r"[0-9a-f]{40}")
_MODEL_ID = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")
_TASK_ID = re.compile(r"[a-z0-9]{8,64}")
_TERMINATION = re.compile(r"[a-z][a-z0-9_]{0,63}")
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_UTC_TIME = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z")
_SAMPLE_ID = re.compile(r"\d+_(?P<task>[a-z0-9]+)")

# The fields of a result file that a trajectory archive keeps. The database
# states (most of a result file) and the copies of the task are left out.
TRAJECTORY_FIELDS = (
    "schema_version",
    "task_id",
    "setting",
    "sample_id",
    "model_name",
    "agent",
    "api_version",
    "user_simulator_model",
    "verifier_model",
    "scored_at",
    "contamination_canary",
    "model_logs",
    "final_response_text",
    "termination_reason",
    "number_of_model_calls",
    "number_of_api_calls",
    "number_of_turns",
    "agent_token_usage",
    "time_taken_minutes",
    "model_call_timeout_seconds",
    "developer_instruction_placement",
    "action_model_behavior",
    "db_diff",
    "final_assertion_outcome",
    "final_assertion_errors",
    "assertion_failing_line",
    "setup_errors",
    "autorater_dimension_status",
    "autorater_votes",
    *(
        f"autorater_{verifier}_{suffix}"
        for verifier in VERIFIERS
        for suffix in ("outcome", "result", "majority_pass")
    ),
)
# The fields of a trajectory message that are kept, by message type. A model
# message also gets `reasoning_text`: the reasoning its provider returned
# outside `content`, as text.
MESSAGE_FIELDS = {
    "system": ("content",),
    "human": ("content",),
    "ai": ("content", "tool_calls", "usage_metadata", "finish_reason"),
    "tool": ("content", "tool_call_id", "name"),
}
CONTENT_BLOCK_FIELDS = {
    "text": ("type", "text"),
    "thinking": ("type", "thinking"),
    "tool_use": ("type", "id", "name", "input"),
}
TOOL_CALL_FIELDS = ("id", "name", "args")
REASONING_TEXT = "reasoning_text"


class SubmissionError(ValueError):
  """A result that cannot be part of a submission."""


def sha256_hex(data: bytes) -> str:
  """Return the sha256 of bytes as lowercase hexadecimal."""
  return hashlib.sha256(data).hexdigest()


def canonical_json(value: Any) -> bytes:
  """Return the one byte form of a JSON value that hashes refer to.

  ASCII with sorted keys and no spaces. Characters outside ASCII are written
  as escapes, so text that is not valid Unicode (a lone surrogate from a
  model's output) has a byte form too.
  """
  return json.dumps(
      value, ensure_ascii=True, sort_keys=True, separators=(",", ":")
  ).encode("ascii")


def model_id_of(name: str) -> str:
  """Return the identifier of a model: its name in lowercase with underscores."""
  return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")


def entry_id_of(model_id: str, harness: str) -> str:
  """Return the identifier of an entry: a model under a harness."""
  return f"{model_id}-{harness}"


def task_id_of(sample_id: Any) -> str | None:
  """Return the task of a sample id (`NNNNN_<task_id>`), if it has that form."""
  match = _SAMPLE_ID.fullmatch(str(sample_id))
  return match.group("task") if match else None


# ---------------------------------------------------------------------------
# One case: from a result file to its verdicts and its archive member.
# ---------------------------------------------------------------------------


def _majority(record: dict, verifier: str) -> bool | None:
  """Return the strict majority of a verifier's votes, or None without one."""
  outcomes = []
  votes = record.get("autorater_votes")
  for vote in votes if isinstance(votes, list) else []:
    part = vote.get(verifier) if isinstance(vote, dict) else None
    if isinstance(part, dict) and isinstance(part.get("outcome"), bool):
      outcomes.append(part["outcome"])
  passed = sum(outcomes)
  if not outcomes or passed * 2 == len(outcomes):
    return None
  return passed * 2 > len(outcomes)


def verifier_vote_count(record: dict, verifier: str) -> int:
  """Return how many votes of a verifier a result file holds.

  A vote is a pass with a verdict, as in `_majority`: a pass that reached no
  verdict does not count towards the required number of votes.
  """
  votes = record.get("autorater_votes")
  return sum(
      1
      for vote in (votes if isinstance(votes, list) else [])
      if isinstance(vote, dict)
      and isinstance(vote.get(verifier), dict)
      and isinstance(vote[verifier].get("outcome"), bool)
  )


def case_verdicts(record: dict) -> dict[str, str]:
  """Return the verdict of every check of a scored case.

  Raises SubmissionError for a case that is skipped, that has a check without
  a verdict, or whose recorded verdict differs from the majority of its votes.
  """
  if record.get("skipped"):
    raise SubmissionError("the case is skipped, not scored")
  final = record.get("final_assertion_outcome")
  if not isinstance(final, bool):
    raise SubmissionError("the final assertion has no verdict")
  verdicts = {FINAL_ASSERTION: PASS if final else FAIL}
  status = record.get("autorater_dimension_status")
  if not isinstance(status, dict):
    raise SubmissionError("the case has no verifier status")
  for verifier in VERIFIERS:
    state = status.get(verifier)
    outcome = record.get(f"autorater_{verifier}_outcome")
    if state == "not_applicable":
      if outcome is not None:
        raise SubmissionError(f"{verifier} does not apply but has a verdict")
      verdicts[verifier] = NOT_APPLICABLE
    elif state == "scored" and isinstance(outcome, bool):
      if _majority(record, verifier) is not outcome:
        raise SubmissionError(
            f"the verdict of {verifier} is not the majority of its votes"
        )
      verdicts[verifier] = PASS if outcome else FAIL
    else:
      raise SubmissionError(f"{verifier} has no verdict (status {state!r})")
  return verdicts


def case_passed(verdicts: dict[str, str]) -> bool:
  """Apply the pass rule: required checks pass, and no other check fails."""
  return all(verdicts[check] == PASS for check in REQUIRED_CHECKS) and all(
      verdicts[check] != FAIL for check in CHECKS
  )


def _count(value: Any) -> int | None:
  return value if type(value) is int and value >= 0 else None


def _setting_value(value: Any) -> bool:
  if value is None or type(value) in (bool, int):
    return True
  if type(value) is float:
    return value == value and abs(value) != float("inf")
  if isinstance(value, str):
    return len(value) <= 200 and value.isprintable()
  return (
      isinstance(value, list)
      and len(value) <= 16
      and all(
          isinstance(item, str) and 0 < len(item) <= 200 and item.isprintable()
          for item in value
      )
  )


def is_model_settings(value: Any) -> bool:
  """Whether a value states settings of an action model, and only those."""
  return (
      isinstance(value, dict)
      and all(key in MODEL_SETTING_FIELDS for key in value)
      and all(_setting_value(item) for item in value.values())
  )


def model_settings_of(record: dict) -> dict:
  """Return the action model settings that a result file records.

  The settings with a value, in the order of MODEL_SETTING_FIELDS. A result
  file records them in its inference identity; a trajectory record carries
  them as `action_model_behavior`.
  """
  identity = record.get("multiverse_inference_identity")
  behavior = (
      identity.get("action_model_behavior")
      if isinstance(identity, dict)
      else record.get("action_model_behavior")
  )
  behavior = behavior if isinstance(behavior, dict) else {}
  return {
      field: behavior[field]
      for field in MODEL_SETTING_FIELDS
      if behavior.get(field) is not None
  }


def settings_groups(counts: dict[str, int]) -> list[dict]:
  """Return the settings of a run as a score file lists them.

  `counts` maps settings, as canonical JSON text, to their number of tasks.
  The result has one entry per distinct settings, the most frequent first.
  """
  return [
      {"tasks": number, "settings": json.loads(text)}
      for text, number in sorted(
          counts.items(), key=lambda item: (-item[1], item[0])
      )
  ]


def _group_counts(groups: list[dict]) -> dict[str, int]:
  counts: dict[str, int] = {}
  for group in groups:
    key = canonical_json(group["settings"]).decode("ascii")
    # Two entries with the same settings are one entry too many.
    counts[key] = -1 if key in counts else group["tasks"]
  return counts


def is_model_call_timeout(value: Any) -> bool:
  """Whether a value is a limit on one model request, in whole seconds."""
  return (
      type(value) is int
      and MIN_MODEL_CALL_TIMEOUT_SECONDS
      <= value
      <= MAX_MODEL_CALL_TIMEOUT_SECONDS
  )


def model_call_timeout_of(record: dict) -> int | None:
  """Return the limit on one model request that a case ran under.

  A result file that states none ran under the default. Returns None for a
  stated value that is not a limit.
  """
  stated = record.get("model_call_timeout_seconds")
  if stated is None:
    return DEFAULT_MODEL_CALL_TIMEOUT_SECONDS
  return stated if is_model_call_timeout(stated) else None


def task_entry(record: dict, setting: str, member: bytes) -> dict:
  """Return the entry of one task in a score file.

  `record` is the case as the archive holds it and `member` its bytes there.
  """
  verdicts = case_verdicts(record)
  return {
      "setting": setting,
      "passed": case_passed(verdicts),
      "checks": verdicts,
      "termination": str(record.get("termination_reason") or "unknown"),
      "model_calls": _count(record.get("number_of_model_calls")),
      "tool_calls": _count(record.get("number_of_api_calls")),
      "turns": _count(record.get("number_of_turns")),
      "trajectory_sha256": sha256_hex(member),
  }


def _kept_block(block: Any, dropped: dict[str, int]) -> Any:
  if not isinstance(block, dict):
    return block if isinstance(block, str) else None
  kind = block.get("type")
  fields = CONTENT_BLOCK_FIELDS.get(kind) if isinstance(kind, str) else None
  if fields is None:
    key = f"content block of type {kind!r}"
    dropped[key] = dropped.get(key, 0) + 1
    return None
  return {field: block[field] for field in fields if field in block}


def _joined(texts: list) -> str:
  return "\n\n".join(
      text.strip() for text in texts if isinstance(text, str) and text.strip()
  )


def _reasoning_text(data: dict) -> str:
  """Return the reasoning a provider returned outside the message content.

  A provider can repeat the same reasoning in several fields, so the first
  field that has text is the one that is kept: `reasoning_details`, then the
  reasoning items of `responses_output`, then `summary`.
  """
  details = data.get("reasoning_details")
  text = _joined([
      item.get("text") or item.get("summary")
      for item in (details if isinstance(details, list) else [])
      if isinstance(item, dict)
  ])
  if text:
    return text
  output = data.get("responses_output")
  parts = []
  for item in output if isinstance(output, list) else []:
    if isinstance(item, dict) and item.get("type") == "reasoning":
      summary = item.get("summary")
      parts += summary if isinstance(summary, list) else []
  text = _joined([part.get("text") for part in parts if isinstance(part, dict)])
  if text:
    return text
  summary = data.get("summary")
  return _joined([
      item.get("text")
      for item in (summary if isinstance(summary, list) else [])
      if isinstance(item, dict)
  ])


def _kept_message(message: Any, dropped: dict[str, int]) -> dict | None:
  if not isinstance(message, dict):
    return None
  kind = message.get("type")
  fields = MESSAGE_FIELDS.get(kind) if isinstance(kind, str) else None
  data = message.get("data")
  if fields is None or not isinstance(data, dict):
    # The last entry of a trajectory is a summary that repeats the tool calls.
    if kind is not None:
      key = f"message of type {kind!r}"
      dropped[key] = dropped.get(key, 0) + 1
    return None
  kept = {}
  for field in fields:
    if field not in data:
      continue
    value = data[field]
    if field == "content" and isinstance(value, list):
      value = [
          block
          for block in (_kept_block(item, dropped) for item in value)
          if block is not None
      ]
    elif field == "tool_calls" and isinstance(value, list):
      value = [
          {key: call[key] for key in TOOL_CALL_FIELDS if key in call}
          for call in value
          if isinstance(call, dict)
      ]
    kept[field] = value
  if kind == "ai":
    reasoning = _reasoning_text(data)
    if reasoning:
      kept[REASONING_TEXT] = reasoning
  return {"type": kind, "data": kept}


def foreign_message_part(record: dict) -> str | None:
  """Name the first part of a trajectory that a trajectory record never has.

  A trajectory record holds messages of the known types with the kept fields
  only. Anything else was not written by `trajectory_record`.
  """
  logs = record.get("model_logs")
  if not isinstance(logs, list):
    return "model_logs is not a list"
  for at, message in enumerate(logs, start=1):
    if not isinstance(message, dict) or set(message) != {"type", "data"}:
      return f"message {at} is not a trajectory message"
    kind, data = message["type"], message["data"]
    fields = MESSAGE_FIELDS.get(kind) if isinstance(kind, str) else None
    if fields is None or not isinstance(data, dict):
      return f"message {at} has an unknown type"
    allowed = set(fields) | ({REASONING_TEXT} if kind == "ai" else set())
    extra = sorted(set(data) - allowed)
    if extra:
      return f"message {at} has the field {extra[0]!r}"
    content = data.get("content")
    for block in content if isinstance(content, list) else []:
      if isinstance(block, str):
        continue
      kind = block.get("type") if isinstance(block, dict) else None
      fields = CONTENT_BLOCK_FIELDS.get(kind) if isinstance(kind, str) else None
      if fields is None or set(block) - set(fields):
        return f"message {at} has a content block that is not kept"
    calls = data.get("tool_calls")
    for call in calls if isinstance(calls, list) else []:
      if not isinstance(call, dict) or set(call) - set(TOOL_CALL_FIELDS):
        return f"message {at} has a tool call with fields that are not kept"
  return None


def trajectory_record(
    record: dict, task_id: str, setting: str, dropped: dict[str, int]
) -> dict:
  """Return a result file as a trajectory archive holds it.

  Keeps the fields of TRAJECTORY_FIELDS and, of every message, the fields of
  MESSAGE_FIELDS. `dropped` counts the message parts of unknown types that
  were left out.
  """
  kept = {
      field: record[field] for field in TRAJECTORY_FIELDS if field in record
  }
  kept["task_id"] = task_id
  kept["setting"] = setting
  kept["action_model_behavior"] = model_settings_of(record)
  logs = record.get("model_logs")
  kept["model_logs"] = [
      message
      for message in (
          _kept_message(item, dropped)
          for item in (logs if isinstance(logs, list) else [])
      )
      if message is not None
  ]
  return kept


def member_name(entry_id: str, task_id: str) -> str:
  """Return the path of a task inside the trajectory archive."""
  return f"{entry_id}/{task_id}.json"


def write_archive(path: str, entry_id: str, members: dict[str, bytes]) -> None:
  """Write the trajectory archive with the same bytes for the same content."""
  with open(path, "wb") as raw:
    with gzip.GzipFile(
        filename="", fileobj=raw, mode="wb", compresslevel=6, mtime=0
    ) as zipped:
      with tarfile.open(
          fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT
      ) as archive:
        for task_id in sorted(members):
          info = tarfile.TarInfo(member_name(entry_id, task_id))
          info.size = len(members[task_id])
          info.mode = 0o644
          archive.addfile(info, io.BytesIO(members[task_id]))


def read_archive(fileobj, entry_id: str) -> Iterator[tuple[str, bytes]]:
  """Yield (task id, bytes) for every member of a trajectory archive.

  Reads the archive as a stream and never writes to disk. Raises
  SubmissionError for a member that is not a task file of this entry, or for
  an archive that unpacks to more than the limits allow.
  """
  prefix = f"{entry_id}/"
  total = 0
  try:
    with tarfile.open(fileobj=fileobj, mode="r|gz") as archive:
      for info in archive:
        name = info.name
        if (
            not info.isfile()
            or not name.startswith(prefix)
            or not name.endswith(".json")
            or "/" in name[len(prefix) :]
        ):
          raise SubmissionError(f"unexpected archive member {name!r}")
        if info.size > MAX_MEMBER_BYTES:
          raise SubmissionError(f"archive member {name!r} is too large")
        total += info.size
        if total > MAX_UNPACKED_BYTES:
          raise SubmissionError("the archive unpacks to too many bytes")
        data = archive.extractfile(info).read()
        yield name[len(prefix) : -len(".json")], data
  except (tarfile.TarError, EOFError, OSError) as error:
    raise SubmissionError(
        f"the trajectory archive cannot be read: {type(error).__name__}"
    ) from error


# ---------------------------------------------------------------------------
# The score file.
# ---------------------------------------------------------------------------


def _text(value: Any, limit: int) -> bool:
  return (
      isinstance(value, str)
      and 0 < len(value) <= limit
      and value == value.strip()
      and value.isprintable()
      and not any(mark in value for mark in "<>")
  )


def _url(value: Any) -> bool:
  return (
      isinstance(value, str)
      and len(value) <= 500
      and re.fullmatch(r"https://[^\s<>\"'\\]+", value) is not None
  )


def _keys(
    value: Any,
    where: str,
    required: tuple[str, ...],
    optional: tuple[str, ...],
    errors: list[str],
) -> bool:
  if not isinstance(value, dict):
    errors.append(f"{where} must be an object")
    return False
  missing = [key for key in required if key not in value]
  unknown = [key for key in value if key not in required + optional]
  if missing:
    errors.append(f"{where} lacks {', '.join(missing)}")
  if unknown:
    errors.append(f"{where} has unknown fields: {', '.join(sorted(unknown))}")
  return not missing and not unknown


def attempt_totals(tasks: dict[str, dict]) -> dict[str, int]:
  """Count the tasks that were run again, by the reason.

  `rerun_after_score`: tasks with more than one attempt that reached a score.
  `retried_after_skip`: tasks with an attempt that was skipped.
  """
  attempts = [
      task.get("attempts")
      for task in tasks.values()
      if isinstance(task, dict) and isinstance(task.get("attempts"), dict)
  ]
  return {
      "rerun_after_score": sum(
          1 for counts in attempts if (_count(counts.get("scored")) or 0) > 1
      ),
      "retried_after_skip": sum(
          1 for counts in attempts if (_count(counts.get("skipped")) or 0) > 0
      ),
  }


def summary_of(tasks: dict[str, dict]) -> dict[str, dict[str, int]]:
  """Count the passed and scored tasks per setting and over all of them."""
  summary = {
      name: {"passed": 0, "scored": 0} for name in ("Average", *SETTINGS)
  }
  for task in tasks.values():
    for name in ("Average", task.get("setting")):
      # A setting that is not text (a list, say) is no key of the summary.
      if isinstance(name, str) and name in summary:
        summary[name]["scored"] += 1
        summary[name]["passed"] += bool(task.get("passed"))
  return summary


def _check_entry(entry: Any, errors: list[str]) -> None:
  if not _keys(
      entry,
      "entry",
      ("id", "model", "harness", "submitter", "submitted_on"),
      (),
      errors,
  ):
    return
  model, submitter = entry["model"], entry["submitter"]
  if _keys(
      model,
      "entry.model",
      ("id", "name", "developer", "access"),
      ("url",),
      errors,
  ):
    if not is_model_id(model["id"]):
      errors.append(
          "entry.model.id must be lowercase letters, digits and underscores"
      )
    for field, limit in (("name", 60), ("developer", 60)):
      if not _text(model[field], limit):
        errors.append(
            f"entry.model.{field} must be 1 to {limit} printable characters"
        )
    if model["access"] not in ACCESS:
      errors.append("entry.model.access must be 'open' or 'closed'")
    if "url" in model and not _url(model["url"]):
      errors.append("entry.model.url must be an https address")
  if _keys(submitter, "entry.submitter", ("name",), ("url",), errors):
    if not _text(submitter["name"], 80):
      errors.append("entry.submitter.name must be 1 to 80 printable characters")
    if "url" in submitter and not _url(submitter["url"]):
      errors.append("entry.submitter.url must be an https address")
  if entry["harness"] not in HARNESSES:
    errors.append(f"entry.harness must be one of {', '.join(HARNESSES)}")
  elif isinstance(model, dict) and entry["id"] != entry_id_of(
      str(model.get("id")), entry["harness"]
  ):
    errors.append("entry.id must be '<entry.model.id>-<entry.harness>'")
  date = entry["submitted_on"]
  try:
    if not (isinstance(date, str) and _DATE.fullmatch(date)):
      raise ValueError
    datetime.date.fromisoformat(date)
  except ValueError:
    errors.append("entry.submitted_on must be a date as YYYY-MM-DD")


def check_entry(entry: Any) -> list[str]:
  """Return every reason the entry of a score file is not acceptable."""
  errors: list[str] = []
  _check_entry(entry, errors)
  return errors


def is_model_id(value: Any) -> bool:
  """Whether a value can identify a model: lowercase, digits, underscores."""
  return (
      isinstance(value, str)
      and _MODEL_ID.fullmatch(value) is not None
      and len(value) <= 64
  )


def _check_run(
    run: Any, harness: Any, reference: dict, errors: list[str]
) -> None:
  if not _keys(
      run,
      "run",
      (
          "api_version",
          "agent",
          "action_model",
          "user_simulator_model",
          "verifier_model",
          "verifier_votes",
          "max_model_calls_allowed",
          "model_call_timeout_seconds",
          "action_model_behavior",
          "developer_instruction_placement",
          "code",
          "datasets",
          "completed_at",
      ),
      ("resolved_model_name", "token_usage"),
      errors,
  ):
    return
  groups = run["action_model_behavior"]
  if not (
      isinstance(groups, list)
      and 0 < len(groups) <= 8
      and all(
          isinstance(group, dict)
          and set(group) == {"tasks", "settings"}
          and (_count(group["tasks"]) or 0) > 0
          and is_model_settings(group["settings"])
          for group in groups
      )
      and groups == settings_groups(_group_counts(groups))
  ):
    errors.append(
        "run.action_model_behavior must list the settings of the action model"
        " that the cases ran under, each with its number of tasks, the most"
        " frequent first"
    )
  if run["developer_instruction_placement"] not in INSTRUCTION_PLACEMENTS:
    errors.append(
        "run.developer_instruction_placement must be 'system' or 'user'"
    )
  limits = run["model_call_timeout_seconds"]
  if not (
      isinstance(limits, list)
      and 0 < len(limits) <= 8
      and all(is_model_call_timeout(limit) for limit in limits)
      and limits == sorted(set(limits))
  ):
    errors.append(
        "run.model_call_timeout_seconds must list, in ascending order, the"
        " limits on one model request that the cases ran under"
    )
  for field in (
      "api_version",
      "user_simulator_model",
      "verifier_model",
      "verifier_votes",
      "max_model_calls_allowed",
  ):
    if run[field] != reference[field] or type(run[field]) is not type(
        reference[field]
    ):
      errors.append(
          f"run.{field} is {run[field]!r}; the leaderboard requires"
          f" {reference[field]!r}"
      )
  expected_agent = "llm_agent" if harness == BARE_HARNESS else "harness_agent"
  if harness in HARNESSES and run["agent"] != expected_agent:
    errors.append(
        f"run.agent is {run['agent']!r}; the {harness} harness runs as"
        f" {expected_agent!r}"
    )
  if not _text(run["action_model"], 120):
    errors.append("run.action_model must name the model of the run")
  if "resolved_model_name" in run and not _text(
      run["resolved_model_name"], 200
  ):
    errors.append("run.resolved_model_name must be printable text")
  if not (
      isinstance(run["completed_at"], str)
      and _UTC_TIME.fullmatch(run["completed_at"])
  ):
    errors.append("run.completed_at must be a UTC time ending in Z")
  code = run["code"]
  if _keys(code, "run.code", ("commits", "dirty"), ("changed_paths",), errors):
    commits = code["commits"]
    if not (
        isinstance(commits, list)
        and 0 < len(commits) <= 16
        and all(
            isinstance(commit, str) and _COMMIT.fullmatch(commit)
            for commit in commits
        )
    ):
      errors.append("run.code.commits must list the commits of the run")
    if code["dirty"] is not False:
      errors.append(
          "run.code.dirty must be false: the run must come from committed code"
      )
    paths = code.get("changed_paths")
    if paths is not None and not (
        isinstance(paths, list)
        and len(paths) <= MAX_CHANGED_PATHS
        and all(_text(path, 300) for path in paths)
    ):
      errors.append("run.code.changed_paths must be a list of paths or null")
  datasets = run["datasets"]
  if not isinstance(datasets, dict) or tuple(sorted(datasets)) != tuple(
      sorted(SETTINGS)
  ):
    errors.append(f"run.datasets must have exactly {', '.join(SETTINGS)}")
  else:
    for setting in SETTINGS:
      expected = reference["datasets"][setting]["sha256"]
      if datasets[setting] != expected:
        errors.append(
            f"run.datasets.{setting} is not the released {setting} file of"
            f" {reference['release']} (expected sha256 {expected[:12]}...)"
        )
  usage = run.get("token_usage")
  if usage is not None and not (
      isinstance(usage, dict)
      and all(
          isinstance(key, str)
          and len(key) <= 40
          and (value is None or _count(value) is not None)
          for key, value in usage.items()
      )
      and len(usage) <= 12
  ):
    errors.append("run.token_usage must map names to token counts")


def _check_tasks(tasks: Any, reference: dict, errors: list[str]) -> None:
  if not isinstance(tasks, dict):
    errors.append("tasks must be an object keyed by task id")
    return
  expected = reference.get("tasks")
  if expected is not None:
    missing = sorted(set(expected) - set(tasks))
    extra = sorted(set(tasks) - set(expected))
    if missing:
      errors.append(
          f"{len(missing)} validation tasks have no result, for example"
          f" {missing[0]}"
      )
    if extra:
      errors.append(
          f"{len(extra)} results are not validation tasks of"
          f" {reference['release']}, for example {extra[0]!r}"
      )
  problems = 0
  for task_id, task in tasks.items():
    where = f"tasks.{task_id}"
    found = []
    if not (isinstance(task_id, str) and _TASK_ID.fullmatch(task_id)):
      found.append(f"{where}: not a task id")
    elif _keys(
        task,
        where,
        (
            "setting",
            "passed",
            "checks",
            "termination",
            "model_calls",
            "tool_calls",
            "turns",
            "trajectory_sha256",
            "attempts",
        ),
        (),
        found,
    ):
      checks = task["checks"]
      attempts = task["attempts"]
      if not (
          isinstance(attempts, dict)
          and set(attempts) == set(ATTEMPT_KINDS)
          and all(_count(number) is not None for number in attempts.values())
          and 1 <= attempts["scored"] <= MAX_ATTEMPTS
          and attempts["skipped"] <= MAX_ATTEMPTS
      ):
        found.append(
            f"{where}.attempts must count the scored attempts (at least 1)"
            " and the skipped attempts of the task"
        )
      if task["setting"] not in SETTINGS:
        found.append(f"{where}.setting is not a task setting")
      if not (
          isinstance(checks, dict)
          and len(checks) == len(CHECKS)
          and set(checks) == set(CHECKS)
          and all(verdict in VERDICTS for verdict in checks.values())
      ):
        found.append(
            f"{where}.checks must give {', '.join(CHECKS)} as pass, fail or"
            " not_applicable"
        )
      else:
        if any(checks[check] == NOT_APPLICABLE for check in REQUIRED_CHECKS):
          found.append(f"{where}: a required check has no verdict")
        if task["passed"] is not case_passed(checks):
          found.append(f"{where}.passed does not follow from its checks")
        known = (expected or {}).get(task_id)
        if known is not None:
          if task["setting"] != known["setting"]:
            found.append(
                f"{where}.setting is {task['setting']}; the task is"
                f" {known['setting']}"
            )
          applies = tuple(
              check for check in CHECKS if checks[check] != NOT_APPLICABLE
          )
          if applies != tuple(known["checks"]):
            found.append(
                f"{where}: the checks with a verdict are"
                f" {', '.join(applies)}; this task has"
                f" {', '.join(known['checks'])}"
            )
      if not (
          isinstance(task["termination"], str)
          and _TERMINATION.fullmatch(task["termination"])
      ):
        found.append(f"{where}.termination is not a termination reason")
      for field in ("model_calls", "tool_calls", "turns"):
        if task[field] is not None and _count(task[field]) is None:
          found.append(f"{where}.{field} must be a count or null")
      digest = task["trajectory_sha256"]
      if not (isinstance(digest, str) and _SHA256.fullmatch(digest)):
        found.append(f"{where}.trajectory_sha256 must be a sha256")
    problems += len(found)
    if len(errors) < 40:
      errors.extend(found)
  if problems and len(errors) >= 40:
    errors.append(f"... {problems} problems in tasks in total")
  if expected is None:
    counts = summary_of(tasks)
    for setting in SETTINGS:
      wanted = reference["datasets"][setting]["tasks"]
      if counts[setting]["scored"] != wanted:
        errors.append(
            f"{setting} has {counts[setting]['scored']} results; the release"
            f" has {wanted} tasks"
        )


def check_submission(
    document: Any, reference: dict, *, require_url: bool = True
) -> list[str]:
  """Return every reason a score file is not acceptable, or an empty list.

  `reference` describes the release a submission is for: the required run
  settings, the sha256 of each setting's task file, and for each validation
  task its setting and the checks that apply to it.
  """
  errors: list[str] = []
  if not _keys(
      document,
      "the score file",
      (
          "format",
          "schema_version",
          "release",
          "split",
          "entry",
          "run",
          "tasks",
          "summary",
          "trajectories",
      ),
      (),
      errors,
  ):
    return errors
  if document["format"] != FORMAT:
    errors.append(f"format must be {FORMAT!r}")
  if (
      type(document["schema_version"]) is not int
      or document["schema_version"] != SCHEMA_VERSION
  ):
    errors.append(
        f"schema_version is {document['schema_version']!r}; this check reads"
        f" version {SCHEMA_VERSION}"
    )
    return errors
  for field in ("release", "split"):
    if document[field] != reference[field]:
      errors.append(
          f"{field} is {document[field]!r}; this leaderboard is for"
          f" {reference[field]!r}"
      )
  _check_entry(document["entry"], errors)
  harness = (
      document["entry"].get("harness")
      if isinstance(document["entry"], dict)
      else None
  )
  _check_run(document["run"], harness, reference, errors)
  _check_tasks(document["tasks"], reference, errors)
  if isinstance(document["tasks"], dict) and all(
      isinstance(task, dict) for task in document["tasks"].values()
  ):
    if document["summary"] != summary_of(document["tasks"]):
      errors.append("summary does not equal the counts of the task results")
    groups = (
        document["run"].get("action_model_behavior")
        if isinstance(document["run"], dict)
        else None
    )
    if isinstance(groups, list) and all(
        isinstance(group, dict) and _count(group.get("tasks")) is not None
        for group in groups
    ):
      if sum(group["tasks"] for group in groups) != len(document["tasks"]):
        errors.append(
            "run.action_model_behavior does not cover the tasks of the score"
            " file: its numbers of tasks must add up to their number"
        )
  trajectories = document["trajectories"]
  if _keys(
      trajectories, "trajectories", ("url", "sha256", "bytes"), (), errors
  ):
    if trajectories["url"] is None:
      if require_url:
        errors.append(
            "trajectories.url is missing: upload the trajectory archive and"
            " give its public address"
        )
    elif not _url(trajectories["url"]):
      errors.append("trajectories.url must be an https address")
    if not (
        isinstance(trajectories["sha256"], str)
        and _SHA256.fullmatch(trajectories["sha256"])
    ):
      errors.append("trajectories.sha256 must be a sha256")
    size = _count(trajectories["bytes"])
    if size is None or not 0 < size <= MAX_ARCHIVE_BYTES:
      errors.append(
          "trajectories.bytes must be the size of the archive, at most"
          f" {MAX_ARCHIVE_BYTES // (1024 * 1024)} MB"
      )
  return errors


def check_archive(
    document: dict,
    fileobj,
    reference: dict,
    *,
    on_member: Callable[[str, dict], None] | None = None,
) -> list[str]:
  """Return every way a trajectory archive disagrees with its score file.

  Each member must be the task file the score file names by sha256, hold only
  the fields of a trajectory record, state the required run settings, and
  carry verifier votes that give the verdicts of the score file.
  """
  errors: list[str] = []
  tasks = document["tasks"]
  entry_id = document["entry"]["id"]
  seen = set()
  limits = set()
  behaviors: dict[str, int] = {}

  def problem(message: str) -> None:
    if len(errors) < 40:
      errors.append(message)

  try:
    for task_id, data in read_archive(fileobj, entry_id):
      if task_id in seen or task_id not in tasks:
        problem(f"archive member {task_id!r} is not a task of the score file")
        continue
      seen.add(task_id)
      expected = tasks[task_id]
      if sha256_hex(data) != expected["trajectory_sha256"]:
        problem(
            f"{task_id}: the trajectory is not the one the score file names"
        )
        continue
      try:
        record = json.loads(data)
        if not isinstance(record, dict):
          raise ValueError
      except (ValueError, RecursionError):
        problem(f"{task_id}: the trajectory is not a JSON object")
        continue
      unknown = sorted(set(record) - set(TRAJECTORY_FIELDS))
      if unknown:
        problem(f"{task_id}: unexpected fields {', '.join(unknown[:5])}")
      foreign = foreign_message_part(record)
      if foreign:
        problem(f"{task_id}: {foreign}")
      version = record.get("schema_version")
      if type(version) is not int or version != RESULT_SCHEMA_VERSION:
        problem(
            f"{task_id}: not a result file of version {RESULT_SCHEMA_VERSION}"
        )
      if (
          record.get("task_id") != task_id
          or task_id_of(record.get("sample_id")) != task_id
      ):
        problem(f"{task_id}: the trajectory belongs to another task")
      for field in ("api_version", "user_simulator_model", "verifier_model"):
        if record.get(field) != reference[field]:
          problem(
              f"{task_id}: {field} is {record.get(field)!r}; the leaderboard"
              f" requires {reference[field]!r}"
          )
      limit = model_call_timeout_of(record)
      if limit is None:
        problem(f"{task_id}: model_call_timeout_seconds is not a limit")
      else:
        limits.add(limit)
      settings = record.get("action_model_behavior")
      if is_model_settings(settings):
        key = canonical_json(settings).decode("ascii")
        behaviors[key] = behaviors.get(key, 0) + 1
      else:
        problem(f"{task_id}: action_model_behavior states no model settings")
      if record.get("developer_instruction_placement") != document["run"].get(
          "developer_instruction_placement"
      ):
        problem(
            f"{task_id}: developer_instruction_placement differs from the one"
            " the score file states for the run"
        )
      try:
        derived = task_entry(record, record.get("setting"), data)
      except SubmissionError as error:
        problem(f"{task_id}: {error}")
        continue
      for verifier in VERIFIERS:
        if derived["checks"][verifier] != NOT_APPLICABLE and (
            verifier_vote_count(record, verifier) != reference["verifier_votes"]
        ):
          problem(
              f"{task_id}: {verifier} has"
              f" {verifier_vote_count(record, verifier)} votes; the"
              f" leaderboard requires {reference['verifier_votes']}"
          )
      # The attempts of a task are no part of its trajectory.
      differing = sorted(
          field for field in derived if derived[field] != expected.get(field)
      )
      if differing:
        problem(
            f"{task_id}: the score file disagrees with the trajectory on"
            f" {', '.join(differing)}"
        )
      if on_member is not None:
        on_member(task_id, record)
  except SubmissionError as error:
    errors.append(str(error))
    return errors
  missing = sorted(set(tasks) - seen)
  if missing:
    errors.append(
        f"the archive lacks {len(missing)} trajectories, for example"
        f" {missing[0]}"
    )
  stated = document["run"].get("model_call_timeout_seconds")
  if not errors and sorted(limits) != stated:
    errors.append(
        "run.model_call_timeout_seconds does not list the limits the"
        f" trajectories ran under ({', '.join(map(str, sorted(limits)))})"
    )
  if not errors and settings_groups(behaviors) != document["run"].get(
      "action_model_behavior"
  ):
    errors.append(
        "run.action_model_behavior does not list the settings the"
        " trajectories ran under, with the number of tasks of each"
    )
  return errors
