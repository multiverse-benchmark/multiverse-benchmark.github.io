"""Helpers that turn an authored task into the records the task explorer shows.

They read the task's fields only: no connector is imported and no task code is
executed.
"""


import ast
import copy
import hashlib
import json
from typing import Literal

TaskType = Literal["ST", "IF", "MT", "MTIF"]


# ---- task summary and detail


AUTHORED_TASK_FIELDS = {
    "task_id", "user_simulation_metadata", "environment_config",
    "verification", "gold_trajectories", "task_properties",
}


def _steps_to_trajectory(steps: list[dict]) -> list[dict]:
  """Preserve every authored step, its original role, and its full payload."""
  out: list[dict] = []
  for index, raw in enumerate(steps):
    entry = {
        "step": index + 1, "sourceIndex": index, "rawStep": raw,
        "sourceRole": None,
    }
    if "function_call" in raw:
      call = raw["function_call"] or {}
      entry.update({
          "role": "MODEL", "action": "tool_use",
          "tool": call.get("name", ""), "input": call.get("arguments", {}),
      })
    elif "function_call_response" in raw:
      resp = raw["function_call_response"] or {}
      arguments = resp.get("arguments") or {}
      entry.update({
          "role": "FUNCTION", "action": "tool_result",
          "tool": resp.get("name", ""),
          "output": arguments.get("result", arguments),
      })
    elif "text" in raw or "thought" in raw:
      kind = "text" if "text" in raw else "thought"
      body = raw[kind] or {}
      content = body.get("content", "")
      source_role = body.get("role")
      role = str(source_role or "UNSPECIFIED_ROLE").upper()
      role = {"1": "AGENT", "2": "USER", "0": "UNSPECIFIED_ROLE"}.get(role, role)
      # The task schema has no SYSTEM role. Reference trajectories put a system
      # prompt first with UNSPECIFIED_ROLE. Recognize the actual prompt headers,
      # not every unset role: later unset text can be an authoring hint. Keep
      # sourceRole/rawStep unchanged, including explicit USER instruction text.
      if role == "UNSPECIFIED_ROLE" and kind == "text":
        stripped = content.lstrip()
        if index == 0 and stripped.startswith((
            "# SYSTEM",
            "You are an autonomous assistant agent that fulfills user requests "
            "by gathering information and taking actions through external services.",
        )):
          role = "SYSTEM"
        elif stripped.startswith("USER_QUERY:"):
          role = "USER"
      role = "MODEL" if role in {"AGENT", "ASSISTANT"} else role
      action = "thought" if kind == "thought" else {
          "USER": "user", "MODEL": "response", "SYSTEM": "system",
      }.get(role, "text")
      entry.update({
          "role": role, "sourceRole": source_role,
          "action": action, "content": content,
      })
      if kind == "thought":
        entry["reasoning"] = content
    elif "code" in raw:
      body = raw["code"] or {}
      entry.update({
          "role": "MODEL", "action": "code",
          "code": body.get("code", ""),
          "codeOutput": body.get("code_output", ""),
      })
    else:
      entry.update({"role": "UNKNOWN", "action": "unknown"})
    out.append(entry)
  return out


def _gold_trajectory_detail(trajectory: dict, index: int) -> dict:
  structured = trajectory.get("steps") or []
  steps = _steps_to_trajectory(structured)
  return {
      "index": index,
      "stepCount": _gold_step_count(trajectory),
      "toolCallCount": sum(step["action"] == "tool_use" for step in steps),
      "userTurnCount": sum(step["action"] == "user" for step in steps),
      "recordedToolCallCount": str(trajectory.get("tool_call_count") or ""),
      "finalResponse": trajectory.get("final_response") or "",
      "source": "structured" if structured else "none",
      "steps": steps,
  }


def _reference_value(value):
  """Decode serialized reference values without executing task code."""
  if isinstance(value, str):
    for parser in (json.loads, ast.literal_eval):
      try:
        parsed = parser(value)
        # Python repr may contain sets, bytes, or complex values. Keep those
        # as source text rather than making the JSON detail endpoint fail.
        json.dumps(parsed, allow_nan=False)
        return parsed
      except (ValueError, TypeError, SyntaxError, RecursionError):
        continue
  return value


