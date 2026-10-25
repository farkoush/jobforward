"""Interactive Persian CLI for the Experience Improvement Flow.

Entry point: ``python -m jobforward`` (run from repository root with
``PYTHONUTF8=1``).

State machine (per contracts/cli-session.md):
    IDLE ──add-entry──► ENTRY_FILLED ──auto-score──► SCORE_SHOWN

All user-facing strings come from ``messages.py`` (constitution Principle 10).
"""

from __future__ import annotations

import argparse
import sys
from typing import Optional

from .messages import (
    ADD_TYPE,
    ADD_TITLE,
    ADD_ORG,
    ADD_START,
    ADD_END,
    ADD_BULLET_PROMPT,
    ADD_BULLET_DONE,
    Q_RESULT_HINT,
    ASK_RESULT_IMPACT,
    ASK_SKILL_RELEVANCE,
    SCORE_BULLET_HEADER,
    SCORE_DIMENSION,
    SCORE_EXPERIENCE,
    SCORE_OVERALL,
    ERR_TOO_MANY_BULLETS,
    ERR_ENV,
)
from .models.entities import ExperienceEntryType, BulletStatus
from .flow.path_service import PathService, EntryResult
from .storage.repository import Repository
from .storage.events import EventLogger, EVENT_PATH_START, EVENT_ANALYSIS_COMPLETED
from .scoring.evaluator import BulletEvaluator, BulletRatingRequest
from .scoring.adapters.local import LocalHeuristicAdapter
from .scoring.metrics import dimension_score, experience_score, overall_score

RUBRIC_VERSION = "rubric-1.0.0"


class SessionState:
    IDLE = "IDLE"
    ENTRY_FILLED = "ENTRY_FILLED"
    SCORE_SHOWN = "SCORE_SHOWN"


