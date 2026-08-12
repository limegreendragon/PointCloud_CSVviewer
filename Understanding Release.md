# Understanding `release.yml`

This document explains the GitHub Actions workflow that automatically builds `PointCloudViewer` for Windows and Mac and publishes both to the repo's Releases page whenever a version tag is pushed.

---

## Part 1: Basic YAML syntax

GitHub Actions workflow files are written in **YAML**, a plain-text format for describing structured data.

| Syntax | Meaning |
|---|---|
| `key: value` | The basic unit — a setting name and its value. |
| Indentation (spaces) | YAML uses indentation instead of brackets to show what's "inside" what — similar to Python. **Spaces only, never tabs.** |
| `- item` | A dash means "this is one entry in a list." Several `-` lines in a row form a list. |
| `#` | Starts a comment — ignored by GitHub, just a note for humans. |
| `key: \|` then indented lines | Treats several lines as one multi-line value — used here for multi-line shell commands. |
| `${{ ... }}` | An **expression** — GitHub Actions evaluates whatever's inside and substitutes the result. |
| `secrets.SOMETHING` | A reference to an encrypted value GitHub stores for the repo, never written in plain text. |

---

## Part 2: The structure — Workflow → Jobs → Steps

Every GitHub Actions file has three nested layers:

```
Workflow (the whole file)
 └─ Jobs (one or more — each runs on its own separate machine)
     └─ Steps (an ordered list of commands within a job)
```

Our file has **two jobs** (`build` and `release`), and `build` itself is told to run **twice** (once for Windows, once for Mac) via a matrix — more on that below.

### Glossary — every keyword used in this file

| Keyword | Level it appears at | What it actually means |
|---|---|---|
| `name:` (top of file) | Workflow | A human-readable label for the whole workflow, shown in the Actions tab. Purely cosmetic. |
| `on:` | Workflow | Defines the *trigger* — the event that causes this workflow to run at all. |
| `push:` / `tags:` | Inside `on:` | Narrows the trigger to pushes of a tag matching the pattern `v*`, rather than every commit. |
| `permissions:` | Workflow | Grants the automated token this workflow run uses specific rights on the repo — here, `write` access, since creating a Release counts as writing. |
| `jobs:` | Workflow | The container that holds every job in the file. |
| `build:` and `release:` | Under `jobs:` | **These are job *names*, not reserved keywords.** GitHub doesn't treat "build" or "release" specially — you could rename them `job1` and `job2` and nothing would break. They're named this way here purely so a human reading the file can tell what each one does. |
| `strategy:` | Job level | Tells a job: "don't just run once — run several variations of yourself." It's the setting that switches on the matrix behaviour below. |
| `matrix:` | Under `strategy:` | Defines exactly what's different between each variation. Think of it as a small table — each row is one complete run of the job, with different values substituted in. |
| `include:` | Under `matrix:` | One specific way of writing a matrix: an explicit list of complete rows, rather than letting GitHub auto-generate *every* combination from separate lists. It's used here because `os` and `artifact` are paired on purpose — Windows must always go with the Windows zip name, Mac with the Mac zip name — not every possible mix of the two. |
| `os:` and `artifact:` (inside `include`) | Matrix variables | These two names are **made up by whoever wrote the file** — they are not built-in GitHub keywords. Once defined, they become variables usable elsewhere as `matrix.os` and `matrix.artifact`. You could rename `artifact` to `zipname` throughout and the workflow would work identically. |
| `runs-on:` | Job level | Chooses which machine image runs the job. Here it's set to `${{ matrix.os }}`, so it becomes `windows-latest` for one run of the job and `macos-latest` for the other. |
| `steps:` | Job level | The ordered list of individual actions a job performs, executed top to bottom. |
| `name:` (inside a step) | Step level | A label for that one step, shown in the run log. Cosmetic only, doesn't affect execution. |
| `uses:` | Step level | Runs a pre-built, reusable "action" published by GitHub or the community — like installing a plugin — instead of writing raw commands by hand. |
| `with:` | Step level | The input parameters handed to a `uses:` action, similar to arguments passed to a function. |
| `run:` | Step level | Executes raw shell/terminal commands directly, as an alternative to `uses:`. |
| `if:` | Step level | A condition. The step only executes when the condition evaluates to true — used here to separate the Windows-only and Mac-only packaging steps. |
| `needs:` | Job level | Makes one job wait until another job has completely finished before it starts. Used so the `release` job doesn't try to grab build files before they exist. |
| `env:` | Step level | Sets environment variables available inside that step's command. |
| `secrets.GITHUB_TOKEN` | Expression | A temporary credential GitHub automatically generates for every workflow run, letting that run act on the repo (e.g. create a Release) without you ever storing a password. |

### Seeing the matrix expand

The `strategy` / `matrix` / `include` block:

```yaml
strategy:
  matrix:
    include:
      - os: windows-latest
        artifact: PointCloudViewer-Windows.zip
      - os: macos-latest
        artifact: PointCloudViewer-Mac.zip
```

is GitHub's shorthand for: *"run the `build` job twice, once per row below"* —

