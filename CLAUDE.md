# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## Current state of the repository

**This repository is empty.** As of the latest commit it contains exactly two files:

```
.
├── README.md    # one line: "# thebreastcode.vip"
└── CLAUDE.md    # this file
```

- History: a single commit (`9df7961`, "Initial commit", 2026-03-07).
- Branches on the remote: `main` only.
- No source code, no build tooling, no package manifest, no CI config, no tests,
  no dependency lockfile, no license.

There is therefore **no codebase structure, no build/test/lint workflow, and no
established code conventions to document yet**. The sections below are
deliberately left as unanswered questions rather than filled in with guesses.

Do not infer a tech stack from the repository name. Nothing in the repo
establishes what `thebreastcode.vip` is meant to be — the `.vip` domain name
suggests a website, but that is an assumption, not a documented fact. Ask the
user what they intend to build before scaffolding anything.

## Before you start work here

Because the repository is a blank slate, the usual "read the surrounding code and
match it" instruction has nothing to match against. Two consequences:

1. **Any first substantive change is a foundational decision** — language,
   framework, package manager, directory layout, formatting. These are the
   user's calls, not defaults to be quietly picked. If the request doesn't
   specify them and different choices would lead to materially different work,
   ask.
2. **Re-read this file's assumptions against reality.** This document was
   written when the repo was empty. If you are reading it and `git ls-files`
   shows real source files, the sections below are stale — update them as part
   of your change rather than working from them.

Quick check to see whether this file is still accurate:

```bash
git ls-files          # if this shows more than README.md and CLAUDE.md, update this file
git log --oneline -5
```

## Project overview

- **Name:** thebreastcode.vip
- **Owner:** SteveDrees1 (GitHub) — commits authored by Steve Drees
- **Purpose:** not yet documented in the repository.
- **Target runtime / deployment:** not yet documented.

When the purpose is established, replace this section with a real description of
what the project does and who it serves.

## Codebase structure

Not yet applicable — see "Current state" above.

Once code exists, this section should describe the top-level directories, where
the entry point lives, and where the interesting logic sits, so an assistant can
orient without a full-tree search.

## Development workflow

No tooling is configured. There is nothing to install, build, run, or test.

Once tooling exists, record the exact commands here, e.g. install, dev server,
build, test (full run and single-file run), lint, and format. Prefer commands
verified by actually running them over commands copied from a framework's docs.

## Conventions

None established. Once code exists, document only the conventions that are
actually observable in the codebase — naming, file layout, error handling,
typing strictness, comment density, import ordering — and skip anything that is
merely a general best practice.

## Git workflow

- The default branch is `main`.
- Work on a feature branch and push with `git push -u origin <branch-name>`.
  Automated sessions are assigned a branch (typically `claude/<topic>-<id>`) and
  must push only to that branch.
- Commit messages in this repo so far are short and imperative
  ("Initial commit"). One commit is not a strong convention; follow standard
  practice (concise imperative subject, body when the change needs explanation)
  unless the user asks for something specific such as Conventional Commits.
- Do not open a pull request unless the user explicitly asks for one.
- There is no PR template, no CODEOWNERS, and no branch protection configured.

## Things that are absent and may be worth raising

If the user starts building here, these gaps are likely to matter and are worth
mentioning once (not repeatedly, and not fixed unprompted):

- No `LICENSE` — the project is "all rights reserved" by default.
- No `.gitignore` — dependency directories and build output will be committed
  accidentally the moment a toolchain is added.
- No CI configuration.
- `README.md` is a bare title with no description, setup steps, or usage.

## Maintaining this file

Update this file in the same change that invalidates it — when the stack is
chosen, when build/test commands appear, when a directory layout settles. The
value of this document is that it is accurate; a CLAUDE.md describing a project
that does not exist is worse than none. Keep it factual about what is in the
repo, and mark inferences as inferences.
