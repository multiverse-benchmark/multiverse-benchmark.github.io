# MultiVerse project page

The project page of MultiVerse, a tool-use benchmark for real-world task delegation under harnesses. It is a static site: the pages, the leaderboard, the task explorer, the result explorer, the tool explorer, and a read-only version of the MultiVerse desktop for looking at task environments. All data ships with the site, and the pages ask no server for anything.

- Code and simulated service APIs: [google-deepmind/MultiVerse](https://github.com/google-deepmind/MultiVerse)
- Dataset: [google/MultiVerse](https://huggingface.co/datasets/google/MultiVerse) on the Hugging Face Hub

## Run locally

```bash
npm ci
npm --prefix gui-src ci
npm run build:gui
npm run dev
```

The development server prints its address. The exported data is in `public/data`, so opening a task needs no evaluation server and no credentials.

## Build and preview

```bash
npm run build
npm run preview
```

`npm run build` builds the desktop in `gui-src` into `public/gui`, type-checks the site, builds it, and copies `public/` into `dist/`. The two releases together hold about 730 MB of data under `public/`. Where disk space is short, `npm run build:linked` builds the same site and hard-links the files of `public/` into `dist/` instead of copying them.

Vite uses a relative base and task links use URL fragments, so the site works at a domain root and beneath a repository path without a rewrite rule.

## Checks

The data checks use Python's standard library:

```bash
npm run validate:data          # exported tasks and states of both releases
npm run validate:tools         # tool source snapshots of both releases
npm run validate:leaderboard   # leaderboard data of v1.1.0
npm run validate:runs          # runs behind the v1.1.0 validation leaderboard
npm run validate:showcase      # the worked example
PYTHONPATH=scripts python3 -m unittest discover -s scripts/tests
npm run test:calendar
```

The browser tests use [Playwright](https://playwright.dev/). With the preview running, pass its address:

```bash
BASE_URL=http://localhost:4173/ npm run test:browser      # task explorer
BASE_URL=http://localhost:4173/ npm run test:task-views   # focused view, hints, run view
BASE_URL=http://localhost:4173/ npm run test:runs         # runs and result explorer
BASE_URL=http://localhost:4173/ npm run test:leaderboard  # leaderboard and its intervals
BASE_URL=http://localhost:4173/ npm run test:tools        # tool explorer
BASE_URL=http://localhost:4173/ npm run test:tools:wrap
BASE_URL=http://localhost:4173/ npm run test:gui          # desktop, all 35 services
BASE_URL=http://localhost:4173/ npm run test:gui:embedding
BASE_URL=http://localhost:4173/ npm run test:gui:storage
BASE_URL=http://localhost:4173/ npm run test:gui:demo     # worked example in the desktop
BASE_URL=http://localhost:4173/ npm run test:gui:records
BASE_URL=http://localhost:4173/ npm run test:calendar:browser
```

`PLAYWRIGHT_MODULE` names a Playwright installation outside this project, `BROWSER_EXECUTABLE` a browser to use instead of Playwright's own, and `QA_OUTPUT_DIR` the folder for screenshots and reports (`artifacts/tests` by default).

## Pages

The site has three pages, built as separate entries (`vite.config.ts`). They share the header, the footer, and the handling of section links in `src/components/site/SiteChrome.tsx`.

- `index.html` (`src/App.tsx`), the main page: the paper's title block, the overview figure, the tools and the environment, the task settings, the worked example of the paper's Figure 1, the results, the benchmark's assessment against the Agentic Benchmark Checklist, and links to the deep dive.
- `deep-dive.html` (`src/DeepDive.tsx`): the task explorer, the result explorer (v1.1.0), the design dimensions and the benchmark comparison, the dataset statistics, the tool explorer, and how the two releases differ. A link on the main page to one of these sections, or to a task (`#task=...`), leads here.
- `coming-soon.html` (`src/ComingSoon.tsx`): the placeholder behind a link whose target is not public. `PAPER_URL`, `CODE_URL`, and `DATA_URL` in `src/content/citation.ts` hold the addresses of the paper, the code, and the dataset.

Text that comes from the paper is in `src/content/`, and each block names the part of the paper it comes from. The colours are tokens (`--mv-*` in `src/components/paper/paper.css`, with light and dark values), so a component needs no rule of its own for the dark theme.

## Releases

The benchmark has two releases. v1.0.0 is the version the paper describes and runs its experiments on. v1.1.0 is recommended for new evaluations and extensions. One switch at the corner of the window turns the whole site from one release to the other (`src/lib/release.ts`); a link can name a release with `?release=v1.0.0` or `?release=v1.1.0`.

The results section shows the paper's results for v1.0.0 (twelve models, five harnesses, three runs) and, for v1.1.0, the leaderboard with one tab for the validation set and one for the hidden test set.

| | v1.0.0 | v1.1.0 |
| --- | --- | --- |
| tasks and saved states | `public/data/` | `public/data/v1.1.0/` |
| tool source | `public/data/tool-source/` | `public/data/v1.1.0/tool-source/` |
| services | `src/data/services.json` | `src/data/services.v1.1.0.json` |
| dataset statistics | `src/data/paper/dataset.json` | `src/data/dataset.v1.1.0.json` |
| results | `src/data/paper/leaderboard.json` | `src/data/leaderboard.v1.1.0.json` |
| runs of the leaderboard models | | `public/data/v1.1.0/runs/` |

## Data

**Tasks.** The exported tasks are the validation tasks of the two releases: 396 for v1.0.0 (100 ST, 97 IF, 100 MT, 99 MTIF) and 400 for v1.1.0 (100 per setting). They come from the dataset on the Hugging Face Hub, where each release is the revision of the same name. The dataset holds validation tasks only; the export stops at a file of any other split, so hidden test tasks cannot enter the site. Each task carries its contamination canary. Task details and states are stored as `.json.gz` and decompressed in the browser; only the index and the task or state that is opened are fetched.

**States.** A task's initial state is extracted from its authored initialization data. Its gold final state is reconstructed by applying the authored database changes of the gold solution to the initial state. It is not a complete runtime snapshot and not the outcome of a scored run. No task code runs during export or browsing.

**Tool source.** The source of each release is its folder of API files in the code repository, `api_runtime/<release>/`. The export reads the Python files under the folder's `APIs/` and the schema files under its `Schemas/` as bytes, without running any of the code, and checks each one against the release's list of file hashes (`SHA256SUMS`). v1.0.0 has 809 tools in 35 services (1,928 Python files, tests included), which matches every per-service tool count in the paper; v1.1.0 has 827 tools (2,412 files). The tool explorer shows the source and links each file to the same file in the repository. Line counts are measured from the snapshot. The statement coverage is the paper's figure for v1.0.0 and, for v1.1.0, the figure measured by running the tests of its files (`src/data/coverage.json`).

**Results.** For v1.1.0 the site holds one cell per model, harness, and task setting, with the counts behind it and a 95% task-bootstrap confidence interval. No per-task outcome of the test set is part of the site. The runs behind the validation leaderboard are exported as well: for each validation task and each model, the scored trajectory with the verdict, votes, and rationale of every verifier.

**Canaries.** The benchmark asks that its data be excluded from training corpora and marks it with a canary (see `CANARY.md` in the code repository). On this site, each task file, state file, and run file carries the contamination canary of its task (`contaminationCanary`), and each Python file of the tool source carries the benchmark marker in a comment after its license header, as in the code repository. The canary of a run or a state is a field of the file, outside the trajectory and the state data.

**Worked example.** The main page embeds the desktop with the paper's dinner example (`public/data/demos/figure1-message-demo/`, summarized in `public/data/dinner-showcase.json`). It illustrates the benchmark's characteristics together and is not one of the validation tasks. Its initial and final states are complete simulator snapshots; the final state is the replay of the authored tool calls, not a scored model run.

## Regenerate the data

The committed data can be checked without any input (see Checks). Regenerating it needs the inputs named below.

Tasks, from the dataset on the Hub (Python 3.11+, `pip install -r scripts/requirements-export.txt`; a private dataset needs an access token in `HF_TOKEN`; `--dataset` reads another repository or a local copy):

```bash
python3 scripts/export_validation.py --release v1.0.0
python3 scripts/export_validation.py --release v1.1.0
```

v1.0.0 is exported first, because the export of v1.1.0 marks which of its tasks v1.0.0 also has.

Tool source and the files derived from it, from the API files of the code repository:

```bash
python3 scripts/export_tools.py --release v1.0.0 --source /path/to/repository/api_runtime/v1.0.0
python3 scripts/export_services.py
python3 scripts/export_tools.py --release v1.1.0 --source /path/to/repository/api_runtime/v1.1.0
python3 scripts/export_services.py --release v1.1.0
python3 scripts/export_dataset_stats.py --release v1.1.0
```

`export_tools.py` stops when the coverage record of a release was measured on other files than the ones it is given (the record names the hash of the release's `SHA256SUMS`): measure the new files and update `src/data/coverage.json` first.

The remaining exports read files that are not part of this repository:

- `scripts/export_leaderboard.py` and `scripts/export_runs.py` read the result files and the run records of an evaluation of v1.1.0. Only aggregates of the test set are written.
- `scripts/export_paper.py` reads the paper's source for the results of v1.0.0, the benchmark comparison, and the checklist assessment.
- `scripts/export_demo.py` and `scripts/export_showcase.py` read the simulator snapshot of the worked example.

How a submitted model's runs are added to the run data is described in [docs/run-submissions.md](docs/run-submissions.md).

## Deployment

`.github/workflows/deploy.yml` builds the site and deploys `dist` to GitHub Pages. It is started by hand (**Actions → Deploy to GitHub Pages → Run workflow**), with **Settings → Pages → Source** set to GitHub Actions. The site's public address, the optional Google Analytics measurement ID, and the optional Search Console verification token are build variables; [docs/seo-and-analytics.md](docs/seo-and-analytics.md) describes them.

## License

`LICENSE.md` is the license of this repository. The desktop in `gui-src` has its own license file (`gui-src/LICENSE.upstream`), and the tool source shown in the tool explorer has the license file of the code repository (`public/data/tool-source/LICENSE`). A file that carries its own notice keeps it. The task data follows the license of the dataset.
