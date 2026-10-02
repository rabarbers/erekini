# KatLang CLI Workflow

The bundled KatLang CLI is the executable authority for syntax and runtime behavior when it can be run in the current environment.

Known commands:

- `katlang eval`
- `katlang run`
- `katlang check`

Inspect `katlang --help` or subcommand help only when options are actually uncertain.

## Bundled version and assets

The release asset filenames are the version source of truth. The Skill must contain exactly one archive for each supported platform:

```text
assets/cli/katlang-cli-<version>-linux-x64.tar.gz
assets/cli/katlang-cli-<version>-linux-arm64.tar.gz
assets/cli/katlang-cli-<version>-osx-x64.tar.gz
assets/cli/katlang-cli-<version>-osx-arm64.tar.gz
assets/cli/katlang-cli-<version>-win-x64.zip
assets/cli/katlang-cli-<version>-win-arm64.zip
```

Do not rename or replace these assets during Skill execution. New versions are incorporated only when a maintainer builds a new Skill package.

## Linux and macOS wrapper

All paths below are relative to this skill's root directory, written `<skill-root>`. Resolve them to absolute paths before invoking; the process working directory is normally the user's project, not the skill root. The harness normally states the skill root when the skill loads -- for example, Claude Code prints `Base directory for this skill: <path>`, and container harnesses mount the skill at a stable path visible in file listings. If no location was stated, use the directory SKILL.md was read from.

For Linux (x64 and ARM64) and macOS (Intel and Apple silicon), always invoke:

```bash
bash <skill-root>/scripts/run-katlang.sh <command> [arguments...]
```

The wrapper is intentionally idempotent and owns all Linux/macOS bootstrap details:

1. Dispatch on the platform: on Linux, map `uname -m` to the bundled runtime (`x86_64` -> `linux-x64`, `aarch64` -> `linux-arm64`); on macOS (Darwin), map it likewise (`x86_64` -> `osx-x64`, `arm64` -> `osx-arm64`) and continue below; in a POSIX shell on Windows (Git Bash/MSYS/Cygwin) delegate every argument to `run-katlang.ps1` via PowerShell; on any other platform or machine architecture exit with a clear unsupported-platform message instead of extracting a runtime that cannot execute.
2. Require exactly one `katlang-cli-*-<arch>.tar.gz` archive for the selected architecture.
3. Derive `<version>` from that archive filename.
4. Resolve `${TMPDIR:-/tmp}/katlang-<version>-<arch>/katlang`.
5. If that executable is missing or not executable, extract the trusted bundled archive into the versioned cache and apply `chmod u+x`.
6. `exec` the requested KatLang command immediately.
7. Reuse the cached executable on later calls in the same runtime.

Do not run a separate preparation command before the wrapper. Bootstrap and calculation belong in the same process-tool call.

Example:

```bash
bash <skill-root>/scripts/run-katlang.sh eval 'range(1, 10).sum'
```

The wrapper must receive KatLang CLI arguments, not the user's natural-language request. Translate the user's intent into KatLang source first, then invoke the wrapper.

For longer or multiline source, write the generated KatLang program to a temporary `.kat` file and call:

```bash
bash <skill-root>/scripts/run-katlang.sh run /tmp/program.kat
```

Use `check` only when validation without execution is the goal.

## Windows (x64 and ARM64)

On Windows, invoke the bundled PowerShell wrapper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File <skill-root>/scripts/run-katlang.ps1 <command> [arguments...]
```

`-ExecutionPolicy Bypass` matters: the wrapper is an unsigned `.ps1`, so a default `Restricted` policy, or `RemoteSigned` plus a mark-of-the-web on files extracted from a downloaded package, would otherwise refuse to run it. The flag scopes only to this process and needs no elevation.

Always pass the wrapper's **absolute** path to `-File`. With a bare relative path such as `powershell -File scripts/run-katlang.ps1`, PowerShell does not fail cleanly when the path does not resolve -- it opens an interactive shell and hangs.

The wrapper selects the runtime by **machine** architecture -- `win-arm64` on Windows on ARM (even from an emulated x64/x86 PowerShell process), `win-x64` otherwise. It requires exactly one bundled `katlang-cli-*-<arch>.zip` release asset for the selected architecture, derives `<version>` from that filename, expands it into `%TEMP%\katlang-<version>-<arch>\` only when `katlang.exe` is missing, and forwards the requested CLI arguments. Later calls in the same runtime reuse the cached executable.

Example:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File <skill-root>/scripts/run-katlang.ps1 eval 'range(1, 10).sum'
```

