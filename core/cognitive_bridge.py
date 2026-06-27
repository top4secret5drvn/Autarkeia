"""
Архитектурный мост между данными планировщика/биометрики и ядром «Троица».

Модуль не пишет .tri-файлы на диск: база знаний собирается как строка в памяти,
парсится интерпретатором verdict9.py и возвращается как структурированный JSON.
"""

from __future__ import annotations

import os
import sys
import traceback
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

from flask import Blueprint, current_app, jsonify, request

from core.db import Database
from pages.biometric.model import IntakeLog, Measurement, MentalDaily, Substance
from pages.combinations.model import Combination
from pages.completions.completion_habits import CompletionHabits
from pages.completions.model import Completion

# verdict9.py импортирует cognitive_modules как соседний модуль без пакета.
# Поэтому добавляем папку verdict в sys.path до импорта ядра.
_VERDICT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "verdict"))
if _VERDICT_DIR not in sys.path:
    sys.path.append(_VERDICT_DIR)

from verdict9 import KnowledgeBase, abduce, evaluate_predicate, parse_file  # noqa: E402
from cognitive_modules import ConceptFormationEngine  # noqa: E402


cognitive_bp = Blueprint("cognitive", __name__, url_prefix="/api/cognitive")
cognitive_audit_bp = Blueprint("cognitive_audit", __name__, url_prefix="/api/cognitive")


def _entity_value(entity: Any, field_name: str, default: Any = None) -> Any:
    """Безопасно достает поле Entity через ORM-словарь."""
    if entity is None:
        return default
    value = entity[field_name]
    return default if value is None else value


def _first(items: Iterable[Any]) -> Optional[Any]:
    """Возвращает первый элемент ORM-списка или None."""
    for item in items:
        return item
    return None


def _date_to_str(value: Any) -> str:
    """Нормализует ORM date/str в YYYY-MM-DD."""
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _parse_iso_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


