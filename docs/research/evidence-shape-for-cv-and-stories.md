# What shape must evidence have for CV bullets and Staff-level interview stories?

Ticket: `dtask-9qi.3`. Researched 2026-10-04. All sources accessed on that date.
Quotes are kept under 15 words; everything else is paraphrase. Where a point is
my inference rather than a source's claim, it says so.

## Short answer

A CV bullet needs the result, a number with a baseline, scale and time
window, and the means: Bock's "Accomplished [X] as measured by [Y] by doing
[Z]". A Staff-level interview story needs the STAR/CARL skeleton plus:
- the scope and ambiguity
- the decision and its trade-off
- the candidate's own role versus the team's
- how others were influenced
- an outcome that often appears only later
- what was learned

Today's Work Log Entry covers the situation (`context`), artifacts (links) and
a loosely structured `impact`. It has no slot for the decision and trade-off,
own role, scope and stakeholders, later outcome, or learning. The decision and
the own-role split are the hardest to rebuild months later from PRs and
tickets (my inference). The sources that ask for them explicitly:
- **Trade-off:** Anthropic's Staff+ Data Infrastructure posting, Amazon and
  Dropbox IC5.
- **Own role:** DDI (what *you* did, not the team).
- **Who else was involved:** Orosz (name the people and teams you helped).

## Design constraints on the Evidence Pack

The target role makes the decision field concrete. Anthropic's Staff+ Data
Infrastructure posting asks for a candidate who can:
- "set technical direction for a team, not just execute within it"
- "navigate complex technical tradeoffs between performance, cost, security, and
  maintainability"

Two constraints on the pack follow from the sources:

1. **Some fields can only be filled later.** The later outcome and the learning
   need a revisit step, separate from the day the entry is logged. Bock's
   bullets carry time-bounded measures (for example, "over one year") that
   cannot exist on the day the work is logged.
2. **The pack must carry the user's own first-person words, and leave empty
   fields empty.** Anthropic's candidate guidance says to write the first draft
   yourself and let Claude refine it. It also says never to have Claude
   generate experiences you have not had. Julia Evans asks for work described
   as "exactly as good as it is". So the downstream Claude must not infer a
   missing trade-off or number.

## Fields and prompts a Work Log Entry needs

Status is measured against the current `WorkLogEntry` and `WorkLogLink`
(`backend/app/models.py`):
- **Present:** fully covered by an existing field.
- **Partial:** an existing field could hold it, but nothing prompts for or
  structures it.
- **Missing:** no slot exists.

"When" says when the information can be captured truthfully.

