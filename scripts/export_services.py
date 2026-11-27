#!/usr/bin/env python3
"""Export the list of simulated services for the project page.

Writes src/data/services.json: one entry per benchmark service, with

  name, label   the released (pseudo) service name from the tool-source catalog,
                and a short form for places with little room
  tools         how many tools the service exposes (tool-source catalog)
  tile, icon    the app's dock tile colour and icon in the desktop GUI
                (gui-src/apps/<app>/frontend/manifest.json)
  examples      up to three tool names, chosen by a fixed rule so that they
                read as typical operations (send, create, list, search, ...)
  firstTool     catalog id of the service's first tool in the catalog's order,
                which is the order of the tool explorer's list; the page links
                to it with "#tool=<id>"
  toolNames     the name of every tool of the service, in the same order. The
                catalog id of a tool is "<service id>.<name>", so the page can
                list a service's tools and link each one to its code

The one-line description of each service is page copy, not data: it is kept in
src/content/services.ts, and this script checks that every service has one.

Both inputs are part of this repository, so the script takes no arguments:

  python3 scripts/export_services.py
  python3 scripts/export_services.py --validate-only

The counts must match the paper: 35 services and 809 tools.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "data" / "tool-source" / "index.json"
MANIFESTS = ROOT / "gui-src" / "apps"
OUT = ROOT / "src" / "data" / "services.json"
DESCRIPTIONS = ROOT / "src" / "content" / "services.ts"
# One entry per line in that file: `  service_id: 'One line of text.',`
DESCRIPTION_LINE = re.compile(r"^\s*([a-z_]+): '([^']+)',$", re.MULTILINE)

SERVICE_COUNT = 35
TOOL_COUNT = 809
# Operations a reader recognises, most telling first; the shortest matching tool name stands for each.
EXAMPLE_PREFIXES = ["send", "create", "search", "list", "get", "update", "add", "set"]
LABELS = {"Notes and Lists": "Notes & Lists"}


def fail(message: str) -> None:
    raise SystemExit(f"export_services: {message}")


def label_of(name: str) -> str:
    """A short form of a service name: "Gridwell Mail" becomes "Mail"."""
    return LABELS.get(name, re.sub(r"^Gridwell ", "", name))


def examples_of(tool_names: list[str]) -> list[str]:
    chosen: list[str] = []
    for prefix in EXAMPLE_PREFIXES:
        matching = sorted((name for name in tool_names if name.startswith(prefix + "_") and name not in chosen), key=lambda name: (len(name), name))
        if matching:
            chosen.append(matching[0])
        if len(chosen) == 3:
            return chosen
    for name in sorted(tool_names):
        if name not in chosen:
            chosen.append(name)
        if len(chosen) == 3:
            break
    return chosen


def descriptions() -> dict[str, str]:
    """The service descriptions written in src/content/services.ts, by service id."""
    return dict(DESCRIPTION_LINE.findall(DESCRIPTIONS.read_text()))


def release_paths(release: str | None) -> tuple[Path, Path]:
    """The tool-source catalog to read and the JSON file to write, for the paper's release or a later one."""
    if not release:
        return CATALOG, OUT
    return ROOT / "public" / "data" / release / "tool-source" / "index.json", OUT.with_name(f"services.{release}.json")


