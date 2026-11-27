"""Require release membership to agree with active task instructions and user goals."""


def nonblank(value):
    return isinstance(value, str) and bool(value.strip())


def validate_task_setting(task, expected):
    """Return the content-derived setting, or reject an inconsistent task.

    Gold dialogue, descriptive metadata, and folder names do not make a task
    multi-turn. Only the user goals that the user simulator receives do.
    """
    task_id = task.get("task_id", "<unknown>")

    def require(condition, message):
        if not condition:
            raise ValueError(f"Task {task_id}: {message}")

    require(expected in {"ST", "IF", "MT", "MTIF"}, f"unknown setting {expected!r}")
    user = task.get("user_simulation_metadata") or {}
    goals = user.get("user_goals") or []
    for goal in goals:
        goal_text = goal.get("goal") or ""
        hidden = goal.get("hidden_information") or {}
        require(not goal_text or nonblank(goal_text), "blank simulator goal text")
        require(all(nonblank(key) and nonblank(value) for key, value in hidden.items()),
                "blank simulator hidden information")
        require(nonblank(goal_text) or bool(hidden), "blank simulator goal")
    multiturn = bool(goals)

    developer = (task.get("environment_config") or {}).get("developer_instruction") or {}
    chunks = developer.get("developer_instruction_chunks") or []
    active = [chunk for chunk in chunks if chunk.get("applicable", True)]
    text = developer.get("instruction_text") or ""
    require(not text or nonblank(text), "blank developer prompt")
    if chunks:
        require(text == "\n".join(chunk.get("instruction", "") for chunk in chunks),
                "joined developer prompt differs from structured instructions")
    for chunk in active:
        require(nonblank(chunk.get("instruction")), "applicable instruction has no text")
        rubrics = [rubric for rubric in chunk.get("rubrics", []) if rubric.get("applicable", True)]
        require(bool(rubrics) and all(nonblank(rubric.get("rubric")) for rubric in rubrics),
                "applicable instruction lacks active, nonblank grading criteria")
    instruction_following = bool(active) or (not chunks and nonblank(text))
    require(not instruction_following or bool(active),
            "developer instructions lack structured, applicable grading criteria")
    require(not (chunks and not active and nonblank(text)),
            "developer prompt contains text but every structured instruction is inactive")

    actual = ("MTIF" if instruction_following else "MT") if multiturn else (
        "IF" if instruction_following else "ST")
    require(actual == expected,
            f"published setting {expected} disagrees with active task fields ({actual}); "
            f"simulator information={multiturn}, instruction following={instruction_following}")
    category = (task.get("task_properties") or {}).get("task_category")
    expected_category = "USER_SIMULATION_SAMPLE" if multiturn else (
        "INSTRUCTION_FOLLOWING_SAMPLE" if instruction_following else None)
    if category is not None:
        require(category == expected_category, f"task enum {category!r} disagrees with {actual}")
    return actual