| # | Field / prompt | Feeds | When | Status vs current schema | Sources |
|---|---|---|---|---|---|
| 1 | **Day** of the work | bullet date range; story timeline | day of | **Present** (`day`) | Evans (you forget within months); Orosz work-log template (weekly entries) |
| 2 | **Situation / why it mattered.** What was broken, and for whom. | story S/T; bullet context | day of | **Present** (`context`) | DDI STAR (situation/task); Edinburgh CARL (context); Evans (explain your goal and the big picture) |
| 3 | **Goal or success criterion** set at the start: what "done" meant | story T; bullet X | day of (or project start) | **Partial.** It can live in `context`, but nothing asks for a target. | Larson promo packet (impact against well-defined goals); Google re:Work follow-up "What was your primary goal and why?"; Evans (state the goal for fuzzy work) |
| 4 | **Scope and ambiguity.** How ill-defined the problem was. Which teams, systems or users it touched. Which stakeholders disagreed. | Staff story; bullet scale | day of | **Missing** | Larson staff projects (complex, ambiguous, divided stakeholders); Dropbox IC5 (multi-team goals, navigating ambiguity and misalignment); Anthropic Data Infra posting (large-scale, complex projects); Orosz (scope is hard to find above senior) |
| 5 | **Decision and trade-off.** The options considered, the one chosen, what was given up and why. | Staff story (judgment); bullet "by doing Z" | **day of** (decays fastest — my inference) | **Missing** | Anthropic Data Infra posting (trade-offs across performance, cost, security, maintainability); Amazon SDE III (interviewers probe the "why" of your decisions); Edinburgh CARL (why this action; what other actions could have been chosen); Reilly, via Pragmatic Engineer ("decision records that explain what you were thinking"); Dropbox IC5 Craft (technology and build-vs-buy choices); Larson interview signals (judgment) |
| 6 | **Own role versus the team's.** What I personally did, and what others did. | story A; honest bullet verb ("led" vs "contributed to") | day of | **Missing.** `title` is a headline; it does not separate I from we. | DDI (focus on what *they* did, not their team or what they "would" do); Bock (one example credits a team result while keeping the person's own measured share); Larson (presentation interviews reveal how candidates talk about peers) |
| 7 | **Collaborators and stakeholders named.** Who I helped, and who helped or can vouch. | story; references; promo "advocacy" | day of | **Missing** | Orosz self-review (name the people and teams you helped); Larson promo packet (list the teams and leaders who know your work); Dropbox IC5 Culture (cross-functional influence) |
| 8 | **Influence: how direction was set or people were aligned.** Proposals, reviews, persuasion, disagree-and-commit. | Staff story (leadership without authority) | day of | **Missing** | Anthropic Data Infra posting (sets direction, not just executes); Dropbox IC5 Direction and Culture (influence amid misalignment; productive conflict); Reilly *Being Glue* (aligning direction is technical leadership) |
| 9 | **The means: how it was done ("by doing Z")** | bullet Z; story A | day of | **Partial.** Spread across `title` and `context`, with no prompt. | Bock (the "how" adds credibility and shows strengths); Evans (list the actions taken) |
| 10 | **Measured impact:** metric, **baseline**, **scale or denominator**, **time window** | bullet X/Y; story R | day of for the baseline; later for the result | **Partial.** `impact` is free text and often a before/after, but nothing prompts for scale or window. | Bock (numeric measure, baseline, scale that shows whether the number is big, peer comparison); Amazon (include metrics where applicable); Orosz self-review (use numbers); Larson promo packet (quantifiable impact); Evans (numbers, stated honestly) |
| 11 | **Indirect or qualitative effects** of fuzzy or glue work | story R; glue evidence | day of or later | **Partial** (free-text `impact`) | Evans (for fuzzy work, record observable effects, even indirect ones); Reilly (glue work needs an impact narrative) |
| 12 | **Later outcome.** What actually happened weeks or months later (adoption, incidents avoided, cost saved), with an as-of date. | bullet Y over a window; story R | **revisit** | **Missing.** There is no follow-up slot, and `impact` is written once. | Inferred: Bock's measures are time-bounded, and Larson and Orosz judge on delivered impact. No source prescribes a revisit step. |
| 13 | **Learning / what I would do differently / mistakes** | story L (CARL); self-awareness probes | day of or revisit | **Missing** | Edinburgh CARL (learning: would I do the same again?); Larson interview signals (accountable for mistakes, shows growth); Amazon (examples of risks taken, failures, growth); re:Work follow-up "Moving forward, what's your plan?" |
| 14 | **Evidence artifacts:** PRs, design docs, RFCs, incident reviews | verification; depth for deep-dives | day of | **Present** (`WorkLogLink` kinds `pr`, `rfc`, `doc`, `incident`, `link`) | Larson promo packet (link design docs); Orosz self-review (link design docs and notable code changes); Larson *Being Visible* (long-lived docs); Reilly (artifacts make glue visible) |
| 15 | **Kind of work, including glue and operational** | balance across the pack; glue stories | day of | **Present** (`category`: shipped, operational, glue, learning) | Reilly *Being Glue*; Dropbox 2023 update (now values toil, glue and documentation); Larson promo packet (has a glue-work section); Evans (collaboration and company-building) |
| 16 | **People grown:** who was mentored and what they went on to do | Staff "talent" evidence | day of or revisit | **Partial.** The `glue` category can hold it, but there is no field for who or what resulted. | Larson promo packet (list mentees and their accomplishments); Dropbox IC5 Talent |
| 17 | **Competency tag:** which target competency or ladder dimension this entry shows | grouping stories by question type | day of or revisit | **Missing** (planned in the Competencies → Goals loop) | Orosz (self-assess against the next level with examples; map work to competencies); Dropbox (the framework is used in hiring, reviews and promotions) |

The existing `task_id` (origin task link) is left out of the table. It gives
the user traceability, but no source treats it as evidence a reviewer reads.

