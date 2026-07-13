#!/usr/bin/env python3
"""Manual password-recovery path for the beta (no email/SMTP).

Usage: python scripts/reset_password.py <email>
"""

from __future__ import annotations

import asyncio
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select  # noqa: E402

from app import db  # noqa: E402
from app.auth import MIN_PASSWORD_LENGTH, hash_password  # noqa: E402
from app.models import User  # noqa: E402


async def reset_password(email: str, new_password: str) -> bool:
    """Update `email`'s password hash. Returns False if no such user exists."""
    email = email.strip().lower()
    async with db.session_factory() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            return False
        user.password_hash = hash_password(new_password)
        await session.commit()
        return True


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: reset_password.py <email>", file=sys.stderr)
        sys.exit(1)
    email = sys.argv[1]

    password = getpass.getpass("New password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", file=sys.stderr)
        sys.exit(1)
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.", file=sys.stderr)
        sys.exit(1)

    found = asyncio.run(reset_password(email, password))
    if not found:
        print(f"No user found with email {email!r}.", file=sys.stderr)
        sys.exit(1)
    print(f"Password updated for {email}.")


if __name__ == "__main__":
    main()
