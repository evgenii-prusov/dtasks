# dtasks

A personal task planner with a daily engineering record attached. This glossary
covers the record side: capturing work as it happens, and turning it into
something to show at review time.

## Work record

**Work Log**:
The user's private, dated record of what they did, written for review season
rather than for execution. Capture only; never polished.
_Avoid_: activity log, journal, diary

**Work Log Entry**:
One thing the user did on one day, with its category, context, impact and
evidence.
_Avoid_: log line, item, accomplishment

**Evidence**:
A link attached to a Work Log Entry that shows the work happened: a PR, RFC,
doc or incident.
_Avoid_: attachment, reference

**Impact**:
Why a Work Log Entry mattered, in the user's own words, often a before/after
number.
_Avoid_: result, outcome, metric

**Day Signal**:
A day's energy and friction rating, recorded independently of that day's
entries.
_Avoid_: mood, rating

**Rollup**:
The counts for one week or month of the Work Log: entries per category,
evidence per kind, average Day Signal.
_Avoid_: summary, report

## Aiming the work

**Competency**:
Something a target job asks the user to have shown: a Staff-level behaviour
("owned a system end to end, including on-call") or a broad technical area
("container orchestration"), never a single tool or language. A behaviour is how
the user worked and a technical area is what they worked on, so one piece of
work often shows both. The user maintains a short list of them.
_Avoid_: skill, trait, signal, requirement

**Staff Bar**:
The user's own one- or two-line description of what a Competency looks like at
the level they are aiming for.
_Avoid_: expectation, rubric, description

**Goal**:
An outcome the user commits to so as to build evidence for one or more
Competencies.
_Avoid_: objective, OKR, milestone

## Showing the work

**Evidence Pack**:
A selection of Work Log Entries, grouped by Competency or by Review Period,
that leaves dtasks as Markdown. It is the raw material for a Brag Document,
not the finished text.
_Avoid_: export, report, brag doc

**Brag Document**:
The polished account of the user's work, such as CV bullets, interview
stories or a review write-up. It is written outside dtasks from an Evidence
Pack.
_Avoid_: brag doc, self-review, promotion packet

**Review Period**:
A stretch of time an Evidence Pack can be cut to, typically a quarter or a
half.
_Avoid_: cycle, rollup period