class CognitiveBridge:
    """Генерирует .tri-представление дня и запускает логический вывод «Троицы»."""

    def __init__(self, db: Database, date_str: str):
        self.db = db
        self.date_str = date_str

    def analyze_day(self) -> dict:
        """Выгружает день из БД, строит tri_code, запускает MDL и цель."""
        completion, habits, mental, intakes, measurements = self._load_day_bundle(self.date_str)
        tri_code = self._build_tri_code(completion, habits, mental, intakes, measurements)

        kb = KnowledgeBase()
        parse_file(tri_code, kb)

        concept_engine = ConceptFormationEngine(kb)
        concept_engine.analyze_facts(min_support=2, min_confidence=0.6)
        concept_engine.auto_generalize(top_n=2)

        result = evaluate_predicate(kb, "продуктивный_день", ("пользователь",), {})
        if result:
            val, reason = result
            return {
                "date": self.date_str,
                "status": "да" if val == 1 else ("нет" if val == -1 else "нез"),
                "confidence": reason.confidence,
                "complexity": reason.chain_length(),
                "xai_report": reason.generate_xai_report(),
                "mdl_concepts": [c["proposal"] for c in concept_engine.discovered_concepts],
                "facts_count": len(kb.facts),
            }

        return {
            "date": self.date_str,
            "status": "нез",
            "xai_report": "Цель не достигнута.",
            "mdl_concepts": [c["proposal"] for c in concept_engine.discovered_concepts],
            "facts_count": len(kb.facts),
        }

    def discover_synergies(self, days: int = 30) -> list[dict]:
        """Ищет MDL-синергии между привычками, веществами и высоким фокусом за N дней."""
        start_date = _parse_iso_date(self.date_str) - timedelta(days=max(days - 1, 0))
        completions = self._entities_in_range(Completion, start_date, self.date_str)
        mental_by_date = { _date_to_str(m["date"]): m for m in self._entities_in_range(MentalDaily, start_date, self.date_str) }
        intakes_by_date: dict[str, list[IntakeLog]] = {}
        for intake in self._entities_in_range(IntakeLog, start_date, self.date_str):
            if _entity_value(intake, "taken", False):
                intakes_by_date.setdefault(_date_to_str(intake["date"]), []).append(intake)

        lines: list[str] = []
        pattern_labels: dict[str, str] = {}
        pattern_habit_ids: dict[str, int] = {}
        for completion in completions:
            current_date = _date_to_str(completion["date"])
            day_obj = self._day_object(current_date)
            habits = self.db.list(CompletionHabits, filters={"completion_id": completion.id})
            for habit in habits:
                if not _entity_value(habit, "success", False):
                    continue
                pred = self._predicate_slug("привычка", _entity_value(habit, "name", ""))
                pattern_labels[pred] = _entity_value(habit, "name", pred)
                if _entity_value(habit, "habit_id"):
                    pattern_habit_ids[pred] = int(_entity_value(habit, "habit_id"))
                lines.append(f"факт {pred}({day_obj}) = да причина внешний(planner) [надежность:1.0].")

            for intake in intakes_by_date.get(current_date, []):
                substance = self.db.get(Substance, _entity_value(intake, "substance_id"))
                if not substance:
                    continue
                substance_name = _entity_value(substance, "name", "")
                pred = self._predicate_slug("вещество", substance_name)
                pattern_labels[pred] = substance_name
                lines.append(f"факт {pred}({day_obj}) = да причина внешний(biometric) [надежность:1.0].")

            mental = mental_by_date.get(current_date)
            if mental and _entity_value(mental, "focus") is not None and _entity_value(mental, "focus") >= 8:
                lines.append(f"факт высокий_фокус({day_obj}) = да причина внешний(biometric) [надежность:0.9].")

        if not lines:
            return []

        kb = KnowledgeBase()
        parse_file("\n".join(lines), kb)
        concept_engine = ConceptFormationEngine(kb)
        concept_engine.analyze_facts(min_support=2, min_confidence=0.6)
        concept_engine.auto_generalize(top_n=2)

        synergies: list[dict] = []
        for idx, concept in enumerate(concept_engine.discovered_concepts):
            raw_pattern = list(concept.get("pattern", []))
            if concept.get("consequent") != "высокий_фокус" or "высокий_фокус" in raw_pattern:
                continue
            pattern = [pattern_labels.get(p, p) for p in raw_pattern]
            habit_ids = [pattern_habit_ids[p] for p in raw_pattern if p in pattern_habit_ids]
            synergies.append({
                "id": f"synergy-{idx}",
                "type": "synergy",
                "pattern": pattern,
                "consequent": concept.get("consequent"),
                "support": concept.get("support", 0),
                "confidence": concept.get("confidence", 0),
                "proposal": concept.get("proposal", ""),
                "objects": concept.get("objects", []),
                "habit_ids": habit_ids,
            })
        return synergies

    def generate_hypotheses(self, date_str: Optional[str] = None) -> list[dict]:
        """Выдвигает абдуктивные гипотезы для плохого дня."""
        target_date = date_str or self.date_str
        completion, habits, mental, intakes, measurements = self._load_day_bundle(target_date)
        if not self._is_bad_day(completion, habits, mental):
            return []

        day_obj = self._day_object(target_date)
        tri_code = "\n".join([
            self._build_tri_code(completion, habits, mental, intakes, measurements),
            f"правило плохой_день(X) :- пропуск_завтрака(X) = да причина правило(abduction_breakfast).",
            f"правило плохой_день(X) :- плохой_сон(X) = да причина правило(abduction_sleep).",
            f"правило плохой_день(X) :- перегрузка(X) = да причина правило(abduction_load).",
        ])

        kb = KnowledgeBase()
        parse_file(tri_code, kb)
        abduce(kb, "плохой_день", (day_obj,))

        hypotheses: list[dict] = []
        questions = {
            "пропуск_завтрака": "Вы сегодня не позавтракали?",
            "плохой_сон": "Сегодня был плохой или короткий сон?",
            "перегрузка": "День был перегружен задачами или стрессом?",
        }
        for key, beliefs in kb.revision_engine.beliefs.items():
            for belief in beliefs:
                reason = belief.reason
                if getattr(reason, "kind", "") != "абдукция":
                    continue
                missing_fact = reason.name.replace("гипотеза_", "", 1)
                hypotheses.append({
                    "id": f"{target_date}:{missing_fact}",
                    "type": "hypothesis",
                    "missing_fact": missing_fact,
                    "question": questions.get(missing_fact, f"Подтвердить гипотезу: {missing_fact}?"),
                    "confidence": getattr(reason, "confidence", 0.5),
                    "fact_key": key,
                })
        return hypotheses

    def check_streak_protection(self, date_str: Optional[str] = None, habit_name: Optional[str] = None) -> bool:
        """Возвращает True, если болезнь защищает стрик невыполненной привычки."""
        target_date = date_str or self.date_str
        completion, habits, _mental, _intakes, _measurements = self._load_day_bundle(target_date)
        if not completion or _entity_value(completion, "state") != "SICK":
            return False
        if not habit_name:
            return True
        for habit in habits:
            if _entity_value(habit, "name") == habit_name and not _entity_value(habit, "success", False):
                return True
        return False

    def _load_day_bundle(self, date_str: str):
        completion = _first(self.db.list(Completion, filters={"date": date_str}))
        habits = self.db.list(CompletionHabits, filters={"completion_id": completion.id}) if completion else []
        mental = _first(self.db.list(MentalDaily, filters={"date": date_str}))
        intakes = self.db.list(IntakeLog, filters={"date": date_str, "taken": True})
        measurements = self.db.list(Measurement, filters={"date": date_str})
        return completion, habits, mental, intakes, measurements

    def _entities_in_range(self, entity_cls, start_date: date, end_date_str: str) -> list[Any]:
        end_date = _parse_iso_date(end_date_str)
        entities = self.db.list(entity_cls)
        return [
            entity for entity in entities
            if entity["date"] is not None and start_date <= _parse_iso_date(_date_to_str(entity["date"])) <= end_date
        ]

    def _is_bad_day(self, completion: Optional[Completion], habits: list[CompletionHabits], mental: Optional[MentalDaily]) -> bool:
        mood = _entity_value(mental, "mood")
        if mood is not None and mood < 4:
            return True
        friction = _entity_value(completion, "friction_index")
        if friction is not None and friction > 7:
            return True
        if habits:
            failed = len([h for h in habits if not _entity_value(h, "success", False)])
            return failed / len(habits) > 0.5
        return False

    def _build_tri_code(
        self,
        completion: Optional[Completion],
        habits: list[CompletionHabits],
        mental: Optional[MentalDaily],
        intakes: list[IntakeLog],
        measurements: list[Measurement],
    ) -> str:
        """Собирает базу знаний «Троицы» как многострочную строку."""
        lines: list[str] = []

        has_successful_habit = False
        for habit in habits:
            name = self._tri_string(_entity_value(habit, "name", ""))
            if _entity_value(habit, "success", False):
                has_successful_habit = True
                lines.append(
                    f'факт выполнено(пользователь, "{name}") = да причина внешний(planner) '
                    f'[надежность:1.0, i:{self._num(habit, "i")}, s:{self._num(habit, "s")}, '
                    f'w:{self._num(habit, "w")}, e:{self._num(habit, "e")}, c:{self._num(habit, "c")}, '
                    f'h:{self._num(habit, "hh")}, st:{self._num(habit, "st")}, '
                    f'money:{self._num(habit, "money")}, контекст:{self.date_str}].'
                )
            else:
                lines.append(
                    f'факт провалено(пользователь, "{name}") = да причина внешний(planner) '
                    f'[надежность:1.0, контекст:{self.date_str}].'
                )

        # verdict9 пока не делает перебор фактов для свободной переменной Y в правиле.
        # Добавляем in-memory existential compatibility fact, чтобы условие
        # выполнено(X, Y) = да могло сработать без записи .tri на диск.
        if has_successful_habit:
            lines.append(
                "факт выполнено(пользователь, Y) = да причина внешний(planner) "
                f"[надежность:1.0, контекст:{self.date_str}]."
            )

        focus = _entity_value(mental, "focus")
        energy = _entity_value(mental, "energy")
        if focus is not None and focus >= 7:
            lines.append(
                f"факт высокий_фокус(пользователь) = да причина внешний(biometric) "
                f"[надежность:0.9, значение:{focus}]."
            )
        if energy is not None and energy >= 7:
            lines.append(
                f"факт высокая_энергия(пользователь) = да причина внешний(biometric) "
                f"[надежность:0.9, значение:{energy}]."
            )

        for intake in intakes:
            substance = self.db.get(Substance, _entity_value(intake, "substance_id"))
            if substance:
                substance_name = self._tri_string(_entity_value(substance, "name", ""))
                lines.append(
                    f'факт принял(пользователь, "{substance_name}") = да причина внешний(biometric) '
                    f"[надежность:1.0]."
                )

        for measurement in measurements:
            weight = _entity_value(measurement, "weight")
            systolic = _entity_value(measurement, "blood_pressure_systolic")
            diastolic = _entity_value(measurement, "blood_pressure_diastolic")
            if weight is not None:
                lines.append(
                    f"факт вес(пользователь) = да причина внешний(biometric) "
                    f"[надежность:0.95, значение:{weight}]."
                )
            if systolic is not None and diastolic is not None and 110 <= systolic <= 130 and 70 <= diastolic <= 85:
                lines.append(
                    "факт давление_норма(пользователь) = да причина внешний(biometric) "
                    "[надежность:0.9]."
                )

        if completion and _entity_value(completion, "state") == "SICK" and focus is not None and energy is not None:
            if focus >= 7 and energy >= 7:
                lines.extend(
                    [
                        "факт симулирует(пользователь) = да причина внешний(самочувствие) "
                        "[надежность:0.4, источник:жалоба_пользователя].",
                        "факт симулирует(пользователь) = нет причина внешний(биометрика) "
                        "[надежность:0.9, источник:объективные_данные].",
                    ]
                )

        lines.append(
            "правило продуктивный_день(X) :- выполнено(X, Y) = да, высокий_фокус(X) = да "
            "причина правило(planner_logic)."
        )
        lines.append(
            "правило ресурсный_день(X) :- высокая_энергия(X) = да, давление_норма(X) = да "
            "причина правило(biometric_logic)."
        )

        return "\n".join(lines)

    @staticmethod
    def _day_object(date_str: str) -> str:
        return "день_" + date_str.replace("-", "_")

    @staticmethod
    def _predicate_slug(prefix: str, value: Any) -> str:
        raw = str(value).lower().strip()
        safe = "".join(ch if ch.isalnum() else "_" for ch in raw).strip("_") or "unknown"
        return f"{prefix}_{safe}"

    @staticmethod
    def _tri_string(value: Any) -> str:
        """Экранирует строковый аргумент для .tri-факта."""
        return str(value).replace("\\", "\\\\").replace('"', '\\"')

    @staticmethod
    def _num(entity: Any, field_name: str) -> float:
        """Возвращает числовое значение метрики привычки, подставляя 0.0 для NULL."""
        value = _entity_value(entity, field_name, 0.0)
        return 0.0 if value is None else value