class CLI:
    """Interactive text-flow session loop."""

    def __init__(self) -> None:
        self.repository = Repository()
        self.path_service = PathService(self.repository)
        self.evaluator: BulletEvaluator = LocalHeuristicAdapter(
            rubric_version=RUBRIC_VERSION
        )
        self.logger = EventLogger()
        self.state = SessionState.IDLE
        self.entry_id_counter = 1
        self.current_entry = None

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _prompt(self, text: str) -> str:
        """Print a prompt and read a line from stdin."""
        print(text, end=" ")
        return input().strip()

    def _next_entry_id(self) -> int:
        eid = self.entry_id_counter
        self.entry_id_counter += 1
        return eid

    # ------------------------------------------------------------------ #
    # IDLE state: collect entry
    # ------------------------------------------------------------------ #
    def _collect_entry(self) -> Optional[EntryResult]:
        """Walk the user through ADD_* prompts to build an entry."""
        print(ADD_TYPE)
        type_choice = self._prompt(">")
        type_map = {
            "1": ExperienceEntryType.JOB,
            "2": ExperienceEntryType.PROJECT,
            "3": ExperienceEntryType.COURSE,
            "4": ExperienceEntryType.SIDE_WORK,
        }
        entry_type = type_map.get(type_choice, ExperienceEntryType.JOB)

        title = self._prompt(ADD_TITLE)
        if not title:
            print("عنوان نمی‌تواند خالی باشد.")
            return None

        org = self._prompt(ADD_ORG) or None
        start = self._prompt(ADD_START) or None
        end = self._prompt(ADD_END) or None

        print(ADD_BULLET_PROMPT)
        bullets = []
        while len(bullets) < 6:
            line = self._prompt(f"نقشه {len(bullets)+1} ({ADD_BULLET_DONE} برای پایان):")
            if line == ADD_BULLET_DONE or line.lower() in ("done", "پایان"):
                break
            if line:
                bullets.append(line)

        if not bullets:
            # Zero bullets → draft (FR-003)
            result = self.path_service.add_entry(
                entry_id=self._next_entry_id(),
                entry_type=entry_type,
                title=title,
                organization=org,
                start=start,
                end=end,
                bullets=[],
            )
            print("تجربه به عنوان پیش‌نویس ثبت شد (بدون نقشه).")
            return result

        if len(bullets) > 6:
            print(ERR_TOO_MANY_BULLETS)
            return None

        result = self.path_service.add_entry(
            entry_id=self._next_entry_id(),
            entry_type=entry_type,
            title=title,
            organization=org,
            start=start,
            end=end,
            bullets=bullets,
        )
        return result

    # ------------------------------------------------------------------ #
    # SCORE_SHOWN state: score and display
    # ------------------------------------------------------------------ #
    def _score_and_show(self, entry) -> None:
        """Score all bullets and display results (FR-005, FR-008)."""
        texts = [b.text for b in entry.bullets]
        request = BulletRatingRequest(
            texts=texts, rubric_version=RUBRIC_VERSION
        )
        response = self.evaluator.evaluate_with_retry(request)

        # Calculate dimension scores per bullet
        bullet_scores = []
        for rating in response.ratings:
            dims = {
                "نقش و اقدام": rating.role_action_clarity,
                "نتیجه": rating.outcome,
                "شاهد مهارت": rating.skill_evidence,
                "ساختار و اسکناب": rating.structure_scannability,
            }
            dim_scores = [
                dimension_score(dims["نقش و اقدام"], 1),
                dimension_score(dims["نتیجه"], 1),
                dimension_score(dims["شاهد مهارت"], 1),
                dimension_score(dims["ساختار و اسکناب"], 1),
            ]
            exp = experience_score(dim_scores)
            bullet_scores.append((rating, dims, dim_scores, exp))

        # Overall score across entries with bullets
        exp_scores = [bs[3] for bs in bullet_scores]
        overall = overall_score(exp_scores)

        # Display
        print(f"\n{SCORE_BULLET_HEADER.format(text=entry.title, rubric=RUBRIC_VERSION)}")
        for i, (rating, dims, dim_scores, exp) in enumerate(bullet_scores):
            print(f"\nنقشه {i+1}: {entry.bullets[i].text}")
            for name, value in dims.items():
                print(SCORE_DIMENSION.format(dimension=name, value=value))
            print(SCORE_EXPERIENCE.format(value=round(exp, 2)))

        print(f"\n{SCORE_OVERALL.format(value=round(overall, 2))}")

        # Emit events (T017)
        self.logger.analysis_completed(
            context={
                "entry_id": entry.id,
                "rubric_version": RUBRIC_VERSION,
                "overall_score": round(overall, 2),
            }
        )

    # ------------------------------------------------------------------ #
    # Main loop
    # ------------------------------------------------------------------ #
    def run(self) -> int:
        """Run the interactive session. Returns exit code."""
        try:
            # Check PYTHONUTF8 for Persian output
            import os

            if os.environ.get("PYTHONUTF8") != "1":
                print(ERR_ENV)
                # Continue anyway; user was warned

            self.logger.path_start(
                context={"session_id": id(self)}
            )

            while True:
                if self.state == SessionState.IDLE:
                    print("\n--- شروع جلسه بهبود تجربه ---")
                    result = self._collect_entry()
                    if result is None:
                        continue
                    if result.is_draft:
                        self.state = SessionState.IDLE
                        continue
                    self.current_entry = result.entry
                    self.state = SessionState.SCORE_SHOWN

                elif self.state == SessionState.SCORE_SHOWN:
                    if self.current_entry is not None:
                        self._score_and_show(self.current_entry)
                    self.state = SessionState.IDLE
                    self.current_entry = None

                    cont = self._prompt("آیا مایل به ادامه هستید؟ (۱) بله ۲) خیر:")
                    if cont != "۱":
                        break

        except KeyboardInterrupt:
            print("\nخروج از جلسه.")
            return 0
        except Exception as exc:  # pragma: no cover - safety net
            print(f"خطای غیرمنتظره: {exc}")
            return 1

        print("maryad shodan.")  # TODO: replace with proper Persian goodbye
        return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="JobForward — تجربه کار شغلی را روایت کنید"
    )
    parser.parse_args(argv)
    cli = CLI()
    return cli.run()


if __name__ == "__main__":
    sys.exit(main())