What the table implies for the schema (my inference, not a source's claim):
- The **missing** rows most worth adding are:
  - decision/trade-off (5)
  - own role (6)
  - scope/stakeholders (4)
  - later outcome (12)
  - learning (13)

  Rows 7 and 8 could fold into 6 as one "my role and who else" prompt.
- These are best treated as **optional prompts**, not required fields.
  Orosz's own template is terse, one line per item, grouped by project. Its
  examples record decisions in passing (calling a meeting to cut scope;
  agreeing on a refactor approach). Logging friction kills the habit.
- Row 10 needs only prompt text (for example "baseline? scale? over what
  period?"), not new columns. Free text stays right for the reason given in
  `models.py`: metrics are too varied to sum.

## How the two outputs map onto the fields

- **CV bullet (Bock):** X = result (10/12), Y = measure + baseline + scale +
  window (10/12), Z = means (9). The verb must match the honest role (6).
- **Interview story (STAR/CARL + Staff probes):**
  - Situation/Context (2, 3, 4)
  - Task/goal (3)
  - Action = own role + decision + influence (6, 5, 8)
  - Result (10, 11, 12)
  - Learning (13)

  Deep-dives then probe the trade-off (5), the scope (4) and how the
  candidate talks about others (6, 7).

## Notes per source

**Laszlo Bock, "My Personal Formula for a Winning Resume" (LinkedIn, 2014-09-29).**
The formula is "Accomplished [X] as measured by [Y] by doing [Z]". He glosses
it as four steps:
1. Lead with an active verb.
2. Measure the result in numbers.
3. Give a baseline to compare against.
4. Say what you did.

He adds an absolute figure next to a percentage so the reviewer can judge
whether the number is big. He says the "how" makes the claim credible and shows
your strengths. He notes that a comparison with peers makes data meaningful.
His measures are often bounded in time. One example frames a team result while
stating the individual's own measured share. The original LinkedIn URL returned
404, so I read a verbatim copy hosted by Cal State LA.

**DDI (STAR's originator).**
DDI says it introduced STAR in 1974 with its Targeted Selection interviewing
system. The parts are:
- **Situation/Task:** the context.
- **Action:** what the person did.
- **Result:** what was achieved, and why it worked.

DDI's guidance says to focus on what the candidate did, not the team or what
they "would" do. Results should be measurable, and interviewers ask follow-ups
when parts are missing.

**University of Edinburgh, CARL (Reflectors' Toolkit).**
CARL stands for Context, Action, Result, Learning, adapted from interview
technique. Its Action step asks why you chose that action and what the
alternatives were, which is the trade-off by another name. Its Learning step
asks whether you would do the same again.

**Amazon, SDE III and SDM interview prep (amazon.jobs).**
Amazon asks two or three behavioural questions per interview, on successes and
challenges. It recommends STAR and says to include metrics where applicable.
Interviewers focus on the what and how of experiences, and the "why" of your
decisions. Candidates should bring examples of risks taken, failures and growth.

**Google re:Work, structured interviewing guide.**
It separates behavioural questions (past achievements) from hypothetical ones.
Its example follow-ups probe the goal and why, how teammates responded, and
what comes next. Answers are scored against poor, borderline, solid and
outstanding rubrics.

**Julia Evans, "Get your work recognized: write a brag document" (2019-06-28).**
- People, and their managers, forget their own work within months.
- Record projects, collaboration and mentoring, design docs, company-building
  and learning.
- Group the work into themes to show the big picture.
- For fuzzy work, state the goal, list the actions, and note observable effects.
- Use numbers where they exist, and describe the work "exactly as good as it
  is".
- Update it every couple of weeks or once a year.

**Will Larson, staffeng.com guides.**
- *Promotion packets:* sections for:
  - staff projects (what you did, impact against well-defined goals,
    complexity, links to design docs)
  - organisational improvements
  - quantifiable impact
  - mentorship (mentees and their accomplishments)
  - glue work
  - advocacy (teams and leaders familiar with your work)
  - gaps
- *Staff projects:* complex and ambiguous, with divided stakeholders, and
  important enough that leadership watches.
- *Staff-plus interview process:* signals are:
  - self-awareness ("Are they accountable for mistakes?")
  - judgment (ambiguity, risk)
  - collaboration
  - communication
  - developing others

  Presentation interviews reveal how candidates talk about peers.
- *Interviewing for Staff-plus roles:* loops vary widely by company, so ask
  what each interview evaluates.

**Gergely Orosz, The Pragmatic Engineer.**
- *Work log template* (2020): every week, record:
  - key code changes, code reviews and design docs
  - planning
  - helping others
  - postmortems

  The example is terse, one line per item, grouped by project.
- *Self-review with an example:*
  - goals for the period, then accomplishments, then the "how"
  - reflect against levels and competencies
  - use numbers
  - name the people and teams you helped
  - link to design docs and notable changes

  A verbatim re-check found no prompt for learnings or mistakes.
- *Software engineering promotions* (2019, updated 2021):
  - promotion recognises impact and skills that consistently exceed your level
  - keep a work log
  - self-assess against the next level with examples
  - projects big enough are hard to find above senior

**Tanya Reilly.**
- *Being Glue:* onboarding, roadmaps, user conversations and alignment are
  leadership work, yet are often judged "not technical" at promotion time.
  Make that work visible through artifacts and explicit conversations with
  your manager.
- *The Staff Engineer's Path* excerpt on Pragmatic Engineer: lists "decision
  records that explain what you were thinking" among the docs staff engineers
  should leave behind.

**Dropbox Engineering Career Framework.**
- *IC5 Staff:*
  - **Results:** multi-year, multi-team goals; decisions that optimise for the
    wider org.
  - **Direction:** strategy; navigating ambiguity and organisational
    misalignment.
  - **Talent:** mentoring.
  - **Culture:** cross-functional influence; productive conflict.
  - **Craft:** technology choices, build-vs-buy decisions.
- *2023 update:* the framework is used for hiring, reviews and promotion. It
  was revised because evaluation leaned too far towards big, high-profile
  projects; it now explicitly values on-call toil, glue work and documentation.

**Anthropic (first-party).**
- **No published interview rubric.** I found no first-party page describing a
  Staff interview rubric or loop structure. Third-party "Anthropic interview
  guides" exist but were not used for any claim.
- **What Anthropic does publish:**
  - **Candidate AI guidance** (updated 2025-07-10): draft the application
    yourself, then refine it with Claude. Never have Claude invent experience.
    Use Claude freely to prepare for interviews. Use no AI in live interviews
    unless told otherwise.
  - **Careers page:** values what you can do over credentials, and suggests
    highlighting independent work.
  - **Company values:** includes "Do the simple thing that works" and
    high-trust, low-ego collaboration.
  - **Staff+ Software Engineer, Data Infrastructure posting** (updated
    2026-08-21): asks for 3+ years leading large, complex projects; setting
    technical direction; trade-offs across performance, cost, security and
    maintainability; collaboration with non-technical stakeholders; and a track
    record on reliability or cost efficiency at scale. Its boilerplate says
    Anthropic greatly values communication skills.

## Sources

Primary unless marked. Accessed 2026-10-04.

- Laszlo Bock, "My Personal Formula for a Winning Resume", LinkedIn, 2014-09-29:
  - original URL (returned 404): https://www.linkedin.com/pulse/20140929001534-24454816-my-personal-formula-for-a-winning-resume/
  - verbatim copy read: https://www.calstatela.edu/sites/default/files/formula_for_a_winning_resume.docx
- DDI:
  - "What is the STAR format?": https://www.ddi.com/blog/what-is-the-star-format
  - STAR Method: https://www.ddi.com/solutions/behavioral-interviewing/star-method
- University of Edinburgh, "The CARL framework of reflection": https://reflection.ed.ac.uk/reflectors-toolkit/reflecting-on-experience/carl
- Amazon:
  - SDE III Interview Prep: https://amazon.jobs/content/en/how-we-hire/sde-iii-interview-prep
  - SDM Interview Prep: https://amazon.jobs/content/en/how-we-hire/sdm-interview-prep
- Google re:Work, "A guide to structured interviewing": https://rework.withgoogle.com/intl/en/guides/a-guide-to-structured-interviewing-for-better-hiring-practices
- Julia Evans, "Get your work recognized: write a brag document": https://jvns.ca/blog/brag-documents/
- Will Larson, staffeng.com:
  - https://staffeng.com/guides/promo-packets/
  - https://staffeng.com/guides/staff-projects/
  - https://staffeng.com/guides/being-visible/
  - https://staffeng.com/guides/staff-plus-interview-process/
  - https://staffeng.com/guides/interviewing-staff-plus-roles/
- Gergely Orosz, The Pragmatic Engineer:
  - Work log template post: https://blog.pragmaticengineer.com/work-log-template-for-software-engineers/
  - The template itself: https://docs.google.com/document/d/1PK1HGa3HViKSJhAhvQgZNEYB72J0DhcXPNKuSpI4N80/edit
  - Self-review with an example: https://blog.pragmaticengineer.com/performance-self-review-for-software-engineers-with-an-example/
  - Promotions: https://blog.pragmaticengineer.com/software-engineering-promotions/
  - Performance reviews: https://blog.pragmaticengineer.com/performance-reviews-for-software-engineers/
- Tanya Reilly:
  - "Being Glue": https://noidea.dog/glue
  - *The Staff Engineer's Path* excerpt (on Pragmatic Engineer): https://newsletter.pragmaticengineer.com/p/the-staff-engineers-path
- Dropbox:
  - IC5 Staff Software Engineer: https://dropbox.github.io/dbx-career-framework/ic5_staff_software_engineer.html
  - "Here's the latest version of our Engineering Career Framework" (2023-04-06): https://dropbox.tech/culture/our-updated-engineering-career-framework
- Anthropic:
  - Careers: https://www.anthropic.com/careers
  - Candidate AI guidance: https://www.anthropic.com/candidate-ai-guidance
  - Company values: https://www.anthropic.com/company
  - Staff+ Software Engineer, Data Infrastructure: https://job-boards.greenhouse.io/anthropic/jobs/5114768008
- Seen but not relied on (secondary):
  - Third-party Anthropic interview guides (tryexponent.com, interviewquery.com, igotanoffer.com)
  - A Meta behavioural "cheat sheet" (techinterview.org). Meta's own prep page (metacareers.com) gave no usable content.
  - The repo's `dont-do-invisible-work.md`, a summary of Chris Albon's talk.
