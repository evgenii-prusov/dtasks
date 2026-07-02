# Task Tracker with Habits

_Started 2026-04-26 18:47 UTC_

---

## User

I'm going to create a task tracker with clean UI as in "todoist", but with additional functionality it lacks:
1) Habits tracker (definition of habit + github like visualization of whether I've done habit or not on particular day with 3 states: white (didn't), light green (minimal) and green (complete).
2) Review mode, when I can review all projects one by one with predefined timer to not stuck forever. In this mode I should handle project by project, observe it's desscription, current defined elements, notes and be able to add new tasks.
2) Plan mode to choose certain tasks for today. In this mode I can look through all tasks that are defined for all projects and assign them for today or for a week. There should be an option to set MUST HAVE task for today (a kind of high priority) to let me know that I should start from these tasks. There should be a limit of no more then 2 such tasks for a day.

## Assistant

_[tool: questions_v2]_

## User

Questions answered:
- existing_style: Warm & calm (Notion-like)
- color_mode: Both with toggle
- projects: Work: Implement Alerting Service, Make a demo with Cortex, Implement AI Assisted workflow for Data Product dev
Personal: Get German Driving License
- habits: Learn German 30 min a day
Read a book 30 min a day
Don't eat after 20:00
Make a review of all tasks twice a week
- review_timer: 5
- review_elements: Open tasks, Notes / free text area, Completed tasks, Project description
- plan_week: Grouped by project
- task_fields: Project tag, Notes / description, complexity: low, high, Recurring flag
- nav_style: Left sidebar (desktop)
- variations: Decide for me

## Assistant

## Assistant

_[tool: update_todos]_

Yes, building it now! Let me write the full app.

_[tool: write_file]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Your **FlowTask** app is live! Here's what's included:

**4 core views:**
- **Today** — MUST HAVE section (max 2, marked with 🔥), today's tasks, this week's tasks. Badge on sidebar shows count.
- **Plan** — Browse all tasks grouped by project, toggle Today/Week assignment, mark Must Have with enforcement of the 2-task limit.
- **Review** — 5-min countdown timer per project (auto-advances), progress bar across top, description + open tasks + completed tasks + editable notes. Pause/resume + manual prev/next.
- **Habits** — GitHub-style contribution grid (16 weeks), 3 states (white/light green/green), streak counter, total days, click any past cell to cycle state.

**Plus:** per-project views, dark/light toggle, full localStorage persistence.

Let me know what you'd like to refine — adding new habits/projects, tweaking the timer, changing the visual style, or anything else.

## User

Verifier agent check completed

## Assistant

All checks passed! The app is clean and ready to use.

A few things you can do next:
- **Add more projects** — click any project in the sidebar, then "+ Add task"
- **Log habits** — click the colored squares in the grid or use the Today quick-toggle
- **Start a review session** — opens all 4 projects in sequence with the 5-min timer
- **Plan tomorrow** — use the Plan view to pre-assign tasks for the next day

What would you like to improve or add?

## User

I want a total timer for review session, not for each project.

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now let me fix the timer display and subtitle too:

_[tool: str_replace_edit]_

Let me also update the timer label and remove the per-project auto-advance note:

_[tool: str_replace_edit]_

Now let me add the session-complete state and call done:

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

Now fix the references to `open` and `done` in the JSX:

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

The ReviewView references are on lines 665-698. I'll update them with enough context to be unique:

_[tool: done]_

_[tool: snip]_

The review timer is now a single session-wide countdown — e.g. 4 projects × 5 min = 20 minutes total. When time runs out, you see a "Session complete" screen with an option to restart. What else would you like to change?

## User

In Review mode I can see OPEN TASKS ( 3 ) and 3 tasks at the bottom if we a talking about Alerting Service project. Bu I can't reorder and change tasks itself

## Assistant

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Open tasks in Review mode are now checkable, editable (click to edit title/notes), and reorderable (▲▼ buttons).

_[tool: ready_for_verification]_

Done — Review mode tasks are now editable and reorderable.

## User

In this mode I can't change tags low, hard

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Complexity (low/high) is now editable inline in Review mode too.

_[tool: ready_for_verification]_

Done.

## User

I can see only blank screen now

## Assistant

_[tool: get_webview_logs]_

_[tool: show_html]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: eval_js]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

That looks fine. Let me check the buildDays function for an infinite loop bug — that's the most likely suspect for a hang.

_[tool: grep]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: show_html]_

_[tool: sleep]_

_[tool: save_screenshot]_

_[tool: get_webview_logs]_

_[tool: read_file]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: delete_file]_

_[tool: ready_for_verification]_

_[tool: show_html]_

_[tool: sleep]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: sleep]_

_[tool: show_html]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: delete_file]_

_[tool: read_file]_

_[tool: screenshot_user_view]_

_[tool: sleep]_

_[tool: show_html]_

I checked the code closely — no infinite loops or bugs found in the recent changes (reorder/edit/complexity logic all look sound). But right now every preview I try to open — including a blank test file unrelated to your app — fails to load at all (even in your own view), which points to a temporary environment/infra issue rather than a bug in FlowTask.html.

Could you try refreshing your tab? If it still shows blank after that, let me know and I'll keep digging.

