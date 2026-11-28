#!/usr/bin/env python3
"""Read the score files of a submission pull request, as data.

The pull request workflow (.github/workflows/submission-check.yml) runs with
the scripts of the base branch and must not run anything a pull request
brings. This script therefore takes only the content of the files the pull
request adds or changes, through the GitHub API, and only if every one of
them is a score file: submissions/<release>/<entry>.json. A pull request
that touches a submission and anything else is refused, because a submission
must be reviewable as the one file it adds.

It writes the files under --out at their repository paths, their paths one
per line to --list, and, when the pull request is refused, the reason as
Markdown to --report. The token is read from the environment (GITHUB_TOKEN).

Usage:
  python3 scripts/read_pull_request.py --repository OWNER/NAME --number N --out DIR --list FILE --report FILE
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from check_submission import SCORE_FILE
from submission_format import MAX_SCORE_FILE_BYTES

API = "https://api.github.com"
MAX_FILES = 20


def get(path: str, token: str, accept: str = "application/vnd.github+json") -> bytes:
    request = urllib.request.Request(API + path, headers={
        "Accept": accept,
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "multiverse-leaderboard-check",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read(MAX_SCORE_FILE_BYTES + 1)


def refusal(files: list[dict]) -> str | None:
    """Why the pull request is not a submission, or None when every file is a score file."""
    if not files:
        return "The pull request changes no files."
    if len(files) > MAX_FILES:
        return f"The pull request changes more than {MAX_FILES} files."
    outside = [item for item in files if not SCORE_FILE.fullmatch(str(item.get("filename")))]
    if outside:
        return (
            "A submission may only add or change score files (`submissions/<release>/<entry>.json`). "
            f"This pull request also changes {len(outside)} other file{'s' if len(outside) != 1 else ''}."
        )
    removed = [item for item in files if item.get("status") not in ("added", "modified")]
    if removed:
        return "A submission may add or change score files, not remove or rename them. To withdraw an entry, contact the maintainers."
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--number", required=True, type=int)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--list", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    token = os.environ["GITHUB_TOKEN"]
    repository = f"/repos/{args.repository}"
    try:
        pull = json.loads(get(f"{repository}/pulls/{args.number}", token))
        files, page = [], 1
        while len(files) <= MAX_FILES:
            batch = json.loads(get(f"{repository}/pulls/{args.number}/files?per_page=100&page={page}", token))
            files += batch
            if len(batch) < 100:
                break
            page += 1
        reason = refusal(files)
        paths = [] if reason else [item["filename"] for item in files]
        head = pull["head"]
        for path in paths:
            # The content at the head commit of the pull request, from the repository it comes from.
            content = get(f"/repos/{head['repo']['full_name']}/contents/{urllib.parse.quote(path)}?ref={head['sha']}", token, "application/vnd.github.raw+json")
            target = args.out / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    except (urllib.error.URLError, OSError, ValueError, KeyError, TypeError) as error:
        reason, paths = f"The files of the pull request could not be read ({type(error).__name__}).", []
    args.list.write_text("".join(f"{path}\n" for path in paths))
    if reason:
        args.report.write_text(f"## Leaderboard submission check\n\n**Not accepted.** {reason}\n")
        print(reason)
        sys.exit(1)
    print(f"Read {len(paths)} score file{'s' if len(paths) != 1 else ''}.")


if __name__ == "__main__":
    main()
