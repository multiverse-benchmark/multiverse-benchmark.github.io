#!/usr/bin/env python3
"""Export a byte-preserving, read-only source catalog from a release's API files.

Each release of the benchmark has one folder of API files in the code
repository, `api_runtime/<release>/`, with a list of every file and its
SHA-256 (`SHA256SUMS`). The tool explorer of the page shows the Python source
under the folder's `APIs/` and the tool schemas under its `Schemas/`:

  python3 scripts/export_tools.py --release v1.0.0 --source /path/to/repository/api_runtime/v1.0.0
  python3 scripts/export_tools.py --release v1.1.0 --source /path/to/repository/api_runtime/v1.1.0
  python3 scripts/export_tools.py --validate-only

Uses only the Python standard library. No source module is imported or executed.
The release folder is an input, never modified. Re-running with the same inputs
produces identical assets (no export-time timestamps).
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tokenize


ROOT = Path(__file__).resolve().parents[1]
# Statement coverage of each release's tests, as the tool explorer shows it: the paper's figure
# for the release the paper describes, a measured one (with the record of the measurement) for a
# later release. The page reads the same file.
COVERAGE_PATH = ROOT / "src/data/coverage.json"
PAPER_RELEASE = "v1.0.0"
RELEASES = (PAPER_RELEASE, "v1.1.0")
# What the paper reports for its release: statement coverage overall and for the services with the lowest and the highest.
PAPER_COVERAGE = {"statementCoveragePercent": 88, "serviceCoverageRangePercent": [79, 98]}


def data_root(release: str) -> Path:
    """Folder of a release's exported data. The data of the paper's release has no folder of its own."""
    return ROOT / "public/data" if release == PAPER_RELEASE else ROOT / "public/data" / release
LABELS = {
    "gridwell_mail": "Gridwell Mail", "gridwell_calendar": "Gridwell Calendar",
    "gridwell_drive": "Gridwell Drive", "gridwell_docs": "Gridwell Docs",
    "gridwell_sheets": "Gridwell Sheets", "gridwell_slides": "Gridwell Slides",
    "gridwell_chat": "Gridwell Chat", "gridwell_meet": "Gridwell Meet",
    "githut": "Githut", "githut_actions": "Githut Actions", "slick": "Slick",
    "whatsup": "Whatsup", "zira": "Zira", "docfluence": "Docfluence",
    "zenhelp": "Zenhelp", "salespower": "Salespower", "hubscape": "Hubscape",
    "strope": "Strope", "shopster": "Shopster", "sapspend": "Sapspend",
    "linkedup": "Linkedup", "photogram": "Photogram", "cliptok": "Cliptok",
    "streamify": "Streamify", "clock": "Clock", "generic_reminders": "Reminders",
    "phone": "Phone", "contacts": "Contacts", "notifications": "Notifications",
    "media_control": "Media Control", "device_actions": "Device Actions",
    "device_setting": "Device Settings", "notes_and_lists": "Notes and Lists",
    "generic_media": "Generic Media", "messages": "Messages",
    "_shared": "Shared Framework",
}
# The paper's number of tools per service, compared with the release.
PAPER_COUNTS = dict(zip(
    "gridwell_mail gridwell_calendar gridwell_drive gridwell_docs gridwell_slides gridwell_sheets gridwell_chat gridwell_meet slick whatsup messages zenhelp salespower hubscape strope shopster sapspend zira docfluence githut githut_actions linkedup photogram cliptok streamify clock generic_reminders phone contacts notifications media_control device_actions device_setting notes_and_lists generic_media".split(),
    [60,32,47,3,5,15,31,16,64,14,11,22,51,37,23,29,16,88,39,32,9,18,10,4,41,18,5,4,9,3,11,12,14,14,2],
))


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def dump(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


FILE_LIST = "SHA256SUMS"


class SourceSnapshot:
    """Immutable bytes of a release's API files: the folder api_runtime/<release>/ of the code repository."""
    def __init__(self, folder: Path, release: str):
        # The folder's own manifest names the release it holds.
        own_manifest = folder / "manifest.json"
        if own_manifest.is_file() and json.loads(own_manifest.read_text()).get("api_version") != release:
            raise ValueError(f"{own_manifest} describes another release than {release}")
        # The file list names every file of the release with its SHA-256. A file that the list
        # does not name is not part of the release.
        listed = {}
        for line in (folder / FILE_LIST).read_text().splitlines():
            digest, _, name = line.partition("  ")
            listed[name] = digest
        # The folder holds the service code (APIs/), the tool schemas (Schemas/), databases, and
        # scripts. Only the source and the schema files are read, and each one is checked against the list.
        self.entries = {}
        for name, digest in listed.items():
            if not name.startswith(("APIs/", "Schemas/")):
                continue
            blob = (folder / name).read_bytes()
            if sha(blob) != digest:
                raise ValueError(f"{name} differs from its entry in {FILE_LIST}")
            self.entries[name] = blob
        # The release is named by its place in the code repository, never by a local path. The tool
        # explorer links every source file to its file under this path. The hash of the file list
        # identifies the whole release: every file with its content.
        self.provenance = {"kind": "release-files", "path": f"api_runtime/{release}",
                           "fileList": {"file": FILE_LIST, "sha256": sha256_file(folder / FILE_LIST), "files": len(listed)}}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def namelist(self):
        return list(self.entries)

    def read(self, name):
        return self.entries[name]


