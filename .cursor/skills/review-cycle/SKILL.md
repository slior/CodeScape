---
name: review-cycle
description: >-
  Runs an autonomous review-and-fix cycle on a plan or design spec until a
  review finds nothing left, or the round limit is reached. Use when asked to
  review a plan until the issues are resolved, run a review cycle, repeat
  plan review and revision, or keep reviewing a design spec against the
  codebase. Requires the document path and a reviewer model different from
  the model running this skill.
---

# Review cycle

Run a review, then a fix, then another review, until the document is clean or the round limit is hit. You are the coordinator. You do not review the document and you do not edit it.

Two different models do the work:

- The **reviewer** uses the model the user named. It follows the `review-plan` skill and writes findings to a file.
- The **reviewee** uses your model, the model that is running this skill. It reads those findings, updates the document or explains a disagreement, and writes that response to a separate file.

A **round** is one review plus the fix that follows it. The fix is skipped when the review finds nothing.

## When not to use this

Use `review-plan` directly for one review that only writes findings. Use this skill when the findings must be addressed and the document reviewed again.

## Inputs

| Input | Required | Default |
| --- | --- | --- |
| Document path | yes | — |
| Reviewer model | yes | — |
| Maximum rounds | no | 4 |
| Output directory | no | `./tmp/reviews` |

The document may be an implementation plan or a design spec. The path is a file, not a directory.

Resolve the output directory from the workspace root. `./tmp/reviews` means `<workspace>/tmp/reviews`.

If the document path or the reviewer model is missing, ask for it and stop. Do not start a round with a guess.

If the maximum is omitted, use 4. If it is not an integer of 1 or more, ask for a valid number and stop.

## Rules

1. Reviewer and reviewee use different models. This is a hard stop, not a preference.
2. You do not review, and you do not edit the document. Subagents do both.
3. Each review is a new subagent. Each fix is a new subagent. Do not resume a reviewer to be the reviewee.
4. Rounds are sequential. Wait for one subagent to finish before you start the next.
5. The decision to stop is based on the file on disk, not on the subagent's summary.
6. Do not commit, push, or open a pull request.
7. Do not ask the user whether to continue between rounds. Run until a stop rule applies.
8. Do not replace the named reviewer model with a different one. If the name is not a model this session can launch, stop and report the error.

Before the first review, refuse to start when any of these are true:

- The reviewer model is `inherit`.
- The reviewer model is the model of this session.
- You cannot tell them apart. Treat "same model, different name" as the same model. Grok 4.7 and a `grok-4.7` slug are the same model.

Tell the user the two models must differ, and stop.

## Files

Create the output directory if it does not exist.

Look at existing file names that match `<series>.<round>.md` or `<series>.<round>.1.md`. The series is the first number. The next series is one more than the highest series already there. If no such files exist, the series is 1.

This run uses that new series for every file it writes. It does not add files to an older series.

| Round | Who writes it | Path |
| --- | --- | --- |
| r review | reviewer | `<output>/<series>.<r>.md` |
| r response | reviewee | `<output>/<series>.<r>.1.md` |

Round numbers start at 1. Example: the directory already has `2.4.md`, the maximum is 4, and this run uses series 3. It may write `3.1.md`, `3.1.1.md`, `3.2.md`, `3.2.1.md`, and so on, and it never writes `3.5.md` unless the user requested for 5 or more rounds, and the reviewer has more comments.

Use absolute paths in every subagent prompt. A subagent does not see this conversation.

## How to launch a subagent

Launch with the session's subagent tool (Cursor's Task tool).

- `subagent_type`: `generalPurpose`
- `run_in_background`: false
- Stay in this workspace. Do not use a cloud agent or a separate worktree. Both subagents must read and write the same files you can see.
- Reviewer: set `model` to the reviewer model the user named.
- Reviewee: omit `model`, so it inherits your model. Do not pass `inherit` as a way around the different-model rule.
- Do not set `resume` on the first launch. You may resume that same subagent once, and only once, if it finished without writing the required file. When resuming, do not also pass `model`.

Give every subagent a short description, such as `Review plan round 2` or `Address review 3.1`.

## The cycle

Copy this checklist and keep it current:

```
Review cycle
- [ ] Inputs checked, models differ, series chosen
- [ ] Round 1 review written
- [ ] Round 1 response written, or stopped because there were no issues
- [ ] Later rounds, until stop
- [ ] Final report
```

For round `r` from 1 through the maximum:

### 1. Start the reviewer

Launch a new reviewer subagent with the reviewer prompt below.

On round 1, do not mention a response file. There is not one yet.

On round 2 and later, include the previous response path. That is `<output>/<series>.<r-1>.1.md`.

Wait until it finishes. Then read the review file yourself.

If the file is missing or empty, resume that reviewer once and tell it to write the file. If it is still missing or empty, stop the cycle and report that. Do not write the findings yourself.

### 2. Stop when the review is clean

The review is clean when the file, after trimming whitespace, is exactly:

```
No issues found
```

or exactly `No issues found.`

A missing or empty file is not a clean review. A file of prose, a header with no findings, or empty severity sections is not a clean review either.

An open issue is a bullet in the review-plan label form, such as `- **[H1]**`, `- **[M1]**`, or `- **[L1]**`.

