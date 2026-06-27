"""
Архитектурный мост между данными планировщика/биометрики и ядром «Троица».

Модуль не пишет .tri-файлы на диск: база знаний собирается как строка в памяти,
парсится интерпретатором verdict9.py и возвращается как структурированный JSON.
"""

from __future__ import annotations

import os
import sys
import traceback
from typing import Any, Iterable, Optional

from flask import Blueprint, current_app, jsonify, request

from core.db import Database
from pages.biometric.model import IntakeLog, Measurement, MentalDaily, Substance
from pages.completions.completion_habits import CompletionHabits
from pages.completions.model import Completion

# verdict9.py импортирует cognitive_modules как соседний модуль без пакета.
# Поэтому добавляем папку verdict в sys.path до импорта ядра.
_VERDICT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "verdict"))
if _VERDICT_DIR not in sys.path:
    sys.path.append(_VERDICT_DIR)

from verdict9 import KnowledgeBase, evaluate_predicate, parse_file  # noqa: E402
from cognitive_modules import ConceptFormationEngine  # noqa: E402


cognitive_bp = Blueprint("cognitive", __name__, url_prefix="/api/cognitive")


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


class CognitiveBridge:
    """Генерирует .tri-представление дня и запускает логический вывод «Троицы»."""

    def __init__(self, db: Database, date_str: str):
        self.db = db
        self.date_str = date_str

    def analyze_day(self) -> dict:
        """Выгружает день из БД, строит tri_code, запускает MDL и цель."""
        completion = _first(self.db.list(Completion, filters={"date": self.date_str}))
        habits = []
        if completion:
            habits = self.db.list(CompletionHabits, filters={"completion_id": completion.id})

        mental = _first(self.db.list(MentalDaily, filters={"date": self.date_str}))
        intakes = self.db.list(IntakeLog, filters={"date": self.date_str, "taken": True})
        measurements = self.db.list(Measurement, filters={"date": self.date_str})

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


def register_cognitive(app, db: Database):
    """Регистрирует cognitive blueprint и передает ему ORM Database через config."""
    app.config["COGNITIVE_DB"] = db
    app.register_blueprint(cognitive_bp)
