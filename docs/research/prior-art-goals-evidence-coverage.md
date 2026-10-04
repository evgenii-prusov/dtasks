# Prior art: how tools connect goals, evidence and competency coverage

Research for ticket `dtask-9qi.4`. Gathered 2026-10-04 from each tool's own docs,
product pages, help centre or source code. Every source is listed under
[Sources](#sources).

Vocabulary: dtasks terms follow `CONTEXT.md`: Competency, Goal, Work Log Entry,
Evidence, Impact, Review Period, Evidence Pack and Brag Document. Each tool is
described in its own terms (Win, Skill, Growth Area and so on). Lowercase
"evidence" means proof in general. Capitalised **Evidence** is the dtasks term for
a link attached to a Work Log Entry.

## Short answer

The existing tools fall into two families, and neither does what dtasks is aiming for.

- **Brag-document tools keep capture cheap but cannot show gaps.** This family
  covers Julia Evans' template, Gergely Orosz's work log, James Stanier's weekly
  doc, Notion templates, BragLog, bragdoc.ai and the `brag` CLI. In these tools the
  document itself is the export. None of them has a list of target competencies,
  so none can say what is missing. Where entries do get mapped to competencies, it
  happens by hand at review time. Orosz's self-review template, for example, ends
  with a section that assesses each competency, written from the work log.
- **HR growth tools hold the Competency → Goal link, but their coverage is a
  rating.** This family covers Lattice Grow, Culture Amp Develop and Progression.
  Progression also tags each Win with skills. In all three, coverage is a rating:
  working towards, meeting or exceeding, or a radar or "snowflake" shape. Evidence
  shows up only as a side feed while someone does the assessment.
- **Only Mahara SmartEvidence computes coverage from evidence.** It is an
  ePortfolio, not a career tool. It draws a real evidence × competency matrix with
  a state in every cell and a count per competency.
- **No tool combines cheap daily capture with evidence-based coverage for one
  person.** That is the gap dtasks can fill.

**Worth borrowing:**

- Competency as an optional second axis next to the existing category (the Notion
  template)
- Goals anchored to one competency, with a soft target period and at most three
  active at a time (Culture Amp, Lattice)
- Seeding Competencies from a target role (Culture Amp)
- A matrix of evidence counts with explicit empty cells (Mahara)
- A per-competency drawer of entries, filtered by time (Progression, Lattice)
- A flag to include an entry in the pack (Notion)
- An Evidence Pack shaped like Orosz's self-review, plus the gap-analysis section
  from StaffEng's promotion packet

**Worth avoiding:**

- Coverage based on ratings (Snowflake, Engineering Ladders, Progression check-ins)
- Required tagging at capture (Culture Amp's planning flow)
- Large imported frameworks (Snowflake, Culture Amp)
- Themes found only by AI clustering (bragdoc.ai)
- Public profiles (bragdocs.com)
- No export, or export only for admins (Culture Amp, Lattice)

## Comparison table

"Capture cost" means what a person must do to tag one item when they record it.

| Tool (family) | How goals, competencies and evidence link | How coverage or gaps are shown | Tagging cost at capture | Export |
|---|---|---|---|---|
| **Julia Evans' brag document** (doc template) | One document. Goals for this year and next year sit at the top, then fixed sections: Projects, Collaboration & mentorship, Design & documentation, Company building, What you learned, Outside of work. She also suggests adding a section per focus area (e.g. security). No competency list. | None. Patterns are spotted by rereading the document. | None. You choose a section by where you type. Evans notes that some people update every couple of weeks and others in one long session every 6–12 months. | The document is the output, shared with your manager. |
| **Orosz work log** (Google Doc) | Reverse-chronological "Week of …" headings with a "Current" block at the top. Bullets are grouped by project, with ticket and PR IDs as evidence. No goals or competencies. | None. | None beyond picking the project heading. Weekly cadence. | The doc itself. It feeds the self-review below. |
| **Orosz self-review template** (Google Doc) | Goals for the period, then accomplishments marked against each goal (including a goal that was missed and why), extra achievements, how I worked with others, and finally a per-competency assessment. It points back to the work log for the full list. | A short prose verdict per competency area, written by hand. | Not applicable. The mapping is done once per review, not at capture. | The doc itself. |
| **James Stanier's weekly brag doc** (practice) | Rough notes all week, turned into prose on Friday morning. Sections: a headline, one per project, useful ideas and links, miscellany. No goals or competencies. It later grew into an internal newsletter. | None. | None. | Prose shared with the manager, later a newsletter. |
| **Notion "Tech Brag Document Template"** (Parul Singh, The Coding Recruiter) | Relational. A **Goals** database (goal, description, relation to entries). An **entries** database with an Evans-style section field, a **Skills** multi-select (seeded with Improving process, Hiring, Mentoring, Showing initiative), Impact (High/Medium/Low), date, a **Goal relation** and an **"Add to brag doc" checkbox**. Also a weekly database plus a brain-dump area. | No coverage view. Saved views do the work: This Week, High Impact, Q1, All entries. | Optional multi-select and relation fields. Each one costs a click and a search per entry. | Notion's own generic page export. Nothing specific to the template. |
| **Bragdocs.com** (Progression; web app, **shut down 25 Nov 2024**) | A public @name timeline of dated posts (title, body, optional image). Posts can be backdated or used as future goals. No competencies. | None. | None. | None documented. Its farewell post counted about 1,400 people who posted at least once, about 9,100 posts in total, and a spam-signup problem. |
| **BragLog** (iOS/Mac app) | Each entry gets one of six fixed categories: Shipped, Led, Fixed, Learned, Mentored, Improved. No goals or competencies. Semantic search finds related entries. | An Insights view shows a streak heatmap, monthly trend, a breakdown by category, and milestone badges at 7, 30 and 100 days. No gap view. | Very low. AI suggests the category as you type, and there is quick capture from the Mac menu bar. | Markdown, plain text or HTML. Generates a brag document in a chosen tone. AI runs on-device. |
| **bragdoc.ai** (open-source SaaS + CLI) | An Achievement has a title, summary, details, event dates, a project (mapped to a git repo), a company, an impact score, and an optional **Workstream**. Impact and workstream each record whether the user or AI set them. Workstreams are themes found by AI clustering, not targets. No goals or competency list. | Impact trend and a breakdown by project. Workstreams describe themes after the fact, not gaps. | Near zero: the CLI extracts achievements from git commits and an LLM rates impact. Manual entry is also possible. | Generated documents: performance review, weekly, monthly, manager update. Sources disagree on formats (see [Caveats](#caveats-and-unverified-points)). |
| **`brag` CLI** (bovem/brag) | Appends timestamped lines to Markdown files in a git repo. No tags, goals or competencies. | None. `brag about last-week` lists a time window. | One shell command, no tagging. | The Markdown files themselves, plus an LLM draft summary from local Ollama. |
| **Progression** (now Careerminds; HR SaaS) | A **Framework** is a matrix of positions, skills, and a requirement per level (3–8 levels). **Wins** and other activity are tagged with skills. **Actions** are intentions with optional due dates and skill tags, usually created after a check-in. | A **Check-in** rates each skill as Working towards, Meeting or Exceeding, by self, manager, then jointly. The result is a "skill shape" against the position, with lists of strengths and growth areas. Each skill has an **Updates** button that lists the activity logged against it. | Low to medium. Wins can be added via a plus button, Cmd+K, a short URL or Slack (`/progression win`, or turn a Slack message into a Win). You pick skill tags and one of three visibility levels. | CSV export of Wins. |
| **Lattice Grow** (HR SaaS) | A **Track** has levels as columns and competencies grouped by theme, with an expectation per level. A **Growth Area** has a title, a linked competency (singular in both the create flow and the log; from your own or another track), a description, a growth period, optional links to review responses, and actions with due dates. | No evidence count. The track view shows expectations for your current level next to the next level up. While a review is being written, a context panel lists growth areas, filtered to the past 3, 6 or 12 months, or all. | Not applicable at capture. Progress means ticking off actions and posting a text update. | CSV for admins only: growth areas, updates and actions. |
| **Culture Amp Develop** (HR SaaS) | A **Development Plan** has three steps. Know Yourself takes about 10 minutes and covers motivators, at least one competency as a strength, and a 6-month development objective. Build Your Plan takes about 20 minutes and asks for at least one competency as a growth area (up to three recommended). Each goal is based on one growth area and has a title, description, due date and actions. You can **add a role, current or future**, to pull in its competencies. | No per-person coverage. An org report counts the top strengths and growth areas. | Picking competencies is required while planning. There is no evidence log in the plan, only manager feedback. | The FAQ says plan export is not available yet. |
| **Medium Snowflake** (open-source ladder tool) | 16 tracks in 4 categories. Each track has milestones 0–5, and each milestone has a summary, signals and examples. No evidence is attached. | A Nightingale (rose) chart of the milestone per track, a level "thermometer", and points still needed for the next level. Points grow non-linearly (1, 3, 6, 12, 20) and sum to a level. | Not applicable. You click a milestone per track as a self-assessment. | State lives in the URL hash. Medium no longer uses the tool. |
| **Engineering Ladders** (open framework) | Five axes (Technology, System, People, Process, Influence), each with five cumulative levels. Each role is drawn as a target shape. The System axis includes owning production operation and knowing its SLAs. | A radar chart. The gap is the difference between your shape and the target role's shape. | Not applicable. Evidence comes from 1:1s, peer feedback and self-evaluation, with no tool. | Static charts in a GitHub repo. |
| **Mahara SmartEvidence** (ePortfolio) | A framework (a JSON matrix file) holds standards and standard elements. The learner adds an **annotation** block to a portfolio page to tie it to a standard. Any number of pages can map to one standard. | An **evidence map**: rows are standards, columns are pages. Each cell shows one of five states: not linked, ready for assessment, not sufficient, partially meets, meets. Each standard has a count of pages that meet it. Self-assessment frameworks let the author assess their own work. | Medium. Tagging is a separate step on an existing page, not part of capture. | Not checked for this survey. |
| **StaffEng promotion packet** (Will Larson guide) | Sections: Staff projects, organisational improvements, quantified impact, mentorship, glue work, advocates, and an explicit **gap analysis** with mitigations. It is a living document, iterated with peers and your manager. | The gap-analysis section is written by hand. | Not applicable. | The packet itself. |

**Not covered.** No well-documented Obsidian setup turned up, so Obsidian is left
out rather than described from generic Dataview advice. `progression.fyi` now
redirects to `careerminds.com/job-architecture`. The Progression rows come from the
Careerminds support glossary and the progression.co feature pages.

## Patterns worth copying

Each pattern names its source tool, then says how it would look in dtasks. The
dtasks parts are recommendations, not findings.

### Capture

1. **Make Competency a second, optional axis, separate from category.** *(Notion
   Tech Brag template)* The template puts two independent fields on each entry: an
   Evans-style section and a Skills multi-select. dtasks already has a category chip
   row (shipped, operational, glue, learning) that defaults to `shipped`. Keep it,
   and add a Competency chip row below it.
   - The row shows only the user's own short list of Competencies.
   - Nothing is selected by default, and none is ever required.
   - Behaviours and technical areas show as two small groups.
   - Category answers *what kind of work* this was; Competency answers *which
     target it is evidence for*. Do not merge the two.
2. **Suggest tags, and record who set them.** *(bragdoc.ai; BragLog)* bragdoc.ai
   stores whether the user or the AI set impact and workstream. BragLog suggests a
   category while you type. In dtasks the cheapest source of suggestions is
   structure that already exists:
   - When a finished task is promoted to a Work Log Entry (`task_id`), pre-fill the
     Competencies of any Goal linked to that task's project.
   - Show pre-filled chips as *suggested* (outlined) until the user accepts them.
   - The coverage view counts only confirmed tags. This mirrors how dtasks already
     infers a link's kind from its URL instead of asking.
3. **Tag after the fact, in batches.** *(Mahara SmartEvidence; Orosz)* Mahara maps
   evidence by annotating pages that already exist. Orosz writes the competency
   section once per review, from the log. In dtasks:
   - Add a weekly "Untagged this week (N)" list, with one chip row per entry, that
     can be cleared quickly from the keyboard.
   - Capture stays a title plus optional fields, and tagging becomes a weekly
     two-minute sweep.
   - This fits the weekly rhythm in the brag-doc sources: Orosz logs weekly,
     Stanier writes on Friday mornings, and the Notion template has a "This Week"
     view. Evans notes that some people update every couple of weeks.

### Goals and Competencies

4. **Anchor each Goal to one Competency, give it a soft target, and keep few
   active.** *(Culture Amp; Lattice)* In Culture Amp each goal is based on exactly
   one growth area, and it recommends at most three growth areas. In Lattice a
   growth area has a linked competency (singular in both the create flow and the
   log), and its growth period is a target rather than a hard deadline. In dtasks:
   - A Goal has a title, one primary Competency, a target Review Period, and an
     optional link to a project.
   - The Goals view warns when more than about three are active.
   - `CONTEXT.md` says a Goal can serve "one or more" Competencies. Prior art
     suggests one *primary* Competency plus optional secondary ones (see Open
     questions).
5. **Seed Competencies from a target role, and keep the "what good looks like"
   text next to each one.** *(Culture Amp "add a role"; Lattice expectations;
   Progression requirements)* Culture Amp lets you add a *future* role to pull in
   its competencies. Lattice shows the current level's expectation next to the
   next level's. In dtasks:
   - Each Competency has a name, a kind (behaviour or technical area), a one-line
     user-written note on what it looks like at Staff, and an optional source link
     (the job ad or ladder it came from).
   - The note shows in the coverage drawer, so the user compares entries with the
     bar, not with memory.
6. **Keep the list short.** *(Engineering Ladders; Culture Amp)* Engineering
   Ladders covers a whole career ladder with five axes. Culture Amp recommends up
   to three growth areas. Snowflake's 16 tracks are the counter-example (see
   Patterns to avoid). In dtasks, show a soft hint once the list passes about 8
   Competencies.

### Coverage view

7. **Show coverage as an evidence matrix with explicit empty cells.** *(Mahara
   SmartEvidence)* This is the only surveyed tool whose coverage comes from
   evidence rather than opinion. Suggested layout for dtasks:
   - **Rows** are Competencies, grouped by behaviour and technical area.
   - **Columns** are Review Periods (quarters), oldest to newest, plus a total.
   - **Each cell** shows the count of tagged Work Log Entries and one of three
     states:
     - *none*: an empty cell that is clearly visible, not blank.
     - *thin*: only bare entries, with no Impact and no Evidence link.
     - *backed*: at least one entry with both Impact and Evidence.
   - The *thin* state reuses an idea the Rollup already has: it counts entries
     that *carry* impact rather than adding up the numbers.
   - **Each row** carries its active Goal as a chip. A thin row with no Goal is the
     call to action ("Set a Goal"), and a thin row with a Goal shows the Goal's
     target Review Period.
8. **Show a per-competency evidence drawer, filtered by time.** *(Progression
   check-in "Updates" button; Lattice review context panel)* Progression lists the
   activity logged against a skill right where you assess it. Lattice's panel
   filters to the past 3, 6 or 12 months, or all. In dtasks:
   - Clicking a row or cell opens a side drawer with that Competency's "looks like
     at Staff" note.
   - Below the note are its entries (date, title, Impact, Evidence links), filtered
     by Review Period.
   - Each entry has a quick toggle to include it in the Evidence Pack.

### Evidence Pack

9. **Use a curation flag and saved views.** *(Notion "Add to brag doc" checkbox;
   High Impact and Q1 views)* In dtasks, a star on a Work Log Entry means "include
   in an Evidence Pack". The pack builder pre-selects starred entries in the chosen
   Review Period, and the user can untick any of them.
10. **Shape the pack like a self-review with a gap section.** *(Orosz self-review
    template; StaffEng packet; Evans)* Orosz puts goals first, marks each as hit or
    missed, and only then lists accomplishments. StaffEng's packet ends with an
    explicit gap analysis. Evans puts goals at the top. Suggested Markdown for the
    dtasks Evidence Pack:
    - **Header:** Review Period and target role.
    - **Goals:** each with its Competency, target, status, and the entries
      supporting it.
    - **By Competency:** each with its "looks like at Staff" note, then entries with
      date, title, Context, Impact and Evidence links.
    - **Thin coverage:** Competencies with no or only thin entries, listed plainly
      so the gap analysis has something to start from.
    - **Optional chronological appendix**, like Orosz's pointer back to his work log.
    - **Grouping:** by Competency or by Review Period, as `CONTEXT.md` already
      specifies.
11. **Keep records in plain text the user owns.** *(bovem/brag Markdown + git;
    BragLog on-device with Markdown export)* This backs the existing decision that
    the Evidence Pack leaves dtasks only as Markdown. It also argues for keeping
    the Markdown faithful (links intact, nothing summarised away) so it works as raw
    material for a Brag Document written elsewhere.

## Patterns to avoid

1. **Coverage based on ratings.** *(Snowflake; Engineering Ladders radar;
   Progression check-ins; Lattice)*
   - Snowflake turns self-picked milestones into points and a level.
   - Engineering Ladders and Progression draw a shape from ratings.
   - All of them show *opinion* about coverage, and none counts evidence.
   - In a single-user app there is no manager to calibrate the rating, so dtasks
     coverage should come only from tagged entries.
   - A radar chart is also a poor fit for counts that are often zero. A matrix
     shows empty cells honestly.
2. **Requiring a competency at capture.** *(Culture Amp)* Culture Amp requires at
   least one competency for each strength, growth area and goal. That is fine for a
   planning object such as a Goal, but wrong for a daily Work Log Entry. Evans' and
   Orosz's templates have no tagging at all, which is exactly why they are cheap to
   keep up.
3. **Large imported frameworks.**
   - Snowflake has 16 tracks with 5 milestones each.
   - Culture Amp ships 100+ template competencies across 12 job groups.
   - Progression frameworks run to 3–8 levels per skill.
   For one person preparing for one kind of role, a long list makes the chip row
   slow and leaves most of the matrix empty forever.
4. **Themes found only by AI clustering.** *(bragdoc.ai Workstreams)* Workstreams
   are discovered after the fact, need at least 20 achievements first (per the repo
   docs), and have no list of targets. So they can describe what you did, but they
   cannot say what is *missing*. dtasks needs targets set first (Competencies), with
   any inference limited to suggestions (Pattern to copy 2).
5. **Public profiles and share links.** *(bragdocs.com; bragdoc.ai share tokens)*
   Bragdocs.com made public @name timelines its core, and its farewell post records
   a spam-signup problem before it shut down in November 2024. dtasks is private and
   single-user. Its output should leave only as text that the user copies, never as
   a hosted page.
6. **No export, or export only for admins.** *(Culture Amp; Lattice)* Culture Amp's FAQ says
   plan export is not available yet, and closed plans cannot be reopened.
   Lattice growth-area CSVs are for admins only. A career record locked inside a
   tool fails at exactly the moment it is needed: changing jobs. The repo's own
   notes on Chris Albon's talk (`dont-do-invisible-work.md`) make the same point
   about keeping records portable.
7. **Frameworks frozen inside a plan.** *(Culture Amp)* New roles and competencies
   do not reach existing plans; the user must start a new plan. In dtasks,
   Competencies should be references:
   - Renaming one updates every tag.
   - Archiving one hides it from the chip row but keeps its history in the matrix
     and in past Evidence Packs.
8. **A goal-progress stream separate from the log.** *(Lattice; Culture Amp)*
   Progress there means ticking off actions and posting text updates. That is a
   second narrative next to the real record. In dtasks, a Goal's progress should
   simply be the Work Log Entries tagged with its Competency in its target Review
   Period. Do not add a separate update box.
9. **Output that is only chronological.** *(bragdocs.com timeline; `brag about`;
   Orosz work log on its own)* A dated list is a good *log* but a poor *argument*.
   Evans groups by theme, and Orosz's self-review regroups by goal and competency.
   The Evidence Pack should default to grouping by Competency.
10. **Rewarding volume.** *(BragLog streaks and 7/30/100-day badges; Snowflake
    points)* These reward logging often or scoring high, not covering the targets.
    If dtasks adds any nudge, it should point at an empty or thin Competency row,
    not at a streak.

## Implications for the UI prototype

A concrete sketch to test. It is derived from the patterns above and has not been
validated with the user.

1. **Competencies list** (settings-like page). Each Competency has a name, a kind
   (behaviour or technical area), a "looks like at Staff" note and a source link.
   It can be reordered and archived, and the page hints once the list passes 8.
2. **Work Log Entry form.** The existing category chips stay. Below them is an
   optional Competency chip row:
   - Suggested chips are outlined and confirmed with one click.
   - Untouched suggestions are not counted as tags.
   - The form adds no required field.
3. **Weekly sweep.** A list of this week's untagged entries, each with a chip row.
   It is reachable from the Work Log and from the weekly Rollup.
4. **Goals.** A Goal has a title, one primary Competency (secondary optional), a
   target Review Period and an optional project link. It shows its supporting
   entries, and the view warns when more than about three are active.
5. **Coverage matrix.** Rows are Competencies, columns are Review Periods, and each
   cell shows a count and a state (none, thin or backed). Each row carries its Goal
   chip, and clicking a row or cell opens the evidence drawer.
6. **Evidence Pack builder.** The user picks a Review Period and a grouping (by
   Competency or by Review Period). Starred entries are pre-selected. A Markdown
   preview has Goals, By Competency and Thin coverage sections, and a copy button.

## Open questions for the user

- **One or many Competencies per Goal?** A Culture Amp goal is based on one growth
  area, and a Lattice growth area appears to link one competency. The
  dtasks glossary allows several. Options are one primary with optional secondary
  Competencies, or a flat list.
- **What counts as "thin"?** The candidates are a number of entries, the presence
  of Impact and Evidence, or both. Should the threshold differ for behaviours (often
  shown by a few large stories) and technical areas?
- **How do the `glue` category and the behaviour Competencies relate?** Entries in
  the `glue` category often show behaviour Competencies (mentoring, cross-team
  alignment). Should the form suggest such a Competency when `glue` is picked, or
  stay silent?
- **Should Competency tags inherit from Goal → project → task automatically, or
  only be suggested?** This survey recommends suggested-only (Pattern to copy 2),
  so the coverage matrix stays the user's own claim.

## Caveats and unverified points

- **bragdoc.ai sources contradict each other.**
  - Impact scale: the homepage describes 1–5 stars, while the schema docs define a
    1–10 integer.
  - Export: the homepage claims PDF and Markdown, the features page mentions JSON
    export and import, and the repo's user docs say clipboard now, with Markdown,
    Word and PDF "coming soon".
  - Workstreams: the same user docs mark them as not yet built, although the schema
    already has the column.
  - This survey relies on the repo docs.
- **Progression:** whether one Win can carry several skill tags was not confirmed.
  The help pages say Wins are "tagged with skills" without a limit.
- **Lattice:** the growth-area log and export each have a single "Linked
  competency" column. That suggests one competency per growth area, but no page
  states the limit outright.
- **Mahara:** export options were not checked.
- **Notion template:** its structure was read from the public page's data (database
  names, fields, options, view names), not from written documentation.
- **Left out:** items seen only in search-result snippets (a ClickUp brag-doc
  article, Gumroad templates, a community "brag-sheet" agent skill). None of them
  was read at a primary source.

## Sources

Brag-document tools and templates

- Julia Evans, "Get your work recognized: write a brag document": https://jvns.ca/blog/brag-documents/
- Gergely Orosz, "Work log template for software engineers": https://blog.pragmaticengineer.com/work-log-template-for-software-engineers/
- Orosz work log template (Google Doc): https://docs.google.com/document/d/1PK1HGa3HViKSJhAhvQgZNEYB72J0DhcXPNKuSpI4N80/edit
- Gergely Orosz, "Performance self-review for software engineers": https://blog.pragmaticengineer.com/performance-self-review-for-software-engineers-with-an-example/
- Orosz self-review template (Google Doc): https://docs.google.com/document/d/14OspQhT7WqiWJdFMbKOoE366oZRpNBY2EHVB5Gf7PCk/edit
- Orosz templates index: https://blog.pragmaticengineer.com/templates-as-inspiration-for-software-engineers/
- James Stanier, "How do I make sure my work is visible?": https://www.theengineeringmanager.com/qa/how-do-i-make-sure-my-work-is-visible/
- Notion "Tech Brag Document Template" (Parul Singh / The Coding Recruiter). The structure was read from the template page itself (https://thecodingrecruiter.notion.site/db1224484b034a9a9b537daa5ca9be11), reached from its About page (https://thecodingrecruiter.notion.site/About-This-Template-c946d8fe13594a9bacdf55f5617ec7e3)
- Bragdocs.com home page: https://www.bragdocs.com/
- Bragdocs.com shutdown post (Jonny Burch's timeline): https://www.bragdocs.com/@jonny
- BragLog (App Store): https://apps.apple.com/us/app/braglog/id6759666989
- bragdoc.ai home and features: https://www.bragdoc.ai/ and https://www.bragdoc.ai/features
- bragdoc.ai source (schema and user docs): https://github.com/edspencer/bragdoc-ai (see `.claude/docs/tech/database.md` and `.claude/docs/user/web-features.md`)
- `brag` CLI: https://github.com/bovem/brag

Growth and competency tools

- Progression glossary (Careerminds support): https://support.careerminds.com/progression-glossary-progression-help-centre
- Progression Wins (support): https://support.careerminds.com/activity-wins
- Progression Wins (feature page): https://progression.co/features/wins/
- Progression check-ins overview: https://support.careerminds.com/overview-check-ins
- Progression, "Introducing Check-ins": https://progression.co/blog/introducing-checkins
- Using Progression's Slack app: https://support.careerminds.com/using-progressions-slack-app
- Lattice, "Create a growth area": https://help.lattice.com/en-us/articles/15179183-create-a-growth-area
- Lattice, "Key terms for Grow": https://help.lattice.com/en-us/articles/15178881-key-terms-for-grow
- Lattice, "Update growth area progress": https://help.lattice.com/en-us/articles/15179585-update-growth-area-progress
- Lattice, "View growth areas in a review context panel": https://help.lattice.com/en-us/articles/15179557-view-growth-areas-in-a-review-context-panel
- Lattice, "The growth area log": https://help.lattice.com/en-us/articles/15178843-the-growth-area-log
- Lattice, "Growth area exports": https://help.lattice.com/en-us/articles/15178478-growth-area-exports
- Lattice, "Lattice AI recommended growth areas": https://help.lattice.com/en-us/articles/15178520-lattice-ai-recommended-growth-areas
- Culture Amp, "Creating a development plan": https://support.cultureamp.com/en/articles/7048465-creating-a-development-plan
- Culture Amp, "Moving to competency-based development planning": https://support.cultureamp.com/en/articles/8349777-moving-to-competency-based-development-planning
- Mahara manual, SmartEvidence (20.10): https://manual.mahara.org/en/20.10/portfolio/smartevidence.html

Engineering ladders and Staff guidance

- Medium Snowflake (source and README): https://github.com/Medium/snowflake (see `constants.js` and `components/`)
- Engineering Ladders: http://www.engineeringladders.com/ and https://github.com/jorgef/engineeringladders
- Will Larson, StaffEng, "Promotion packets": https://staffeng.com/guides/promo-packets/
- progression.fyi (now redirects to careerminds.com/job-architecture): https://progression.fyi/
