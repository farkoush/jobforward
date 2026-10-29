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
from .matcher2.posting import clean_posting, language_ratio
from .matcher2.hard_skills import extract_hard_skills, looks_like_posting
from .matcher2.soft_skills import (
    TaxonomyError,
    load_taxonomy,
    match_soft_skills,
)
from .matcher2.report import DISPLAY_LIMIT, PRIORITY_LABELS, build_report
from .matcher2.rules_version import MATCHER_RULES_VERSION

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
    ) -> None:
        self.repository = Repository(repository_path)
        self.path_service = PathService(self.repository)
        self.logger = EventLogger(log_path)
        self.evaluator: BulletEvaluator = evaluator or LocalHeuristicAdapter(
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
    # Framework display (spec §5, finalized five-part framework)
    # ------------------------------------------------------------------ #
    def _show_framework(self, entry: ExperienceEntry, bullet: Bullet, n: int) -> None:
        """Render the five-part framework for one bullet (candidate's exact
        words only; missing/vague markers per spec §5)."""
        total = len(entry.bullets)
        ratings = bullet.ratings
        parts = bullet.parts_or_extract()
        self._show(m.FRAMEWORK_HEADER.format(title=entry.title, n=n, total=total))
        self._show(m.FRAMEWORK_ORIGINAL.format(text=bullet.text))
        filled: list[tuple[str, str]] = []
        needs: list[str] = []
        for label, name, words, vague in (
            (m.PART_LABEL_NEED, m.PART_NAME_NEED, parts.user_need,
             ratings is not None and ratings.context < 2),
            (m.PART_LABEL_FEATURE, m.PART_NAME_FEATURE, parts.product_feature,
             False),
            (m.PART_LABEL_ACTION, m.PART_NAME_ACTION, parts.action,
             ratings is not None and ratings.role_action_clarity < 2),
            (m.PART_LABEL_RESULT, m.PART_NAME_RESULT, parts.result,
             ratings is not None and ratings.result < 2),
            (m.PART_LABEL_METRIC, m.PART_NAME_METRIC, parts.metric, False),
        ):
            words = (words or "").strip()
            if not words:
                self._show(m.FRAMEWORK_PART_MISSING.format(label=label))
                needs.append(label)
            elif vague:
                self._show(m.FRAMEWORK_PART_VAGUE.format(label=label, words=words))
                needs.append(label)
            else:
                self._show(m.FRAMEWORK_PART_OK.format(label=label, words=words))
                filled.append((label, words))
        if filled:
            self._show(m.FRAMEWORK_FILLED)
            for label, words in filled:
                self._show(m.FRAMEWORK_FILLED_LINE.format(label=label, words=words))
        if needs:
            self._show(m.FRAMEWORK_NEEDS)
            for label in needs:
                self._show(m.FRAMEWORK_NEEDS_LINE.format(label=label))

    # ------------------------------------------------------------------ #
    # Scoring (US1)
    # ------------------------------------------------------------------ #
    def _score_and_show(self, entry: ExperienceEntry) -> bool:
        """Score all bullets, persist, display. Returns False on evaluator
        failure (exit-code-2 path, data intact)."""
        texts = [b.text for b in entry.bullets]
        parts = []
        for bullet in entry.bullets:
            extracted = bullet.parts_or_extract()
            bullet.user_need = extracted.user_need
            bullet.product_feature = extracted.product_feature
            bullet.action = extracted.action
            bullet.result = extracted.result
            bullet.metric = extracted.metric
            bullet.part_present = extracted.present()
            parts.append(extracted)
        request = BulletRatingRequest(
            texts=texts, rubric_version=RUBRIC_VERSION, parts=parts
        )
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
        """Framework display + gate + 0–5 questions per bullet; proposals on
        explicit approval (finalized spec §§4.1, 5, 6)."""
        for position, bullet in enumerate(list(entry.bullets), start=1):
            if bullet.ratings is None:
                continue
            if not gate_allowed(bullet):
                continue  # one round per bullet per run (FR-009)

            # Step 4: display the framework BEFORE the gate (spec §4.1).
            self._show_framework(entry, bullet, position)

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
            questions = build_questions(
                bullet, bullet.ratings, GateDecision.ACCEPTED, next_round(bullet)
            )
            if not questions:
                # Complete bullet: only a final confirmation (spec §6).
                confirm = self._prompt(m.BULLET_CONFIRM)
                if confirm == "2":
                    self._edit_bullet_flow(entry)
                continue

            answers: dict[QuestionDimension, str] = {}
            for question in questions:
                assert question.dimension is not None
                part_name = {
                    QuestionDimension.CONTEXT: m.PART_NAME_NEED,
                    QuestionDimension.FEATURE: m.PART_NAME_FEATURE,
                    QuestionDimension.ROLE_ACTION_CLARITY: m.PART_NAME_ACTION,
                    QuestionDimension.RESULT: m.PART_NAME_RESULT,
                    QuestionDimension.METRIC: m.PART_NAME_METRIC,
                }[question.dimension]
                self._show(
                    m.ASK_PART_INTRO.format(
                        title=entry.title,
                        n=position,
                        total=len(entry.bullets),
                        part=part_name,
                    )
                )
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
        extracted = bullet.parts_or_extract()
        bullet.user_need = extracted.user_need
        bullet.product_feature = extracted.product_feature
        bullet.action = extracted.action
        bullet.result = extracted.result
        bullet.metric = extracted.metric
        bullet.part_present = extracted.present()
        request = BulletRatingRequest(
            texts=[bullet.text], rubric_version=RUBRIC_VERSION, parts=[extracted]
        )
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
        self._show(m.COPY_NOTICE)

    @staticmethod
    def _bullet(entry: ExperienceEntry, bullet_id: int) -> Optional[Bullet]:
        for bullet in entry.bullets:
            if bullet.id == bullet_id:
                return bullet
        return None

    # ------------------------------------------------------------------ #
    # JD Matcher v1 (specs/002-jd-matcher) — posting-only skill analysis.
    # Supersedes the 001 per-entry matcher output; never touches resumes.
    # ------------------------------------------------------------------ #
    def _match_posting(self) -> None:
        """Staged flow: PASTE → REVIEW → HARD_SKILLS → SOFT_SKILLS → done.

        Cancel returns to PASTE from any stage (result discarded); cancel at
        PASTE exits the flow. Errors (language, length, not-a-posting, zero
        skills, consistency) return to PASTE with their fixed messages and
        are never reported as a mismatch (FR-008/FR-018/FR-019).
        """
        while True:
            self._show(m.MATCH_PROMPT_PASTE)
            lines: list[str] = []
            cancelled_at_paste = False
            while True:
                try:
                    line = self._input(m.PROMPT_CONTINUE)
                except EOFError:
                    break  # end-of-input is an accepted terminator (FR-001)
                stripped = line.strip()
                if not lines and stripped == "C":
                    cancelled_at_paste = True
                    break
                if stripped == "END":
                    break
                lines.append(line.rstrip())
            if cancelled_at_paste:
                self._show(m.MATCH_CANCELLED_EXIT)
                return
            raw = "\n".join(lines)
            self.logger.posting_received(context={"word_count": len(raw.split())})
            if not raw.strip():
                continue

            posting = clean_posting(raw)
            if not posting.language_ok:
                self._show(m.MATCH_ERR_PERSIAN)
                self.logger.posting_rejected_language(
                    context={"ratio": round(language_ratio(posting.cleaned_text), 4)}
                )
                continue
            if posting.word_count < 100:
                self._show(
                    m.MATCH_ERR_TOO_SHORT.format(count=posting.word_count, limit=100)
                )
                self.logger.posting_rejected_length(
                    context={"word_count": posting.word_count, "limit": 100}
                )
                continue
            if posting.word_count > 1500:
                self._show(
                    m.MATCH_ERR_TOO_LONG.format(count=posting.word_count, limit=1500)
                )
                self.logger.posting_rejected_length(
                    context={"word_count": posting.word_count, "limit": 1500}
                )
                continue

            # REVIEW stage: cleaning report + word count + gate.
            self._show_cleaning_report(posting)
            self._show(m.MATCH_WORD_COUNT.format(count=posting.word_count))
            self.logger.posting_cleaned(
                context={
                    "script_blocks": posting.script_blocks_removed,
                    "style_blocks": posting.style_blocks_removed,
                    "html_tags": posting.html_tags_removed,
                    "word_count": posting.word_count,
                }
            )
            if not looks_like_posting(posting.cleaned_text):
                self._show(m.MATCH_ERR_NOT_A_POSTING)
                self.logger.posting_not_a_job(context={})
                continue
            if self._stage_gate("review") == "cancel":
                self._show(m.MATCH_CANCELLED)
                continue

            # HARD_SKILLS stage: extract, guard, render, gate.
            try:
                taxonomy = load_taxonomy()
            except TaxonomyError:
                self._show(m.MATCH_ERR_ZERO_SKILLS)
                self.logger.extraction_failed(context={"reason": "taxonomy"})
                continue
            hard_rows, dropped = extract_hard_skills(posting.cleaned_text)
            soft_rows, unmatched = match_soft_skills(posting.cleaned_text, taxonomy)
            if not hard_rows and not soft_rows:
                self._show(m.MATCH_ERR_ZERO_SKILLS)
                self.logger.extraction_failed(context={})
                continue
            report = build_report(hard_rows, soft_rows, unmatched, dropped)
            if not report.consistency_ok:
                self._show(m.MATCH_ERR_CONSISTENCY)
                self.logger.consistency_failed(
                    context={
                        "expected": {
                            **report.hard_totals,
                            "soft": report.soft_total,
                        },
                        "found": {
                            p: len(rows) for p, rows in report.hard_tables.items()
                        }
                        | {"soft": len(report.soft_rows)},
                    }
                )
                continue
            self._render_hard_tables(report)
            self.logger.posting_analyzed(
                context={
                    "rules_version": MATCHER_RULES_VERSION,
                    "hard_counts": dict(report.hard_totals),
                    "soft_count": report.soft_total,
                }
            )
            if self._stage_gate("hard_skills") == "cancel":
                self._show(m.MATCH_CANCELLED)
                continue

            # SOFT_SKILLS stage: render, final gate, done.
            self._render_soft_table(report)
            if self._stage_gate("soft_skills") == "cancel":
                self._show(m.MATCH_CANCELLED)
                continue
            return  # flow complete → back to the idle menu

    def _show_cleaning_report(self, posting) -> None:
        script = posting.script_blocks_removed
        style = posting.style_blocks_removed
        if script == 1 and style == 0:
            self._show(m.MATCH_CLEAN_SCRIPT_ONE)
        elif script or style:
            self._show(m.MATCH_CLEAN_BLOCKS.format(scripts=script, styles=style))
        if posting.html_tags_removed:
            self._show(m.MATCH_CLEAN_TAGS)

    def _stage_gate(self, stage: str) -> str:
        """`[Y]` advances, `[C]` cancels, anything else re-prompts (FR-008).
        Every transition is logged with a timestamp (FR-023)."""
        while True:
            try:
                answer = self._input(m.MATCH_GATE).strip()
            except EOFError:
                self.logger.stage_cancelled(context={"stage": stage})
                return "cancel"
            if answer in ("Y", "y"):
                self.logger.stage_confirmed(context={"stage": stage})
                return "continue"
            if answer in ("C", "c"):
                self.logger.stage_cancelled(context={"stage": stage})
                return "cancel"
            self._show(m.MATCH_ERR_INVALID_KEY)

    def _render_hard_tables(self, report) -> None:
        for priority in ("must", "should", "nice"):
            rows = report.hard_tables.get(priority, [])
            label = PRIORITY_LABELS[priority]
            self._show(f"{label}:")
            self._show(m.MATCH_TABLE_HARD_HEADER)
            if not rows:
                self._show(m.MATCH_EMPTY_GROUP)
            else:
                for row in report.displayed_hard(priority):
                    type_label = (
                        m.MATCH_TYPE_HARD_TOOL
                        if row.type == "hard_tool"
                        else m.MATCH_TYPE_HARD
                    )
                    if row.default_priority and not row.is_one_of:
                        self._show(
                            m.MATCH_ROW_HARD_DEFAULT.format(
                                skill=row.name, type=type_label, evidence=row.evidence
                            )
                        )
                    else:
                        self._show(
                            m.MATCH_ROW_HARD.format(
                                skill=row.name, type=type_label, evidence=row.evidence
                            )
                        )
                if len(rows) > DISPLAY_LIMIT:
                    self._show(
                        m.MATCH_LIMIT_HARD.format(
                            priority=label, shown=DISPLAY_LIMIT, total=len(rows)
                        )
                    )
        self._show(
            m.MATCH_COUNTS.format(
                must=report.hard_totals.get("must", 0),
                should=report.hard_totals.get("should", 0),
                nice=report.hard_totals.get("nice", 0),
            )
        )
        if report.dropped_count:
            self._show(m.MATCH_DROPPED.format(count=report.dropped_count))

    def _render_soft_table(self, report) -> None:
        self._show(m.MATCH_TABLE_SOFT_HEADER)
        if not report.soft_rows:
            self._show(m.MATCH_EMPTY_GROUP)
        else:
            for row in report.displayed_soft():
                self._show(
                    m.MATCH_ROW_SOFT.format(
                        skill=row.label_en,
                        group=row.group_code,
                        evidence=row.evidence,
                        priority=PRIORITY_LABELS[row.priority],
                        certainty=row.certainty.capitalize(),
                    )
                )
            if len(report.soft_rows) > DISPLAY_LIMIT:
                self._show(
                    m.MATCH_LIMIT_SOFT.format(
                        shown=DISPLAY_LIMIT, total=len(report.soft_rows)
                    )
                )
        for concept in report.unmatched:
            self._show(m.MATCH_NO_TAXONOMY_MATCH.format(text=concept.text))

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
