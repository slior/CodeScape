---
name: record-decisions
description: >-
  Extracts design decisions from a plan, asks which ones to record, and writes
  architecture decision records under docs/adrs. Use when asked to record
  decisions, write an ADR, or turn a plan into architecture decision records.
---

# Record decisions

Read a plan, list the design decisions in it, and wait. Write an ADR only for a decision the user picks. An ADR states the decision. It does not cite the plan, a spec, a design doc, or a git commit.

`docs/adrs/` holds the records already accepted. Read them before proposing new ones. Match their tone.

## Inputs

| Input | Required | Meaning |
| --- | --- | --- |
| Plan file | Yes | Path to one plan. If it is missing, ask for it and stop. |
| Decisions | No | The user may name decisions up front. Still show the full list and wait, unless they already picked from a list you showed in this conversation. |

Do not commit. Do not create a README or an index.

## Steps

Copy this checklist and finish it in order.

```
- [ ] 1. Read the existing ADRs
- [ ] 2. Read the plan
- [ ] 3. List decisions and their dependencies
- [ ] 4. Stop for the user's pick
- [ ] 5. Number the picked decisions
- [ ] 6. Write one ADR per pick
- [ ] 7. Check each file
- [ ] 8. Report the paths
```

### 1. Read the existing ADRs

Read every `docs/adrs/*.md`. If the directory is empty, numbering starts at `001`.

From each file, keep:

- The number and the title.
- The accepted date.
- Every ADR named under **Depends on**.
- The decision in one sentence.

A plan that repeats an accepted decision does not get a second ADR. Say that it is already recorded, and give the link. If the plan contradicts an accepted ADR, say so in the review list. Do not overwrite the file unless the user asks for an update.

### 2. Read the plan

Read the whole plan. The plan is evidence for you. It is not a source the ADR will name.

Take the accepted date from a date written in the plan, or from a `YYYY-MM-DD` in the plan's filename. Use that same date for every decision that comes from that plan. If you cannot find a date, ask before writing. Do not read `git log` to invent one.

### 3. List decisions and their dependencies

A **design decision** is one of these:

- A technology choice, including languages, frameworks, libraries, test runners, and module systems.
- A code-organization choice: packages, dependency direction, or which module owns which step.
- A contract that would be expensive to change: shared types, ids, file format, coordinate rules, error policy, or an algorithm whose output other packages store or draw.

A **product decision** is a choice about what the user sees or the metaphor for the domain. Do not propose a product decision as an ADR. Keep it in a separate list. If a design decision needs that product fact, the later ADR will carry the fact in its Context.

Split a plan into decisions a person could accept or reject on their own. Do not merge "use Postgres" and "shard by tenant" into one row. Do not split one rule into a row per constant.

For each design decision, record:

- A review id, `D1`, `D2`, … This is not the ADR number.
- One sentence that states the choice.
- Kind: technology, organization, or contract.
- Depends on: review ids, and existing ADR numbers, that must be true first.
- Why a change is expensive, in one sentence.

Order the rows so a decision comes after everything it depends on.

### 4. Stop for the user's pick

Show two tables, then stop. Do not write files in this turn.

**Design decisions**

| Id | Decision | Kind | Depends on | Why a change is expensive |
| --- | --- | --- | --- | --- |

**Product context, not proposed as ADRs**

| Fact | Used by |
| --- | --- |

`Used by` lists the design-decision ids that need that fact.

Ask which design decisions to record. The user may add a product row. Tell them ADR numbers are assigned after the pick, in dependency order, continuing from the highest file in `docs/adrs/`.

Wait for the answer. A vague "go ahead" is not a pick. Ask which ids.

### 5. Number the picked decisions

Drop anything the user did not pick.

Order the rest so each one follows the decisions it depends on. Dependencies on existing ADRs are already numbered.

Assign `NNN` from the next free number. `docs/adrs/014-something.md` means the next file is `015`. Use three digits. Do not reuse a number. Do not fill gaps.

A picked decision that depends on a decision the user skipped does not get a new ADR for the skipped part. Fold the needed facts into the picked ADR. Say in Context that there is no ADR for that part.

The filename is `docs/adrs/NNN-short-kebab-title.md`. The kebab title is a few words from the heading, lowercase, hyphens, no number repeated in the slug beyond the prefix.

### 6. Write one ADR per pick

Write the file yourself. One decision, one file.

Before writing a file, re-read the ADRs it depends on, including ones you wrote earlier in this run. Use their titles verbatim in links.

```markdown
# NNN - Decision title

## Status

Accepted on YYYY-MM-DD.

Depends on:

- [001 - Decision title](001-decision-title.md)

## Context

## Decision

## Consequences
```

If nothing earlier applies, Status says `This record has no earlier ADR.` and has no Depends on list.

#### Status

- The first line is `Accepted on YYYY-MM-DD.`
- Then the dependency links, or the sentence that there is no earlier ADR.
- A link's text is the heading of that file without the leading `# `.
- The target is the filename in the same directory.
- You may add one sentence when this record also holds a choice that has no ADR of its own. Say that, and why this record needs it.
- Do not name a plan, a spec, a design doc, a commit, a hash, or a path outside `docs/adrs/`.
- Do not explain the numbering with implementation history.

#### Context

Why this choice is in front of us, given the ADRs it depends on. Two or three short paragraphs.

Include a product fact only when the decision is unclear without it. Include a skipped decision only to the extent this decision uses it.

Do not restate the whole dependency. Link it, then say what this record still has to settle.

#### Decision

The choice, in enough detail that a later change can see what it would break.

Include the rules that define the decision: order of steps, tie-breaks, shared numbers, who owns I/O, what is fatal, what is kept. If a list is the decision, use a list.

When a skipped decision supplies a rule this record needs, write that rule here. The note that it has no ADR of its own stays in Context.

Leave rules that belong to another ADR in that ADR. Point to it with a link instead of copying them.

File and module names belong here when the decision is the module split. They do not belong here as a citation of where you read the idea.

#### Consequences

What is now hard to change, and what other parts must do because of this choice. Concrete effects.

- A shared constant that another package also assumes.
- A test or a file format that will change if the rule changes.
- A boundary that keeps a package free of I/O, a browser, or a parser.

Do not repeat the Decision in softer words. Do not add a slogan.

#### Sentences

Simple words. Short sentences. Active voice.

No "it's worth noting", "robust", "seamless", "simply", or "the plan says". No quotes from the plan. No commit subjects.

### 7. Check each file

Read the file you just wrote.

- The heading is `# NNN - Title`, with spaces around the hyphen.
- The only sections are Status, Context, Decision, Consequences, in that order.
- Status has the date and the dependency links, and no document or commit.
- Every dependency link points at a real file, and that file's number is lower.
- A picked decision has one file. A skipped decision has none.
- Facts folded in from a skipped decision appear in the ADR that uses them.
- The Decision still contains the rules, not only the slogan version of the choice.

Fix the file before reporting it.

### 8. Report the paths

List the new files in number order, each with its title and its Depends on ids. Say which skipped decisions were folded into which file. Do not commit.

## Example of Status

Wrong:

```markdown
## Status

Accepted on 2026-10-09.

Stated in docs/superpowers/plans/example.md. First implementation: commit abc1234.
```

Right:

```markdown
## Status

Accepted on 2026-10-09.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
```