@cognitive_bp.route("/analyze", methods=["GET"])
def analyze():
    """HTTP endpoint: /api/cognitive/analyze?date=YYYY-MM-DD"""
    date_str = request.args.get("date")
    if not date_str:
        return jsonify({"status": "error", "message": "date required"}), 400

    db = current_app.config.get("COGNITIVE_DB")
    if db is None:
        return jsonify({"status": "error", "message": "cognitive db is not configured"}), 500

    bridge = CognitiveBridge(db, date_str)
    try:
        result = bridge.analyze_day()
        return jsonify({"status": "success", "data": result})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "trace": traceback.format_exc()}), 500


@cognitive_audit_bp.route("/synergies", methods=["GET"])
def synergies():
    days = request.args.get("days", "30")
    date_str = request.args.get("date") or date.today().isoformat()
    try:
        result = CognitiveBridge(_get_db(), date_str).discover_synergies(days=int(days))
        return jsonify({"status": "success", "data": result})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "trace": traceback.format_exc()}), 500


@cognitive_audit_bp.route("/hypotheses", methods=["GET"])
def hypotheses():
    date_str = request.args.get("date")
    if not date_str:
        return jsonify({"status": "error", "message": "date required"}), 400
    try:
        result = CognitiveBridge(_get_db(), date_str).generate_hypotheses(date_str)
        return jsonify({"status": "success", "data": result})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "trace": traceback.format_exc()}), 500