def build(catalog_path: Path = CATALOG, keep_order_of: Path | None = None) -> list[dict]:
    catalog = json.loads(catalog_path.read_text())
    tools_by_service: dict[str, list[dict]] = {}
    for tool in catalog["tools"]:
        tools_by_service.setdefault(tool["service"], []).append(tool)
    services = []
    for service in catalog["services"]:
        if service["scope"] != "benchmark":
            continue
        manifest_path = MANIFESTS / service["id"] / "frontend" / "manifest.json"
        if not manifest_path.is_file():
            fail(f"no desktop app manifest for service {service['id']!r}")
        manifest = json.loads(manifest_path.read_text())
        icon = Path(manifest["icon"]).name
        if not (ROOT / "public" / "gui" / "icons" / icon).is_file():
            fail(f"icon {icon!r} of service {service['id']!r} is not in public/gui/icons")
        tools = tools_by_service.get(service["id"], [])
        names = [tool["name"] for tool in tools]
        if len(names) != service["toolCount"]:
            fail(f"service {service['id']!r}: {len(names)} tools listed, catalog says {service['toolCount']}")
        services.append({
            "id": service["id"],
            "name": service["name"],
            "label": label_of(service["name"]),
            "tools": service["toolCount"],
            "tile": manifest["iconBackground"],
            "icon": icon,
            "examples": examples_of(names),
            "firstTool": tools[0]["id"],
            # Every tool of the service, in the catalog's order (the order of the tool explorer).
            # A tool's catalog id is "<service id>.<name>", which is what a link to its code needs.
            "toolNames": names,
        })
    # Most tools first; the page lays the services out in this order. A later release keeps the
    # order of the paper's release, so that a service stays in its place when the reader switches.
    services.sort(key=lambda item: (-item["tools"], item["name"]))
    if keep_order_of:
        order = [item["id"] for item in json.loads(keep_order_of.read_text())["services"]]
        if set(order) != {item["id"] for item in services}:
            fail("the release has other services than the paper's release")
        services.sort(key=lambda item: order.index(item["id"]))
    return services


def validate(services: list[dict], tool_count: int = TOOL_COUNT) -> None:
    assert len(services) == SERVICE_COUNT, f"{len(services)} services, expected {SERVICE_COUNT}"
    assert sum(item["tools"] for item in services) == tool_count, f"{sum(item['tools'] for item in services)} tools, expected {tool_count}"
    assert len({item["id"] for item in services}) == len(services)
    for item in services:
        assert item["name"] and item["label"] and item["tile"] and item["icon"].endswith(".svg"), item["id"]
        assert item["tools"] > 0 and 1 <= len(item["examples"]) <= 3, item["id"]
        assert item["firstTool"].startswith(item["id"] + "."), item["id"]
        names = item["toolNames"]
        assert len(names) == item["tools"] and len(set(names)) == len(names), f"{item['id']}: the tool names do not match the tool count"
        assert item["firstTool"] == f"{item['id']}.{names[0]}" and set(item["examples"]) <= set(names), item["id"]
    written = descriptions()
    ids = {item["id"] for item in services}
    assert not ids - set(written), f"no description in {DESCRIPTIONS.relative_to(ROOT)} for: {sorted(ids - set(written))}"
    assert not set(written) - ids, f"{DESCRIPTIONS.relative_to(ROOT)} describes unknown services: {sorted(set(written) - ids)}"
    for service_id, text in written.items():
        assert text.endswith(".") and "—" not in text, f"description of {service_id!r}: end with a period, no em dash"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--validate-only", action="store_true", help="check the committed JSON against the paper's counts")
    parser.add_argument("--release", help="a later public release, for example v1.1.0: reads public/data/<release>/tool-source "
                        "and writes src/data/services.<release>.json; its tool count is the catalog's own")
    args = parser.parse_args()
    catalog_path, out = release_paths(args.release)
    # The paper states the tool count of its own release; a later release is checked against its catalog.
    tool_count = json.loads(catalog_path.read_text())["statistics"]["benchmarkToolCount"] if args.release else TOOL_COUNT
    if args.validate_only:
        validate(json.loads(out.read_text())["services"], tool_count)
        print(f"Services are consistent: {SERVICE_COUNT} services, {tool_count} tools, one description each.")
        return
    services = build(catalog_path, keep_order_of=OUT if args.release else None)
    validate(services, tool_count)
    out.write_text(json.dumps({"schemaVersion": 1, "generatedBy": "scripts/export_services.py",
                               **({"release": args.release} if args.release else {}), "services": services}, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {out.relative_to(ROOT)}: {len(services)} services, {sum(item['tools'] for item in services)} tools.")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        sys.exit(f"export_services: validation failed: {error}")
