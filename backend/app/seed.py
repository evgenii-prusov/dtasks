from __future__ import annotations

import random
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from .models import Habit, HabitLog, Project, Task


async def seed_starter_data(session: AsyncSession, user_id: int) -> None:
    """Give a freshly signed-up user a small demo workspace. Does not commit."""
    projects = [
        Project(
            name="...",
            group="Work",
            position=0,
            description="Default project for Work tasks.",
            tasks=[],
        ),
        Project(
            name="Alerting Service",
            group="Work",
            position=1,
            description=(
                "Build a robust alerting service monitoring system metrics "
                "and notifying via Slack, email, and PagerDuty."
            ),
            tasks=[
                Task(title="Design alert schema & threshold config", complexity="low", position=0),
                Task(
                    title="Implement Slack integration",
                    complexity="high",
                    notes="Use Slack Bolt SDK",
                    assigned_today=True,
                    assigned_week=True,
                    must_have=True,
                    position=1,
                ),
                Task(
                    title="Write unit tests for threshold evaluator",
                    complexity="low",
                    assigned_week=True,
                    position=2,
                ),
                Task(title="Setup CI/CD pipeline", complexity="low", completed=True, position=3),
            ],
        ),
        Project(
            name="Demo with Cortex",
            group="Work",
            position=2,
            description=(
                "Prepare and deliver a compelling demo showcasing Cortex "
                "capabilities to the CTO and data team leads."
            ),
            notes="Deadline: end of May. Confirm stakeholders list with Marta.",
            tasks=[
                Task(
                    title="Define demo storyline & key messages",
                    complexity="high",
                    assigned_today=True,
                    assigned_week=True,
                    must_have=True,
                    position=0,
                ),
                Task(title="Build demo environment", complexity="high", assigned_week=True, position=1),
                Task(title="Rehearse walkthrough 3×", complexity="low", position=2),
            ],
        ),
        Project(
            name="AI Assisted Workflow",
            group="Work",
            position=3,
            description=(
                "Implement an AI-assisted workflow helping data teams discover, "
                "document, and develop data products faster."
            ),
            notes="Research dbt + LLM integrations. Talk to Marta about requirements first.",
            tasks=[
                Task(title="Research LLM-based data discovery tools", complexity="low", position=0),
                Task(title="Draw workflow diagram", complexity="low", position=1),
                Task(title="Draft technical specification", complexity="high", position=2),
            ],
        ),
        Project(
            name="...",
            group="Personal",
            position=4,
            description="Default project for Personal tasks.",
            tasks=[],
        ),
        Project(
            name="German Driving License",
            group="Personal",
            position=5,
            description=(
                "Pass the German Führerschein Class B. Theory exam booked May 15. "
                "~14 practical lessons needed."
            ),
            notes="Fahrschule: Auto Müller, call Monday mornings. Need passport photo for exam.",
            tasks=[
                Task(
                    title="Study theory modules 1–5",
                    complexity="low",
                    assigned_week=True,
                    position=0,
                ),
                Task(title="Book next driving lesson", complexity="low", completed=True, position=1),
                Task(title="Complete online practice tests", complexity="low", position=2),
            ],
        ),
    ]

    habits = [
        Habit(name="Learn German", subtitle="30 min a day", position=0),
        Habit(name="Read a book", subtitle="30 min a day", position=1),
        Habit(name="No eating after 20:00", subtitle="Daily discipline", position=2),
        Habit(name="Full task review", subtitle="Twice a week", position=3),
    ]
    today = date.today()
    rng = random.Random(42)
    for habit in habits:
        for i in range(90, 0, -1):
            r = rng.random()
            state = 0 if r < 0.18 else 1 if r < 0.48 else 2
            habit.logs.append(HabitLog(day=today - timedelta(days=i), state=state))

    for project in projects:
        project.user_id = user_id
    for habit in habits:
        habit.user_id = user_id

    session.add_all(projects)
    session.add_all(habits)