@cognitive_audit_bp.route("/streak_protection", methods=["GET"])
def streak_protection():
    date_str = request.args.get("date")
    if not date_str:
        return jsonify({"status": "error", "message": "date required"}), 400
    habit_name = request.args.get("habit_name")
    try:
        protected = CognitiveBridge(_get_db(), date_str).check_streak_protection(date_str, habit_name)
        return jsonify({"status": "success", "data": {"streak_protected": protected}})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "trace": traceback.format_exc()}), 500


@cognitive_audit_bp.route("/confirm_hypothesis", methods=["POST"])
def confirm_hypothesis():
    payload = request.json or {}
    return jsonify({
        "status": "success",
        "data": {
            "hypothesis_id": payload.get("hypothesis_id"),
            "confirmed": bool(payload.get("confirmed")),
            "message": "Гипотеза отмечена; постоянная запись правил не создается без новой таблицы.",
        },
    })


@cognitive_audit_bp.route("/apply_synergy", methods=["POST"])
def apply_synergy():
    payload = request.json or {}
    habit_ids = payload.get("habit_ids") or []
    if len(habit_ids) < 2:
        return jsonify({"status": "error", "message": "habit_ids with at least two ids required"}), 400
    try:
        combo = Combination(
            name=payload.get("name") or payload.get("proposal") or "MDL synergy",
            habit_a=int(habit_ids[0]),
            habit_b=int(habit_ids[1]),
            i=float(payload.get("i", 0.0) or 0.0),
        )
        _get_db().insert(combo)
        return jsonify({"status": "success", "data": combo.to_dict()})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "trace": traceback.format_exc()}), 500


def _get_db() -> Database:
    db = current_app.config.get("COGNITIVE_DB")
    if db is None:
        raise RuntimeError("cognitive db is not configured")
    return db


def register_cognitive(app, db: Database):
    """Регистрирует cognitive blueprints и передает им ORM Database через config."""
    app.config["COGNITIVE_DB"] = db
    app.register_blueprint(cognitive_bp)
    app.register_blueprint(cognitive_audit_bp)
