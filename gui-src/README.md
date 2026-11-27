# MultiVerse static desktop

This is the actual MultiVerse desktop GUI, adapted to read the site's exported validation-task snapshots. It retains the original app implementations, dock, movable/resizable windows, and light/dark themes. The browser loads one selected task and phase; it does not run Python, an agent, or a service backend.

## Build

From the project root:

```sh
npm --prefix gui-src ci
npm --prefix gui-src run build
```

Vite writes lazy-loaded app bundles into `public/gui`. The project build copies these into the deployed static site. `gui/index.html?task=TASK_ID&phase=initial` opens a task; `phase=final` opens its reconstructed reference state. The explicit `index.html` path also works through the parent Vite development server. Add `app=gridwell_mail` (or another service ID) to choose the first native window.

The homepage's dinner example opens `gui/index.html?demo=figure1-message-demo&phase=initial` (or `final`) with the matching selected app. Its complete seven-service snapshots live separately under `data/demos/figure1-message-demo/`; the demo is not one of the 400 validation tasks. `python3 scripts/export_demo.py` exports both the compact homepage records and these full snapshots from the same recorded simulator cache. The GUI labels this as an illustrative adaptation and distinguishes its replayed final state from validation tasks' reconstructed reference states.

## Data contract and provenance

The browser fetches `../data/states/{task}/{phase}.json.gz` and `../data/tasks/{task}.json.gz` relative to `gui/index.html`. `snapshotBackend.ts` supplies the existing frontends' configuration, service-list, task-clock and state-read APIs in memory. `snapshotReadTools.ts` and `snapshotExtraReadTools.ts` implement selected read projections. Calls that would change data are not implemented. Unknown reads and missing fields report their limitations; all source fields remain available in each window's **Snapshot data** browser. Native rendering errors also fall back to this browser.

Initial data is extracted from literal initialization inputs without executing setup code. Final data is reconstructed by applying the authored reference database diff to that initial data. These views do not claim runtime normalization, execution, or validated model outcomes. The Desktop's **Snapshot details** control shows the selected export's exact provenance, warnings and reconstruction notes. The task clock follows the authored global context, where present.

Native app read support is explicit in `supportedNativeServices`; it is not full API emulation. Native controls can depend on omitted runtime defaults or methods outside the adapter. Mutation controls inherited from some apps may remain visible, but they cannot alter the selected snapshot. External data requests and inline scripts in authored HTML are blocked by the entrypoint's Content Security Policy.

Content-related browser storage is isolated in memory for each desktop load. Dismissed notifications, deleted spreadsheet IDs, starred documents, blocked contacts, local media uploads, note undo buffers and similar caches cannot leak into another task or phase. Existing browser data is left untouched. Theme and notes-layout preferences remain persistent; window geometry stays in session storage and is clamped to the current viewport. Badges are derived from the current app instead of restored from a previous task.

## Source

This folder holds the frontend of the MultiVerse desktop GUI: the desktop shell in `frontend/` and one app per service in `apps/`. Its Apache 2.0 license is in `LICENSE.upstream` and is distributed with the built GUI.

The files that make the desktop read saved states are `frontend/src/snapshotBackend.ts`, `snapshotReadTools.ts`, `snapshotExtraReadTools.ts`, `snapshot.css`, and `components/SnapshotInspector.tsx`. The desktop shell has controls for the provenance and the phase of a snapshot, inspection tabs, responsive window bounds, and accessible labels for the dock and the windows. `useBackendAPI` broadcasts no data-change event after a read.
