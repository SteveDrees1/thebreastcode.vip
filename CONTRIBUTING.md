# Contributing

## Branch per unit of work

Every completed feature, bug fix or issue gets **its own branch**, cut fresh
from `main`, and is pushed when the work is done.

```bash
git checkout main && git pull
git checkout -b feature/short-description/complete
# …work…
git commit -m "feature: short description of the change"
git push -u origin feature/short-description/complete
```

### Naming

```
{type}/{short-description}/{status}
```

| Segment | Values |
| ------- | ------ |
| `type` | `feature`, `bug`, `issue`, `chore`, `docs` |
| `short-description` | lowercase, hyphenated, 2–5 words |
| `status` | `complete`, `in-progress`, `blocked`, `review` |

Examples:

```
feature/admin-audit-log/complete
bug/mobile-header-nav/complete
issue/stripe-tax-registration/blocked
chore/dependency-refresh/in-progress
```

### Why not `[feature - description - status]`

Git will not create it. Ref names cannot contain a space or an opening bracket:

```console
$ git check-ref-format --branch "[feature - add audit log - complete]"
fatal: '[feature - add audit log - complete]' is not a valid branch name
```

Both characters are rejected by `git check-ref-format`, along with `~ ^ : ? *`
and `\`. The convention above keeps the same three parts — type, description,
status — in the closest form git accepts. Slashes are used as the separator
rather than hyphens because most git UIs render them as folders, so branches
group by type on their own.

Check any name before you use it:

```bash
git check-ref-format --branch "feature/my-thing/complete"
```

## Commit messages

Prefix the subject with the same type, then say what changed and why:

```
feature: add read-only auditor role

can_audit is a separate column from is_admin rather than a rank below it:
is_admin implies read, can_audit never implies write…
```

- **Subject**: `type: imperative summary`, under ~70 characters.
- **Body**: what changed and *why*. Explain the reasoning behind a non-obvious
  choice, and name anything that was verified rather than assumed.
- Note limitations honestly. A commit that says which case is not covered is
  worth more than one that implies everything is.

## Before pushing

```bash
npm run typecheck
npm run lint
npm run verify:entitlements   # scratch database only
npm run verify:exposure
npm run build
```

`verify:entitlements` and `verify:exposure` both write to and delete from the
database. Never point them at production.