When the review is clean, do not start the reviewee. The cycle is finished.

When the file is not clean and it also has no issue bullets, resume that reviewer once. Tell it to replace the file with the single line `No issues found`, or with the review-plan issue list. If the file is still neither, stop and report that the review file is not usable. Do not invent the findings.

### 3. Start the reviewee

Launch a new reviewee subagent with the reviewee prompt below. Wait until it finishes.

Then check both of these yourself:

- The response file exists and addresses every issue id from the review.
- The document on disk was updated, or the response disagrees with each finding it did not change.

If the response file is missing, resume that reviewee once and tell it to write the file. If it is still missing, stop and report that. Do not write the response yourself, and do not edit the document yourself.

### 4. Decide whether another review is allowed

If this round's number equals the maximum, stop. Do not start another reviewer. The last response has not been reviewed again. Say that in the final report.

Otherwise go back to step 1 with the next round number. The next reviewer must see the updated document and this round's response file.

## Reviewer prompt

Fill in the placeholders. Send this as the whole task. Add the later-round block only when a previous response exists.

```
Read and follow the review-plan skill at <workspace>/.cursor/skills/review-plan/SKILL.md. Follow that skill for how to read, what to check, and how to sort findings. Do that work yourself in this subagent. Do not launch another subagent.

Document to review: <document path>
Output file: <review path>

The document may be an implementation plan or a design spec. Apply every review-plan check that fits this document. Read the current document from disk. Read the real code it depends on. Do not trust the document's description of the code.

If the document names a parent design or downstream plans, read those too and check contracts the document changes.

Do not edit the document. Do not edit any other project file. The only file you write is the output file.

Sort findings from highest severity to lowest, in the review-plan format (HIGH, then MEDIUM, then LOW).

If you find no issues, the output file's entire contents must be this single line and nothing else:

No issues found

Do not write the review header, and do not write empty severity sections, when there are no issues.

When you are done, reply with the output path, the counts by severity, and nothing else. If there were no issues, say that.
```

Add this block on round 2 and later:

```
Previous response file: <response path>

Read that response before you conclude. For each earlier finding, check the current document:

- If the response fixed it, do not report it again.
- If the response disagrees and the evidence holds, do not report it again.
- If the response disagrees and the evidence does not hold, report it again with the evidence.
- Report new issues introduced by the changes, or issues the earlier review missed.

The output lists only issues that are still open. When issues remain, begin the file with one sentence saying whether the previous response resolved the earlier review. When nothing remains open, ignore that sentence and write only `No issues found`.
```

## Reviewee prompt

Fill in the placeholders. Send this as the whole task.

```
You are answering a review of a plan or design spec. You are not the reviewer. Do not look for new issues. Address only the findings in the review file.

Review file: <review path>
Document: <document path>
Response file: <response path>

Read the review file. Then read the document from disk, as it is now. Also read any parent design the document points to, and the code the findings cite. Check each finding against those sources before you change anything. A finding can be wrong.

For every finding in the review:

- Fix it in the document, or
- Disagree, with evidence from the current document or the code.

Address every finding, including low severity. Do not skip one because it seems small. Do not leave a finding unmentioned.

Change the document only to resolve a finding. If a finding is about another file the document depends on, you may edit that file too, and say so in the response. Do not edit the review file. Do not edit unrelated files. Do not commit.

Write the response file only after the document edits are done. Use this format. Keep the review's ids, in the same order. Use "fixed" or "disagree".

# Response to review <series>.<round>

**Document:** `<document path>`
**Review:** `<review path>`

<One short paragraph: what was fixed, and any disagreements.>

---

## [<ID>] <title from the review> — fixed

<What changed, and where.>

## [<ID>] <title from the review> — disagree

<Why the finding does not hold. Cite the document and the code.>

When you are done, reply with the response path, which ids were fixed, and which ids you disagreed with.
```

## Final report

When the cycle stops, tell the user:

- The document path.
- Why it stopped: the review file that is clean, or the round limit.
- Every review file and response file this run wrote.
- For a clean stop: which review file contains `No issues found`.
- For a round-limit stop: that the last response was not reviewed again, and the last open review path.
- One line per round: counts by severity, or no issues. Take the counts from the files, not from memory.

## Mistakes

| Mistake | What to do instead |
| --- | --- |
| Review the document yourself to save a launch | Launch the reviewer subagent |
| Edit the document yourself because the finding looks easy | Launch the reviewee subagent |
| Use your model for the reviewer because the named model is busy or unfamiliar | Stop. Do not substitute |
| Omit `model` on the reviewer so it inherits your model | Set `model` to the named reviewer model |
| Resume the reviewer and ask it to fix the document | Launch a new reviewee on your model |
| Run the reviewer and the reviewee at the same time | Wait. The reviewee needs the review file |
| Treat a chat summary of "looks good" as a clean review | Read the file. Stop only on a clean file |
| Start another review after the maximum round's fix | Stop. Report that the last response was not reviewed again |
| Reuse series 2 because those files are the same document | Allocate a new series |
| Keep going after `No issues found` to be thorough | Stop. Do not launch the reviewee |
| Commit the plan edits | Leave them in the working tree |