def line_statistics(source: str, tree: ast.AST) -> dict:
    """Physical lines and source lines containing code, excluding docstrings.

    Code lines count each physical line containing a non-comment, non-docstring
    token once. A line containing only a multiline string value is code unless
    that string is an actual module/class/function docstring. Not coverage.
    """
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                docstrings.update(range(first.lineno, first.end_lineno + 1))
    code_lines = set()
    excluded = {tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE, tokenize.INDENT,
                tokenize.DEDENT, tokenize.ENDMARKER, tokenize.ENCODING}
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type not in excluded:
            code_lines.update(set(range(token.start[0], token.end[0] + 1)) - docstrings)
    return {"lines": len(source.splitlines()), "codeLines": len(code_lines)}


def literal_registry(tree: ast.AST) -> dict:
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "_function_map" for t in node.targets):
            value = ast.literal_eval(node.value)
            assert isinstance(value, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in value.items())
            return value
    return {}


def check_credentials(path: str, source: str) -> None:
    # High-confidence credential formats only. Illustrative placeholder tokens
    # in simulation tests are source code; no .env, state, or runtime files enter
    # this allowlist. Never print matched values in an error message.
    patterns = [r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
                r"\bAKIA[0-9A-Z]{16}\b", r"\bgh[pousr]_[A-Za-z0-9]{36,}\b",
                r"\bsk-proj-[A-Za-z0-9_-]{60,}\b"]
    for pattern in patterns:
        for match in re.finditer(pattern, source):
            # Reviewed unit-test SecretScanningAlert fixture: the entire token
            # suffix is one repeated character and is explicitly '(redacted)'.
            if ("/tests/" in path and match.group().startswith("ghp_")
                    and len(set(match.group()[4:])) == 1
                    and source[match.end():match.end() + 11].startswith(" (redacted)")):
                continue
            raise ValueError(f"Credential-shaped literal needs review in {path}; no export written")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--release", choices=RELEASES, help="The release to export. Reads that release's task export for the list "
                        "of services and writes to public/data/tool-source (v1.0.0) or public/data/<release>/tool-source.")
    parser.add_argument("--source", type=Path, help="The release's API files: the folder api_runtime/<release> of the code repository")
    parser.add_argument("--license-file", type=Path, help="The license file of the code repository (default: LICENSE of the repository that holds the folder)")
    parser.add_argument("--output", type=Path, help="Destination (default: the release's tool-source folder)")
    parser.add_argument("--validate-only", action="store_true", help="Check the exported files of the release, or of every release when none is named")
    args = parser.parse_args()
    if args.validate_only:
        for release in [args.release] if args.release else RELEASES:
            validate(args.output or data_root(release) / "tool-source")
        return
    if not args.release or not args.source:
        parser.error("an export needs --release and --source (the folder of the release's API files)")
    args.output = args.output or data_root(args.release) / "tool-source"
    args.license_file = args.license_file or args.source.resolve().parents[1] / "LICENSE"
    paper_release = args.release == PAPER_RELEASE

    benchmark = set(json.loads((data_root(args.release) / "manifest.json").read_text())["tools"])
    assert benchmark == set(PAPER_COUNTS) and len(benchmark) == 35
    files, registries, definitions, schemas, assets = [], {}, {}, {}, {}
    with SourceSnapshot(args.source, args.release) as snapshot:
        source_provenance = snapshot.provenance
        names = set(snapshot.namelist())
        for name in sorted(names):
            path = PurePosixPath(name)
            if not name.startswith("APIs/") or not name.endswith(".py"):
                continue
            if ".." in path.parts or path.is_absolute():
                raise ValueError(f"Unsafe file path: {name}")
            blob = snapshot.read(name)
            source = blob.decode("utf-8")
            check_credentials(name, source)
            tree = ast.parse(source, filename=name)
            package = path.parts[1] if len(path.parts) > 2 else "common_utils"
            service = package if package in benchmark else "_shared"
            is_test = any(part in {"tests", "test"} for part in path.parts) or path.name.startswith("test_") or path.name == "conftest.py"
            kind = "test" if is_test else "shared" if service == "_shared" else "implementation"
            asset = f"files/{name}"
            files.append({"id": name, "path": name, "service": service, "package": package,
                          "kind": kind, "language": "python", **line_statistics(source, tree),
                          "bytes": len(blob), "sha256": sha(blob), "asset": asset})
            assets[f"files/{name}"] = blob
            # Store only top-level definitions and small metadata, not ASTs for
            # all files (the largest source file has >175,000 physical lines).
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    start = min([node.lineno] + [d.lineno for d in node.decorator_list])
                    signature = f"{node.name}({ast.unparse(node.args)})"
                    if node.returns:
                        signature += " -> " + ast.unparse(node.returns)
                    definitions[(name, node.name)] = {
                        "line": start, "functionLine": node.lineno, "endLine": node.end_lineno,
                        "signature": signature,
                        "docstring": ast.get_docstring(node) or "",
                    }
            if len(path.parts) == 3 and path.name == "__init__.py":
                registry = literal_registry(tree)
                if registry:
                    registries[package] = registry
        for name in sorted(names):
            if name.startswith("Schemas/") and name.endswith(".json"):
                package = PurePosixPath(name).stem
                blob = snapshot.read(name)
                schemas[package] = {tool["name"]: tool for tool in json.loads(blob)}
                assets[f"schemas/{package}.json"] = blob
        # Keep any licensing file that the release itself holds, without taking
        # arbitrary documentation or data files.
        for name in sorted(names):
            if PurePosixPath(name).name.upper() in {"LICENSE", "LICENSE.TXT", "LICENSE.MD", "NOTICE", "NOTICE.TXT", "COPYING"}:
                assets[f"release-notices/{name}"] = snapshot.read(name)

    tools = []
    for package, registry in sorted(registries.items()):
        service = package if package in benchmark else "_shared"
        for public_name, target in sorted(registry.items()):
            module, _, function_name = target.rpartition(".")
            root = "APIs/" + module.replace(".", "/")
            file_id = next((p for p in [root + ".py", root + "/__init__.py"] if (p, function_name) in definitions), None)
            if file_id is None:
                raise ValueError(f"Unresolved public tool: {package}.{public_name} -> {target}")
            definition = definitions[(file_id, function_name)]
            schema = schemas.get(package, {}).get(public_name)
            description = (schema or {}).get("description") or definition["docstring"]
            # Full endpoint schemas and complete docstrings remain in lazy
            # source/schema assets; index previews use the first paragraph.
            description = re.split(r"\n\s*\n", description.strip())[0]
            if len(description) > 500:
                description = description[:497].rsplit(" ", 1)[0] + "…"
            tools.append({"id": f"{package}.{public_name}", "name": public_name,
                          "service": service, "package": package,
                          "scope": "benchmark" if package in benchmark else "framework",
                          "description": description, "fileId": file_id,
                          **{k: v for k, v in definition.items() if k != "docstring"},
                          "implementation": target,
                          "schemaAsset": f"schemas/{package}.json" if schema else None})
        if package in schemas:
            assert set(registry) == set(schemas[package]), f"Registry/schema mismatch for {package}"

    groups = {}
    for kind in ["implementation", "test", "shared"]:
        selected = [f for f in files if f["kind"] == kind]
        groups[kind] = {"files": len(selected), "lines": sum(f["lines"] for f in selected),
                        "codeLines": sum(f["codeLines"] for f in selected), "bytes": sum(f["bytes"] for f in selected)}
    benchmark_tools = [t for t in tools if t["scope"] == "benchmark"]
    services = []
    for service in sorted(benchmark) + ["_shared"]:
        selected = [f for f in files if f["service"] == service]
        services.append({"id": service, "name": LABELS[service],
                         "scope": "framework" if service == "_shared" else "benchmark",
                         "toolCount": sum(t["service"] == service for t in tools),
                         "fileCount": len(selected), "lines": sum(f["lines"] for f in selected),
                         "codeLines": sum(f["codeLines"] for f in selected)})
    differences = [{"service": s, "paper": PAPER_COUNTS[s],
                    "snapshot": sum(t["service"] == s for t in benchmark_tools)} for s in sorted(benchmark)
                   if PAPER_COUNTS[s] != sum(t["service"] == s for t in benchmark_tools)]
    license_bytes = args.license_file.read_bytes()
    license_origin = "LICENSE of the public MultiVerse release repository, preserved verbatim. Source file headers are preserved byte for byte."
    assets["LICENSE"] = license_bytes
    statistics = {
        "serviceCount": len(benchmark), "toolCount": len(benchmark_tools),
        "benchmarkToolCount": len(benchmark_tools), "frameworkToolCount": len(tools) - len(benchmark_tools),
        "totalToolCount": len(tools), "fileCount": len(files),
        "lines": sum(f["lines"] for f in files), "codeLines": sum(f["codeLines"] for f in files),
        "bytes": sum(f["bytes"] for f in files), "maxFileLines": max(f["lines"] for f in files),
        "implementationLines": groups["implementation"]["lines"],
        "implementationCodeLines": groups["implementation"]["codeLines"],
        "testLines": groups["test"]["lines"], "testCodeLines": groups["test"]["codeLines"],
        "sharedLines": groups["shared"]["lines"], "sharedCodeLines": groups["shared"]["codeLines"],
        "byKind": groups,
        "methodology": "Measured from the exported source bytes. Physical lines include comments, docstrings, and blanks. Code lines count physical lines containing a Python token other than comments, whitespace, or actual module/class/function docstrings. Tests include tests/ directories, test_*.py, and conftest.py; shared implementation excludes tests. These counts are not coverage measurements.",
    }
    release_coverage = json.loads(COVERAGE_PATH.read_text())[args.release]
    if paper_release:
        # The paper's own figure stands for the release it describes; it is not measured here.
        assert release_coverage == {"source": "paper", **PAPER_COVERAGE}, f"{COVERAGE_PATH} gives another coverage for {PAPER_RELEASE} than the paper"
        assert not differences, f"the tool counts of {PAPER_RELEASE} differ from the paper's: {differences}"
    else:
        # The record must describe the files that are exported: a changed release is measured again first.
        measured = release_coverage["measurement"]["fileListSha256"]
        exported = source_provenance["fileList"]["sha256"]
        if measured != exported:
            raise ValueError(f"{COVERAGE_PATH} records the coverage of the release files {measured[:12]}, not of these "
                             f"({exported[:12]}): measure these files and update the record")
    paper = ({"serviceCount": 35, "toolCount": 809, **PAPER_COVERAGE,
              "note": "The paper describes this release. Its coverage figures are the paper's, not recomputed by this export; the counts of this snapshot are measured separately."}
             if paper_release else
             {"serviceCount": 35, "toolCount": 809,
              "note": "The paper's tool count and coverage figures describe v1.0.0. The counts of this snapshot are measured separately, and the statement coverage measured for this release is recorded under `coverage`."})
    provenance = {
        **source_provenance,
        "release": args.release,
        "paper": paper,
        "coverage": release_coverage,
        "catalogDifference": {"paperToolCount": 809, "snapshotBenchmarkToolCount": len(benchmark_tools),
                              "byService": differences,
                              "note": f"The paper reports 809 benchmark tools; this source snapshot exposes {len(benchmark_tools)} benchmark tools plus {len(tools) - len(benchmark_tools)} framework helpers (authentication and shared utilities)."},
        "scope": "All .py files under APIs/ of the release's API files: every benchmark service, its tests, authentication, and shared utilities. All 36 Schemas/*.json files retained. No runtime databases, task/user data, compiled bytecode, .env files, scripts outside APIs/, or evaluation results are exported. No source code is executed.",
        "license": {"name": "Apache-2.0", "asset": "LICENSE", "sha256": sha(license_bytes),
                    "origin": license_origin},
        "exporter": "scripts/export_tools.py", "exporterSha256": sha(Path(__file__).read_bytes()),
    }
    index = {"schemaVersion": 1, "services": services, "tools": tools, "files": files,
             "statistics": statistics, "provenance": provenance}
    # Only replace our dedicated output directory after all source and registry
    # checks pass. Never delete siblings (the validation task export is separate).
    output = args.output.resolve()
    if output.name != "tool-source":
        raise ValueError("Output directory must be named tool-source")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for name, data in sorted(assets.items()):
        dest = output / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    dump(output / "index.json", index)
    dump(output / "provenance.json", provenance)
    dump(output / "manifest.json", {"schemaVersion": 1, "provenance": provenance,
         "statistics": statistics, "assets": [{"path": name, "bytes": len(data), "sha256": sha(data)}
         for name, data in sorted(assets.items())]})
    validate(output)
    print(json.dumps(statistics, indent=2))


def validate(output: Path) -> None:
    index = json.loads((output / "index.json").read_text())
    manifest = json.loads((output / "manifest.json").read_text())
    for asset in manifest["assets"]:
        data = (output / asset["path"]).read_bytes()
        assert len(data) == asset["bytes"] and sha(data) == asset["sha256"], asset["path"]
    by_id = {f["id"]: f for f in index["files"]}
    assert len(by_id) == len(index["files"])
    assert len({t["id"] for t in index["tools"]}) == len(index["tools"])
    for tool in index["tools"]:
        file = by_id[tool["fileId"]]
        assert 1 <= tool["line"] <= tool["functionLine"] <= tool["endLine"] <= file["lines"], tool["id"]
    assert sum(t["scope"] == "benchmark" for t in index["tools"]) == index["statistics"]["benchmarkToolCount"]
    assert sum(s["scope"] == "benchmark" for s in index["services"]) == 35
    print(f"Validated {len(index['files']):,} byte-preserved Python files and {len(index['tools'])} source-linked registry entries across35 benchmark services.")


if __name__ == "__main__":
    main()