def _reference_diff(task: dict, *, serialized_values: bool = True) -> dict:
  raw = (task.get("verification") or {}).get("gold_db_diff")
  if raw == "":
    raw = None
  result = {
      "raw": raw, "entries": [], "parseStatus": "absent",
      "provenance": "authored_reference", "isExecutionResult": False,
  }
  if raw is None or raw == "":
    return result
  try:
    entries = json.loads(raw) if isinstance(raw, str) else raw
  except (ValueError, TypeError):
    result["parseStatus"] = "unparsed"
    return result
  if not isinstance(entries, list) or any(
      not isinstance(entry, dict) or not isinstance(entry.get("path"), list)
      or "d1_content" not in entry or "d2_content" not in entry
      for entry in entries
  ):
    result["parseStatus"] = "unparsed"
    return result
  result["parseStatus"] = "parsed"
  for entry in entries:
    before, after = entry["d1_content"], entry["d2_content"]
    before_missing = (
        isinstance(before, str) and before.startswith("<MISSING")
        if serialized_values else before == "<MISSING_IN_D1>"
    )
    after_missing = (
        isinstance(after, str) and after.startswith("<MISSING")
        if serialized_values else after == "<MISSING_IN_D2>"
    )
    result["entries"].append({
        "path": [str(part) for part in entry["path"]],
        "operation": "added" if before_missing else "removed" if after_missing else "changed",
        "before": None if before_missing else _reference_value(before) if serialized_values else before,
        "after": None if after_missing else _reference_value(after) if serialized_values else after,
        "beforeMissing": before_missing, "afterMissing": after_missing,
        "raw": entry,
    })
  return result


def _gold_step_count(trajectory: dict) -> int:
  """Gold step count: the recorded count first, then the number of steps."""
  try:
    count = int(trajectory.get("step_count") or 0)
  except (TypeError, ValueError):
    count = 0
  return count or len(trajectory.get("steps") or [])


def _task_type(task: dict) -> TaskType:
  """Classify authored task settings, not the number of turns in a solution.

  Multi-turn availability follows the task preparation of the evaluation
  code: a task is multi-turn when its user goals or their hidden information
  carry text. The IF setting comes from applicable structured developer
  instructions, falling back to the developer prose when there are none.
  Task rubrics and capability labels do not imply IF.
  """
  user = task.get("user_simulation_metadata", {})
  turn_text = []
  for goal in user.get("user_goals", []):
    if goal.get("goal"):
      turn_text.append(str(goal["goal"]))
    turn_text.extend(
        f"{key}: {value}"
        for key, value in goal.get("hidden_information", {}).items()
        if key and value
    )
  multiturn = bool("\n".join(turn_text))

  developer = task.get("environment_config", {}).get("developer_instruction", {})
  instructions = developer.get("developer_instruction_chunks", [])
  instruction_following = (
      any(item.get("applicable", True) for item in instructions)
      if instructions else bool(developer.get("instruction_text", "").strip())
  )
  if multiturn:
    return "MTIF" if instruction_following else "MT"
  return "IF" if instruction_following else "ST"