| Run | `matrix.os` | `matrix.artifact` |
|---|---|---|
| 1 | `windows-latest` | `PointCloudViewer-Windows.zip` |
| 2 | `macos-latest` | `PointCloudViewer-Mac.zip` |

Every step underneath — checkout, install Python, build, package, upload — runs in full for *each* row, on a separate temporary cloud machine, at the same time. That's the whole mechanism that gets you a Windows build and a Mac build out of one file instead of writing everything twice.

---

## Part 3: Walkthrough of what each block does

### Trigger

```yaml
on:
  push:
    tags:
      - 'v*'
```
Only runs when a tag starting with `v` is pushed (e.g. `v1.0.0`) — not on every regular commit.

```yaml
permissions:
  contents: write
```
Grants write access so the later step can create a Release.

### `build` job

```yaml
- name: Check out code
  uses: actions/checkout@v4
```
Downloads a fresh copy of the repo onto the temporary machine — the same idea as `git clone`.

```yaml
- name: Set up Python
  uses: actions/setup-python@v5
  with:
    python-version: '3.11'
```
These machines start blank, so this installs Python 3.11.

```yaml
- name: Install dependencies
  run: |
    pip install -r Requirements.txt
    pip install pyinstaller
```
Installs pandas, numpy, plotly, tkinterdnd2 (from `Requirements.txt`), plus PyInstaller — the packaging tool.

```yaml
- name: Build with PyInstaller
  run: pyinstaller --onefile --windowed --name PointCloudViewer --collect-all tkinterdnd2 Convert_and_plot.py
```
The actual "compile" step — bundles Python itself and every library the script needs into one standalone program. `--onefile` = single file, `--windowed` = no console window behind the GUI, `--collect-all tkinterdnd2` = make sure the drag-and-drop library's native files are included (PyInstaller sometimes misses these).

```yaml
- name: Package (Windows)
  if: runner.os == 'Windows'
  run: |
    cd dist
    Compress-Archive -Path PointCloudViewer.exe -DestinationPath ../${{ matrix.artifact }}

- name: Package (macOS)
  if: runner.os == 'macOS'
  run: |
    cd dist
    zip -r ../${{ matrix.artifact }} PointCloudViewer.app
```
Each `if:` restricts the step to its matching OS. Zips up PyInstaller's output — `.exe` on Windows, the `.app` bundle (a folder, really) on Mac.

```yaml
- name: Upload build artifact
  uses: actions/upload-artifact@v4
  with:
    name: ${{ matrix.artifact }}
    path: ${{ matrix.artifact }}
```
Each temporary machine is deleted once its job ends, so this stashes the zip in GitHub's temporary storage for the next job to pick up.

### `release` job

```yaml
release:
  needs: build
  runs-on: ubuntu-latest
```
Waits for both `build` runs (Windows and Mac) to finish. Runs on Linux, but only because this job just moves files around — it doesn't build anything itself.

```yaml
- name: Download all artifacts
  uses: actions/download-artifact@v4
  with:
    path: artifacts
```
Retrieves both zips saved earlier.

```yaml
- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    files: artifacts/*/*
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
A community-built action that creates the Release entry and attaches both zips — the same end result as manually clicking "Draft a new release" and uploading files by hand.

---

## Part 4: What this does and doesn't cover

- **Windows and Mac desktop only** — that's what the two matrix rows specify. A Linux build could be added the same way (a third `include` row using `ubuntu-latest`), since PyInstaller supports Linux too.
- **Phones and tablets are out of scope.** iOS and Android don't run desktop Python/Tkinter apps — no PyInstaller flag produces an iPhone or iPad app. Reaching mobile would mean rewriting the app with a mobile-specific toolkit (like Kivy or BeeWare) or a native rewrite in Swift/Kotlin.
- **Apple Silicon vs Intel Macs:** GitHub's Mac runners are Apple Silicon (M-series), so the `.app` runs natively on newer Macs. On an older Intel Mac it typically still works via Rosetta (Mac's built-in translator); PyInstaller can be configured to build for both chip types if that ever becomes a problem.
- **Unsigned app warning:** since this isn't signed with a paid Apple Developer certificate, macOS will warn the app is from an "unidentified developer" the first time it's opened — users need to right-click → Open instead of double-clicking.

---

## Full workflow file

Save this as `.github/workflows/release.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'          # runs whenever you push a tag like v1.0.0

permissions:
  contents: write     # needed so the workflow can create a Release

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            artifact: PointCloudViewer-Windows.zip
          - os: macos-latest
            artifact: PointCloudViewer-Mac.zip
    runs-on: ${{ matrix.os }}
    steps:
      - name: Check out code
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r Requirements.txt
          pip install pyinstaller

      - name: Build with PyInstaller
        run: pyinstaller --onefile --windowed --name PointCloudViewer --collect-all tkinterdnd2 Convert_and_plot.py

      - name: Package (Windows)
        if: runner.os == 'Windows'
        run: |
          cd dist
          Compress-Archive -Path PointCloudViewer.exe -DestinationPath ../${{ matrix.artifact }}

      - name: Package (macOS)
        if: runner.os == 'macOS'
        run: |
          cd dist
          zip -r ../${{ matrix.artifact }} PointCloudViewer.app

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: ${{ matrix.artifact }}

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: artifacts/*/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
