"""Bullet status state machine (data-model.md, locked by Clarification Q4).

Transitions:
    new  --(successful analysis)-->  analyzed
    analyzed --(approved rewrite or direct user edit)-->  edited
    edited --(re-analysis completes)-->  analyzed
    failed/non-run analysis keeps the previous label (no change)

Illegal transitions are rejected by :func:`transition`.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from .entities import BulletStatus


class IllegalTransitionError(Exception):
    """Raised when an illegal bullet status transition is attempted."""


# Allowed transitions: (from_status) -> set of allowed (to_status) targets.
_ALLOWED_TRANSITIONS: dict[BulletStatus, frozenset[BulletStatus]] = {
    BulletStatus.NEW: frozenset({BulletStatus.ANALYZED}),
    BulletStatus.ANALYZED: frozenset({BulletStatus.EDITED}),
    BulletStatus.EDITED: frozenset({BulletStatus.ANALYZED}),
}


@dataclass(frozen=True)
class TransitionResult:
    """Outcome of a status transition attempt."""

    ok: bool
    from_status: BulletStatus
    to_status: BulletStatus
    changed: bool
    error: Optional[str] = None


def transition(
    current: BulletStatus, target: BulletStatus
) -> TransitionResult:
    """Attempt to transition a bullet status.

    Returns a :class:`TransitionResult`. Illegal transitions return
    ``ok=False`` with an error message and are NOT applied.
    """

    # Same status: no change needed (e.g. failed analysis keeps prior label).
    if current == target:
        return TransitionResult(
            ok=True,
            from_status=current,
            to_status=target,
            changed=False,
        )

    allowed = _ALLOWED_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        return TransitionResult(
            ok=False,
            from_status=current,
            to_status=target,
            changed=False,
            error=(
                f"Illegal bullet status transition from {current.value!r} "
                f"to {target.value!r}; allowed targets: "
                f"{sorted(s.value for s in allowed) or ['none']}"
            ),
        )

    return TransitionResult(
        ok=True,
        from_status=current,
        to_status=target,
        changed=True,
    )


def is_terminal(status: BulletStatus) -> bool:
    """Whether a status requires no further action (analyzed)."""

    return status == BulletStatus.ANALYZED



def now_iso8601() -> str:
    """Return current UTC time as ISO-8601 string (FR-015).

    Defined here so storage/repository.py can import it without circular
    imports (entities imports nothing from status).
    """
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