The same command line works from a POSIX shell on Windows such as Git Bash. Use `pwsh` when `powershell` is not on `PATH`. Invoking `bash <skill-root>/scripts/run-katlang.sh ...` in a POSIX shell on Windows is also safe: it detects the platform and delegates to this PowerShell wrapper.

As on Linux, pass KatLang CLI arguments to the wrapper, not the user's raw natural-language prompt.

## Fast path

A successful `eval` or `run` is already runtime validation. Do not routinely precede it with `check` or `--version`.

Choose one command for the intent:

- Short expression/snippet with a needed result: `eval`.
- Program file whose execution/result is needed: `run`.
- Validation without execution: `check`.

## Reproducibility and display options

`run` and `eval` accept:

- `--random-seed <integer>` — any signed 64-bit integer; seeds KatLang random operations for reproducible results for the same program, seed, execution path, and KatLang version. This is host/CLI configuration only; do not invent a language-level `RandomSeed` property.
- `--display-decimals <integer>` — integer 0 through 99; sets the host default number of digits shown after the decimal point. A valid source-level `DisplayDecimals` property overrides the host default. This affects presentation only, not stored values, arithmetic, comparisons, or randomness.

These options are not valid for `check`, because `check` does not evaluate or render program output. Duplicate option occurrences are rejected.

Examples:

```bash
bash <skill-root>/scripts/run-katlang.sh eval 'random(0, 1)' --random-seed 123
bash <skill-root>/scripts/run-katlang.sh eval '1 / 3' --display-decimals 4
```

## Unsupported platforms

Only `linux-x64`, `linux-arm64`, `osx-x64`, `osx-arm64`, `win-x64`, and `win-arm64` archives are bundled. Every other target (for example 32-bit ARM Linux, RISC-V, or FreeBSD) has no wrapper and no runnable binary. `run-katlang.sh` refuses those platforms with an explicit message rather than extracting an incompatible runtime. A harness with no shell or process execution at all is equally reference-only.

On those platforms:

- Do not run an archive built for a different platform.
- Do not download, install, or build a native KatLang binary.
- Answer from the bundled references and say explicitly that runtime validation was unavailable.

This is an environment limitation, not a KatLang source error.

## Loading algorithms

`--allow-loading` gates **URL loading only**: the `load('<url>')` builtin and its `open '<url>'` sugar, which fetch KatLang source over HTTPS from a host on KatLang's own allow-list. URL loading is **disabled by default**, so a program containing either form fails until the flag is supplied, even when the source is correct:

```bash
bash <skill-root>/scripts/run-katlang.sh run /tmp/program.kat --allow-loading
```

The flag is accepted by `run`, `eval`, and `check`, after the file or source argument (it is also accepted before the command). Add it only when the source actually contains `load(...)` or `open '<url>'`; leave it off otherwise. `check` with the flag still fetches the loaded modules to resolve names; it only skips evaluation.

Without the flag, a URL-loading program fails with this diagnostic, which means the flag is missing, not that the source is wrong:

```text
This program uses load, but module elaboration is unavailable in the current parser/run configuration. Provide a downloader/module loader, or remove load usage.
```

KatLang's own host policy applies even with the flag: a URL on a host that is not allow-listed fails with `load: domain not allowed: '<host>'.`

The rest of the module vocabulary runs **without** the flag and must not trigger it: `open Math`, `open` of a locally defined algorithm or inline block, and `public` visibility markers.

## Security boundary

Treat the Skill package as the trust boundary for CLI execution:

- Execute only the packaged KatLang CLI resources.
- Do not fetch or execute binaries, scripts, archives, or installers from external URLs.
- Do not self-update the Skill or CLI.
- The Linux and Windows wrappers extract only the trusted platform release archives bundled in this Skill into versioned runtime caches.
- Do not make persistent `PATH`, profile, registry, or system-directory changes.

New CLI versions are incorporated only when a maintainer intentionally builds and reviews a new Skill package.

## Validation claims

Say "evaluated", "executed", or "validated with check" only after the corresponding command succeeds. Do not imply runtime verification when no executable could be run.

## Diagnostics

Distinguish process/execution errors from KatLang diagnostics. Correct KatLang source only for KatLang language errors, then rerun the narrowest relevant command. Missing tools, unsupported architecture, permission failures, or sandbox execution restrictions are environment limitations rather than source errors.