def _task_to_frontend(
    task: dict, include_detail: bool = False, *, task_id: str | None = None,
) -> dict:
  """Map a task to the MultiverseTask frontend shape."""
  # Derive a stable ID from the task content
  raw_id = task_id or hashlib.md5(
      json.dumps(task, sort_keys=True).encode()
  ).hexdigest()[:12]

  # Extract services from environment_config.available_services
  env_cfg = task.get("environment_config", {})
  available_services = env_cfg.get("available_services", [])
  tools = [t.get("connector", "").lower() for t in available_services if t.get("connector")]

  # Domain = first connector name (lowered), or "general"
  domain = tools[0].lower() if tools else "general"

  # Extract prompt from user_simulation_metadata.query
  user_sim = task.get("user_simulation_metadata", {})
  prompt_text = user_sim.get("query", "")
  # Strip context tags from prompt for display
  clean_prompt = prompt_text.split("<context")[0].strip() if "<context" in prompt_text else prompt_text

  # Title = first line of prompt or truncated prompt
  title = clean_prompt.split("\n")[0][:120] if clean_prompt else "Untitled task"

  # Compute real step count from gold trajectory
  gold_trajectories = task.get("gold_trajectories", [])
  step_count = _gold_step_count(gold_trajectories[0]) if gold_trajectories else 0

  # User goals as success criteria
  user_goals = user_sim.get("user_goals", [])
  goals = [g.get("goal", "").split("\n")[0] for g in user_goals if g.get("goal")]

  # Expected outcome
  desired_state = user_sim.get("expected_outcome", "")

  # Task properties
  task_props = task.get("task_properties", {})
  category = task_props.get("task_category", "")
  sub_details = (
      task_props.get("sub_task_category", {}).get("sub_task_details", "")
  )

  result = {
      "id": str(raw_id),
      "taskType": _task_type(task),
      "sourceId": task.get("task_id") or None,
      "domain": domain,
      "title": title,
      "prompt": clean_prompt,
      "tools": tools,
      "complexity": step_count or max(len(user_goals), 1),
      "goldSteps": step_count,
      "userGoals": goals,
      "desiredState": desired_state,
      "category": category,
      "capabilities": sub_details,
      "goldTrajectoryCount": len(gold_trajectories),
  }

  if include_detail:
    variants = [_gold_trajectory_detail(gold, i) for i, gold in enumerate(gold_trajectories)]
    result.update({
        "prompt": prompt_text,
        "promptPreview": clean_prompt,
        "userGoals": [goal.get("goal", "") for goal in user_goals if goal.get("goal")],
        "userSimulation": user_sim,
        "taskProperties": task_props,
        "toolDetails": available_services,
        "instructions": {
            "developer": env_cfg.get("developer_instruction") or {},
        },
        "environmentSetup": {
            "initialization": env_cfg.get("initialization") or {},
            "codebaseDownloads": env_cfg.get("codebase_download_information") or [],
        },
        "verification": {"final": task.get("verification") or {}},
        "referenceDiff": _reference_diff(task),
        "goldTrajectories": variants,
        "toolCallCount": variants[0]["toolCallCount"] if variants else 0,
        "userTurnCount": variants[0]["userTurnCount"] if variants else 0,
        "rawTask": {key: value for key, value in task.items() if key in AUTHORED_TASK_FIELDS},
    })

  return result


# ---- initial states and the gold database changes


def _initialization_literals(code: str) -> dict:
    """Read JSON literals passed through the vendor's temp-file DB loader.

    Recognize only a direct ``service.SimulationEngine.db`` assignment followed
    by a literal ``_tmp.write(...)`` and ``_db.load_state(_tmp.name)``. This is
    source inspection, not execution or a claim about normalized runtime state.
    """
    try:
        statements = ast.parse(code).body
    except (SyntaxError, ValueError, RecursionError):
        return {}
    data = {}
    service = None
    payload = None
    for statement in statements:
        if isinstance(statement, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "_db"
            for target in statement.targets
        ):
            value = statement.value
            service = None
            payload = None
            if (
                isinstance(value, ast.Attribute) and value.attr == "db"
                and isinstance(value.value, ast.Attribute)
                and value.value.attr == "SimulationEngine"
                and isinstance(value.value.value, ast.Name)
            ):
                service = value.value.value.id
        if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
            continue
        call = statement.value
        if not isinstance(call.func, ast.Attribute) or not isinstance(call.func.value, ast.Name):
            continue
        receiver, method = call.func.value.id, call.func.attr
        if receiver == "_tmp" and method == "write":
            payload = None
            if len(call.args) == 1 and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str):
                try:
                    payload = json.loads(call.args[0].value)
                except (ValueError, RecursionError):
                    pass
        if receiver == "_db" and method == "load_state" and service and payload is not None:
            if (
                len(call.args) == 1 and isinstance(call.args[0], ast.Attribute)
                and call.args[0].attr == "name"
                and isinstance(call.args[0].value, ast.Name)
                and call.args[0].value.id == "_tmp"
            ):
                # Repeated merge loads are not a single full snapshot.
                if service in data:
                    return {}
                data[service] = payload
                payload = None
    return data


def _initialization_warnings(code: str, literal_count: int) -> list[str]:
    """Flag source operations not represented by the extracted JSON inputs."""
    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError, RecursionError):
        return ["The initialization code could not be parsed."]
    warnings = []
    loads = sum(
        isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
        and node.func.attr in {"load_state", "load_db"}
        for node in ast.walk(tree)
    )
    if loads != literal_count:
        warnings.append("Some database loads are not represented by the displayed literal inputs.")
    # Extra DB writes are evidence that the literals are not the complete state.
    for node in ast.walk(tree):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            targets = [node.target]
        elif isinstance(node, ast.Delete):
            targets = node.targets
        if any(
            isinstance(target, ast.Subscript) and any(
                isinstance(part, ast.Name) and (part.id == "DB" or "db" in part.id.lower())
                or isinstance(part, ast.Attribute) and part.attr == "DB"
                for part in ast.walk(target)
            )
            for target in targets
        ):
            warnings.append("Initialization code also modifies database values outside the literal loads.")
            break
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            receiver = node.func.value
            if isinstance(receiver, ast.Attribute) and receiver.attr == "DB" or isinstance(receiver, ast.Name) and receiver.id == "DB":
                warnings.append("Initialization code also calls database operations outside the literal loads.")
                break
    return warnings


