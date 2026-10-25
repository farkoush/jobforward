"""Interactive CLI for the Experience Improvement Flow (English, B1 level).

Entry point: ``python -m jobforward`` (run from repository root with
``PYTHONUTF8=1``).

State machine (per contracts/cli-session.md):
    IDLE ──add-entry──► ENTRY_FILLED ──auto-score──► SCORE_SHOWN
    SCORE_SHOWN ──rewrite gate (per bullet, default Yes)──► question flow
    SCORE_SHOWN ──match-posting / edit / delete / merge / copy──► handlers

All user-facing strings come from ``messages.py`` (constitution P10 v2.0.0).
Input/output are injectable so tests can drive the session deterministically.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Callable, Optional

from . import messages as m
from .models.entities import (
    Bullet,
    BulletStatus,
    ExperienceEntry,
    ExperienceEntryType,
    GateDecision,
    ProposalDecision,
    ProposalRecord,
    QuestionDimension,
    Ratings,
    now_iso8601,
)
from .models.status import transition
from .flow.path_service import PathService, contains_non_english
from .flow.questions import (
    all_skipped,
    build_questions,
    deficient_dimensions,
    gate_allowed,
    has_partial_answers,
    next_round,
)
from .flow.rewrite import ExtraClaimError, assemble_rewrite
from .flow.incremental import needs_reanalysis
from .scoring.overlap import find_overlaps
from .storage.repository import Repository, DEFAULT_RUBRIC_VERSION
from .storage.events import EventLogger
from .storage.schema import is_eligible_for_overall
from .scoring.evaluator import BulletEvaluator, BulletRatingRequest, EvaluatorOutputError
from .scoring.adapters.local import LocalHeuristicAdapter
from .scoring.metrics import entry_score_from_ratings, overall_score
from .matcher.analyzer import MatcherOutputError, PostingAnalyzer
from .matcher.adapters.local import LocalRuleAdapter
from .matcher.actions import assign_actions

RUBRIC_VERSION = DEFAULT_RUBRIC_VERSION

TYPE_CHOICES = {
    "1": ExperienceEntryType.JOB,
    "2": ExperienceEntryType.PROJECT,
    "3": ExperienceEntryType.COURSE,
    "4": ExperienceEntryType.SIDE_WORK,
}


class SessionState:
    IDLE = "IDLE"
    ENTRY_FILLED = "ENTRY_FILLED"
    SCORE_SHOWN = "SCORE_SHOWN"


class CLI:
    """Interactive text-flow session loop."""

    def __init__(
        self,
        repository_path: str | os.PathLike = "data/resume.json",
        log_path: str | os.PathLike = "data/events.log.jsonl",
        input_fn: Callable[[str], str] = input,
        output_fn: Callable[[str], None] = print,
        evaluator: Optional[BulletEvaluator] = None,
        analyzer: Optional[PostingAnalyzer] = None,
    ) -> None:
        self.repository = Repository(repository_path)
        self.path_service = PathService(self.repository)
        self.logger = EventLogger(log_path)
        self.evaluator: BulletEvaluator = evaluator or LocalHeuristicAdapter(
            rubric_version=RUBRIC_VERSION
        )
        self.analyzer: PostingAnalyzer = analyzer or LocalRuleAdapter(
            rubric_version=RUBRIC_VERSION
        )
        self._input = input_fn
        self._print = output_fn
        self.state = SessionState.IDLE
        self.current_entry: Optional[ExperienceEntry] = None
        self.failure_exit = False

    # ------------------------------------------------------------------ #
    # I/O helpers
    # ------------------------------------------------------------------ #
    def _prompt(self, text: str) -> str:
        self._print(text)
        return self._input(m.PROMPT_CONTINUE).strip()

    def _show(self, text: str) -> None:
        self._print(text)

    def _ask_question(self, question_text: str) -> tuple[str, Optional[str]]:
        """Render a question with Answer/Skip choices.

        Returns ("answer", text) or ("skip", None). Non-English answers are
        rejected with ERR_NON_ENGLISH_INPUT and re-asked.
        """
        while True:
            self._print(question_text)
            choice = self._input(m.PROMPT_CONTINUE).strip()
            if choice in ("2", "s", "skip"):
                return "skip", None
            # "1", empty, or anything else → treat as an answer attempt.
            answer = self._input(m.PROMPT_CONTINUE).strip()
            if not answer:
                return "skip", None  # an empty answer is a skip
            if contains_non_english(answer):
                self._show(m.ERR_NON_ENGLISH_INPUT)
                continue
            return "answer", answer

    # ------------------------------------------------------------------ #
    # IDLE state
    # ------------------------------------------------------------------ #
    def _idle(self) -> Optional[str]:
        """Idle menu. Returns "exit" or None."""
        choice = self._prompt(m.MENU_IDLE)
        if choice == "1":
            self._collect_entry()
            return None
        if choice == "2":
            self._match_posting()
            return None
        if choice == "3":
            return "exit"
        self._show(m.ERR_INVALID_CHOICE)
        return None

    def _collect_entry(self) -> None:
        """Walk ADD_* prompts; record the entry; drafts return to IDLE."""
        while True:
            type_choice = self._prompt(m.ADD_TYPE)
            entry_type = TYPE_CHOICES.get(type_choice)
            if entry_type is not None:
                break
            self._show(m.ERR_INVALID_CHOICE)

        while True:
            title = self._input(m.ADD_TITLE).strip()
            if title:
                break
            self._show(m.ERR_INVALID_TITLE)

        self._show(m.ADD_BULLET_PROMPT)
        bullets: list[str] = []
        n = 1
        while len(bullets) < 6:
            line = self._input(m.ADD_BULLET_INPUT.format(n=n)).strip()
            if not line:
                self._show(m.ADD_BULLET_DONE)
                break
            if contains_non_english(line):
                self._show(m.ERR_NON_ENGLISH_INPUT)
                continue  # re-ask the same bullet number
            bullets.append(line)
            n += 1
        if len(bullets) == 6 and self._input(m.ADD_BULLET_INPUT.format(n=7)).strip():
            # A 7th line was attempted: refuse per FR-002 and keep 6.
            self._show(m.ERR_TOO_MANY_BULLETS)

        result = self.path_service.add_entry(
            entry_type=entry_type, title=title, bullets=bullets
        )
        if result.error:
            self._show(getattr(m, result.error, m.ERR_INVALID_CHOICE))
            return
        assert result.entry is not None
        if result.is_draft:
            self._show(m.DRAFT_NOTICE)
            self._show(m.DRAFT_SUGGESTION)
            return
        self.current_entry = result.entry
        self.state = SessionState.SCORE_SHOWN

    # ------------------------------------------------------------------ #
    # Scoring (US1)
    # ------------------------------------------------------------------ #
    def _score_and_show(self, entry: ExperienceEntry) -> bool:
        """Score all bullets, persist, display. Returns False on evaluator
        failure (exit-code-2 path, data intact)."""
        texts = [b.text for b in entry.bullets]
        request = BulletRatingRequest(texts=texts, rubric_version=RUBRIC_VERSION)
        try:
            response = self.evaluator.evaluate_with_retry(request)
        except EvaluatorOutputError:
            self._show(m.ERR_EVALUATOR_FAILURE)
            self.failure_exit = True
            return False

        for bullet, rating in zip(entry.bullets, response.ratings):
            bullet.rating_pending = None
            bullet.ratings = Ratings(
                context=rating.context,
                role_action_clarity=rating.role_action_clarity,
                result=rating.result,
            )
            bullet.rubric_version = RUBRIC_VERSION
            # new → analyzed; edited → analyzed; failed analysis keeps label
            target = (
                BulletStatus.ANALYZED
                if bullet.status in (BulletStatus.NEW, BulletStatus.EDITED)
                else bullet.status
            )
            result = transition(bullet.status, target)
            if result.ok and result.changed:
                bullet.status = target

        self._recompute_entry_score(entry)
        self.path_service._persist_entry(entry)

        # Display
        self._show(m.SCORE_BULLET_HEADER.format(text=entry.title, rubric=RUBRIC_VERSION))
        for i, bullet in enumerate(entry.bullets, start=1):
            self._show(m.SCORE_BULLET_LINE.format(n=i, text=bullet.text))
            if bullet.ratings is not None:
                self._show(
                    m.SCORE_DIMENSION.format(
                        dimension=m.SCORE_DIMENSION_CONTEXT, value=bullet.ratings.context
                    )
                )
                self._show(
                    m.SCORE_DIMENSION.format(
                        dimension=m.SCORE_DIMENSION_ACTION,
                        value=bullet.ratings.role_action_clarity,
                    )
                )
                self._show(
                    m.SCORE_DIMENSION.format(
                        dimension=m.SCORE_DIMENSION_RESULT, value=bullet.ratings.result
                    )
                )
            self._show(m.SCORE_STATUS.format(status=bullet.status.value))
        if entry.entry_score is not None:
            self._show(
                m.SCORE_EXPERIENCE.format(
                    value=round(entry.entry_score, 2), rubric=RUBRIC_VERSION
                )
            )
        self._show_overall()
        self.logger.analysis_completed(
            context={
                "entry_id": entry.id,
                "rubric_version": RUBRIC_VERSION,
                "overall_score": self._current_overall(),
            }
        )
        return True

    def _recompute_entry_score(self, entry: ExperienceEntry) -> Optional[float]:
        if not entry.bullets or any(b.ratings is None for b in entry.bullets):
            entry.entry_score = None
            return None
        score = entry_score_from_ratings(
            [b.ratings for b in entry.bullets if b.ratings is not None]
        )
        entry.entry_score = score
        entry.rubric_version = RUBRIC_VERSION
        return score

    def _eligible_entries(self) -> list[ExperienceEntry]:
        return [e for e in self.repository.load() if is_eligible_for_overall(e)]

    def _current_overall(self) -> Optional[float]:
        eligible = self._eligible_entries()
        if not eligible:
            return None
        return overall_score([e.entry_score for e in eligible if e.entry_score is not None])

    def _show_overall(self) -> None:
        overall = self._current_overall()
        if overall is None:
            self._show(m.SCORE_OVERALL_HIDDEN)
        else:
            self._show(m.SCORE_OVERALL.format(value=round(overall, 2), rubric=RUBRIC_VERSION))

    # ------------------------------------------------------------------ #
    # Rewrite loop (US2)
    # ------------------------------------------------------------------ #
    def _rewrite_round(self, entry: ExperienceEntry) -> None:
        """Gate + 0–3 questions per bullet; proposals on explicit approval."""
        for bullet in list(entry.bullets):
            if bullet.ratings is None:
                continue
            if not gate_allowed(bullet):
                continue  # one round per bullet per run (FR-009)

            gate_choice = self._prompt(m.ASK_REWRITE_GATE)
            if gate_choice == "2":
                # Gate rejected: log, no questions, no rewrite, continue.
                bullet.questions.extend(
                    build_questions(bullet, bullet.ratings, GateDecision.REJECTED)
                )
                self.path_service._persist_entry(entry)
                self.logger.question_rejected(
                    context={"entry_id": entry.id, "bullet_id": bullet.id, "stage": "gate"}
                )
                self._show(m.NO_REWRITE)
                continue
            dims = deficient_dimensions(bullet.ratings)
            if not dims:
                # Complete bullet: only a final confirmation (PRD §4.2).
                confirm = self._prompt(m.BULLET_CONFIRM)
                if confirm == "2":
                    self._edit_bullet_flow(entry)
                continue

            round_number = next_round(bullet)
            questions = build_questions(
                bullet, bullet.ratings, GateDecision.ACCEPTED, round_number
            )
            answers: dict[QuestionDimension, str] = {}
            for question in questions:
                assert question.dimension is not None
                outcome, answer = self._ask_question(question.text)
                if outcome == "skip":
                    question.skipped = True
                    question.skipped_at = now_iso8601()
                    self.logger.question_skipped(
                        context={
                            "entry_id": entry.id,
                            "bullet_id": bullet.id,
                            "dimension": question.dimension.value,
                        }
                    )
                else:
                    assert answer is not None
                    question.answer = answer
                    question.answered_at = now_iso8601()
                    answers[question.dimension] = answer
            bullet.questions.extend(questions)
            self.path_service._persist_entry(entry)

            if not answers:
                self._show(m.NO_REWRITE)
                continue

            if has_partial_answers(questions):
                # Draft-or-approve branch (FR-009).
                branch = self._prompt(m.DRAFT_OR_APPROVE)
                if branch == "1":
                    self.path_service.save_entry_as_draft(entry)
                    self.logger.entry_saved_as_draft(
                        context={"entry_id": entry.id, "reason": "user_saved"}
                    )
                    self._show(m.ENTRY_SAVED_AS_DRAFT)
                    return  # the whole entry is a draft; stop the rewrite loop
                # else: approve a rewrite from the answers so far
            self._proposal_flow(entry, bullet, answers)

    def _proposal_flow(
        self,
        entry: ExperienceEntry,
        bullet: Bullet,
        answers: dict[QuestionDimension, str],
    ) -> None:
        try:
            proposal = assemble_rewrite(bullet.text, answers)
        except ExtraClaimError:
            # Zero tolerance: a fabricated claim is refused, never shown (P1).
            self._show(m.ERR_EVALUATOR_FAILURE)
            return

        decision = self._prompt(m.PROPOSAL_SHOW.format(proposal=proposal))
        record = ProposalRecord(text=proposal)
        if decision == "1":
            self.logger.score_before(
                context={
                    "entry_id": entry.id,
                    "bullet_id": bullet.id,
                    "entry_score": entry.entry_score,
                    "rubric_version": RUBRIC_VERSION,
                }
            )
            entry.add_history(bullet, now_iso8601())
            bullet.text = proposal
            bullet.status = BulletStatus.EDITED
            record.decision = ProposalDecision.APPROVED
            record.decided_at = now_iso8601()
            bullet.proposals.append(record)
            self.path_service._persist_entry(entry)
            self.logger.proposal_accepted(
                context={"entry_id": entry.id, "bullet_id": bullet.id}
            )
            self._reanalyze_bullet(entry, bullet)
        else:
            record.decision = ProposalDecision.REJECTED
            record.decided_at = now_iso8601()
            bullet.proposals.append(record)
            self.path_service._persist_entry(entry)
            self.logger.proposal_rejected(
                context={"entry_id": entry.id, "bullet_id": bullet.id}
            )
            self._show(m.PROPOSAL_REJECTED)

    def _reanalyze_bullet(self, entry: ExperienceEntry, bullet: Bullet) -> None:
        """Re-analyze ONLY the edited bullet, then show before/after (US3)."""
        if not needs_reanalysis(bullet):
            return
        before = entry.entry_score
        request = BulletRatingRequest(texts=[bullet.text], rubric_version=RUBRIC_VERSION)
        try:
            response = self.evaluator.evaluate_with_retry(request)
        except EvaluatorOutputError:
            # Failed analysis keeps the prior label and scores (FR-014).
            self._show(m.ERR_EVALUATOR_FAILURE)
            self.failure_exit = True
            return
        rating = response.ratings[0]
        from .models.entities import Ratings

        bullet.ratings = Ratings(
            context=rating.context,
            role_action_clarity=rating.role_action_clarity,
            result=rating.result,
        )
        bullet.rubric_version = RUBRIC_VERSION

        result = transition(bullet.status, BulletStatus.ANALYZED)
        if result.ok and result.changed:
            bullet.status = BulletStatus.ANALYZED
        self._recompute_entry_score(entry)
        self.path_service._persist_entry(entry)
        self.logger.score_after(
            context={
                "entry_id": entry.id,
                "bullet_id": bullet.id,
                "entry_score": entry.entry_score,
                "rubric_version": RUBRIC_VERSION,
            }
        )
        self._show(
            m.SCORE_BEFORE_AFTER.format(
                before=round(before, 2) if before is not None else None,
                after=round(entry.entry_score, 2) if entry.entry_score is not None else None,
                rubric=RUBRIC_VERSION,
            )
        )

    # ------------------------------------------------------------------ #
    # Merge warning (US4)
    # ------------------------------------------------------------------ #
    def _merge_warning(self, entry: ExperienceEntry) -> None:
        overlaps = find_overlaps([b.text for b in entry.bullets])
        if not overlaps:
            return
        for bullet in entry.bullets:
            bullet.merge_warned = True
        self.path_service._persist_entry(entry)
        choice = self._prompt(m.MERGE_WARN)
        if choice == "1" and len(overlaps) == 1:
            pair = overlaps[0]
            first = self.path_service._bullet(entry, pair.bullet_a)
            second = self.path_service._bullet(entry, pair.bullet_b)
            if first is not None and second is not None:
                # Verbatim join of the two user texts; nothing is invented.
                first.text = f"{first.text} {second.text}"
                first.status = BulletStatus.EDITED
                entry.bullets.remove(second)
                self.path_service._persist_entry(entry)
        else:
            self._show(m.MERGE_DECLINED)

    # ------------------------------------------------------------------ #
    # SCORE_SHOWN menu (edit / delete / copy / continue)
    # ------------------------------------------------------------------ #
    def _score_shown_menu(self, entry: ExperienceEntry) -> None:
        while True:
            choice = self._prompt(m.MENU_SCORE_SHOWN)
            if choice == "1":
                self._edit_bullet_flow(entry)
            elif choice == "2":
                if self._delete_bullet_flow(entry):
                    return  # entry became a draft → IDLE
            elif choice == "3":
                if self._delete_entry_flow(entry):
                    return
            elif choice == "4":
                self._copy_flow(entry)
            elif choice == "5":
                return
            else:
                self._show(m.ERR_INVALID_CHOICE)

    def _edit_bullet_flow(self, entry: ExperienceEntry) -> None:
        for i, bullet in enumerate(entry.bullets, start=1):
            self._show(m.SCORE_BULLET_LINE.format(n=i, text=bullet.text))
        number = self._prompt(m.EDIT_BULLET_PROMPT)
        if not number.isdigit() or not 1 <= int(number) <= len(entry.bullets):
            self._show(m.ERR_INVALID_CHOICE)
            return
        bullet = entry.bullets[int(number) - 1]  # the shown 1-based position
        text = self._input(m.EDIT_BULLET_TEXT).strip()
        error = self.path_service.edit_bullet_text(entry, bullet.id, text)
        if error:
            self._show(getattr(m, error, m.ERR_INVALID_CHOICE))
            return
        self._show(m.EDIT_BULLET_DONE)

    def _delete_bullet_flow(self, entry: ExperienceEntry) -> bool:
        """Returns True when the entry dropped to draft (back to IDLE).
        The entered number is the 1-based position shown in the list."""
        for i, bullet in enumerate(entry.bullets, start=1):
            self._show(m.SCORE_BULLET_LINE.format(n=i, text=bullet.text))
        number = self._prompt(m.EDIT_BULLET_PROMPT)
        if not number.isdigit() or not 1 <= int(number) <= len(entry.bullets):
            self._show(m.ERR_INVALID_CHOICE)
            return False
        bullet = entry.bullets[int(number) - 1]
        confirm = self._prompt(m.CONFIRM_DELETE_BULLET)
        if confirm != "1":
            return False
        self.path_service.delete_bullet(entry, bullet.id)
        self.logger.bullet_deleted(
            context={"entry_id": entry.id, "bullet_id": bullet.id}
        )
        self._show(m.DELETED_BULLET)
        if not entry.bullets:
            self._show(m.DRAFT_REVERTED)
            return True
        self._recompute_entry_score(entry)
        self.path_service._persist_entry(entry)
        return False

    def _delete_entry_flow(self, entry: ExperienceEntry) -> bool:
        confirm = self._prompt(m.CONFIRM_DELETE_ENTRY)
        if confirm != "1":
            return False
        self.path_service.delete_entry(entry.id)
        self.logger.entry_deleted(context={"entry_id": entry.id})
        self._show(m.DELETED_ENTRY)
        return True

    def _copy_flow(self, entry: ExperienceEntry) -> None:
        self._show(m.COPY_BEGIN)
        self._show(self.path_service.copy_text(entry))
        self._show(m.COPY_END)

    @staticmethod
    def _bullet(entry: ExperienceEntry, bullet_id: int) -> Optional[Bullet]:
        for bullet in entry.bullets:
            if bullet.id == bullet_id:
                return bullet
        return None

    # ------------------------------------------------------------------ #
    # Matcher (US5)
    # ------------------------------------------------------------------ #
    def _match_posting(self) -> None:
        entries = [e for e in self.repository.load() if not e.deleted]
        if not entries:
            self._show(m.ERR_NO_ENTRY)
            return
        self._show(m.MATCH_POSTING)
        lines: list[str] = []
        while True:
            line = self._input(m.PROMPT_CONTINUE)
            if not line.strip():
                break
            lines.append(line.rstrip())
        posting_text = "\n".join(lines)
        if not posting_text.strip():
            return
        try:
            analysis = self.analyzer.analyze_with_retry(posting_text)
        except MatcherOutputError:
            self._show(m.ERR_MATCHER_FAILURE)
            self.failure_exit = True
            return
        self.logger.posting_analyzed(
            context={
                "rubric_version": RUBRIC_VERSION,
                "requirements": len(analysis.requirements),
            }
        )
        actions = assign_actions(analysis, entries)
        self._show(m.MATCH_ACTION_HEADER)
        for action in actions:
            entry = next(e for e in entries if e.id == action.entry_id)
            entry.match_action = action
            self._show(
                m.MATCH_ACTION.format(
                    title=entry.title, action=action.action.value, reason=action.reason
                )
            )
            self.logger.match_action_assigned(
                context={
                    "entry_id": action.entry_id,
                    "action": action.action.value,
                    "requirement_id": action.requirement_id,
                    "rubric_version": RUBRIC_VERSION,
                }
            )
        self._show(m.MATCH_ACTIONS_LEGAL)
        self.repository.save(entries)  # persist the mutated entries (match_action)

    # ------------------------------------------------------------------ #
    # Main loop
    # ------------------------------------------------------------------ #
    def run(self) -> int:
        """Run the interactive session. Returns the exit code."""
        if os.environ.get("PYTHONUTF8") != "1":
            self._show(m.ERR_ENV)
            # Warn and continue; user data is not at risk.
        self.logger.path_start(context={})
        try:
            while True:
                if self.state == SessionState.IDLE:
                    action = self._idle()
                    if action == "exit":
                        break
                elif self.state == SessionState.SCORE_SHOWN:
                    assert self.current_entry is not None
                    entry = self.current_entry
                    if not self._score_and_show(entry):
                        break  # evaluator failure → exit code 2, data intact
                    self._rewrite_round(entry)
                    if entry.draft:
                        # Saved as draft mid-flow → back to IDLE.
                        self.state = SessionState.IDLE
                        self.current_entry = None
                        continue
                    self._merge_warning(entry)
                    if not entry.bullets:
                        self.state = SessionState.IDLE
                        self.current_entry = None
                        continue
                    self._score_shown_menu(entry)
                    self.state = SessionState.IDLE
                    self.current_entry = None
        except KeyboardInterrupt:
            self._show("")
            self._show(m.GOODBYE)
            return 0

        self._show(m.GOODBYE)
        if self.failure_exit:
            return 2  # evaluator/matcher-reported failure; data intact
        return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="JobForward - narrate your experience, match it, improve it"
    )
    parser.parse_args(argv)
    cli = CLI()
    return cli.run()


if __name__ == "__main__":
    sys.exit(main())