def _derive_reference_final(initial: dict, diff: dict, warnings=()) -> dict:
    """Overlay gold after-values for inspection, not runtime-state validation.

    The producer recurses into dictionaries and replaces lists as whole values.
    Before-value disagreements are disclosed, not used to discard known after
    values. Never coerce an existing scalar/list into a dictionary or guess a
    list index. A structurally ambiguous service is withheld independently.
    """
    snapshot = {
        "available": False, "provenance": "unavailable", "services": [],
        "data": {}, "reason": "The dataset does not contain a readable reference difference.",
    }
    if diff["parseStatus"] != "parsed":
        return snapshot
    entries = diff["entries"]
    if any(not entry["path"] for entry in entries):
        snapshot["reason"] = "The reference difference has an empty path."
        return snapshot
    if not initial and not entries:
        snapshot["reason"] = "No initial database data or reference changes are available."
        return snapshot

    reconstruction = {
        "appliedChanges": 0, "beforeValueMismatches": [], "createdPaths": [],
        "warnings": list(warnings),
    }
    result = copy.deepcopy(initial)
    unavailable = {}
    by_service = {}
    for entry in entries:
        by_service.setdefault(entry["path"][0], []).append(entry)
    missing = object()
    for service, changes in by_service.items():
        # Work on a service copy so a later conflict cannot leak a partial patch.
        candidate = {service: copy.deepcopy(initial[service])} if service in initial else {}
        mismatches, created = [], []
        try:
            paths = sorted(tuple(entry["path"]) for entry in changes)
            for previous, current in zip(paths, paths[1:]):
                if current[:len(previous)] == previous:
                    raise ValueError("Duplicate or overlapping reference paths are ambiguous.")
            for entry in changes:
                path = entry["path"]
                before = initial
                for key in path:
                    before = before.get(key, missing) if isinstance(before, dict) else missing
                matches = (
                    before is missing if entry["beforeMissing"] else
                    before is not missing and json.dumps(before, sort_keys=True) == json.dumps(entry["before"], sort_keys=True)
                )
                if not matches:
                    mismatches.append(path)
                parent = candidate
                for index, key in enumerate(path[:-1]):
                    if not isinstance(parent, dict):
                        raise ValueError("A reference path traverses a non-dictionary value; its structure cannot be inferred safely.")
                    if key not in parent:
                        if entry["afterMissing"]:
                            # Removing an already absent path needs no invented container.
                            parent = missing
                            break
                        parent[key] = {}
                        created.append(path[:index + 1])
                    parent = parent[key]
                if parent is missing:
                    continue
                if not isinstance(parent, dict):
                    raise ValueError("A reference path traverses a non-dictionary value; its structure cannot be inferred safely.")
                if entry["afterMissing"]:
                    parent.pop(path[-1], None)
                else:
                    parent[path[-1]] = copy.deepcopy(entry["after"])
        except ValueError as exc:
            result.pop(service, None)
            unavailable[service] = str(exc)
            continue
        result.pop(service, None)
        result.update(candidate)
        reconstruction["appliedChanges"] += len(changes)
        reconstruction["beforeValueMismatches"].extend(mismatches)
        reconstruction["createdPaths"].extend(created)

    available = bool(result) or not unavailable
    snapshot.update({
        "available": available,
        "provenance": "derived_reference" if available else "unavailable",
        "services": sorted(result), "data": result,
        "unavailableServices": unavailable, "reconstruction": reconstruction,
        "reason": (
            "Reconstructed by copying the displayed initial data and applying the gold DB diff's after-values, "
            "including additions, replacements, and removals. Unchanged values come from the initial data. "
            "Before-value disagreements and missing parent paths are disclosed separately. "
            "Newly created paths contain only what the diff supplies. Runtime defaults, normalization, "
            "setup-code effects, and fields omitted by the diff are not reconstructed. "
            "Not a recorded final snapshot or an executed/validated API state."
        ),
    })
    return snapshot
