import importlib

import pytest

import verdict9
from cognitive_modules import ConceptFormationEngine


def test_verdict9_imports():
    assert importlib.import_module("verdict9") is verdict9


def test_parse_fact_and_evaluate_direct_predicate():
    kb = verdict9.KnowledgeBase()
    verdict9.parse_file("факт симптом(иван) = да причина факт.", kb)

    value, reason = verdict9.evaluate_predicate(kb, "симптом", ("иван",), {})

    assert value == verdict9.TRITS["да"]
    assert reason.kind == "факт"


def test_external_reason_name_is_preserved():
    kb = verdict9.KnowledgeBase()
    verdict9.parse_file("факт болен(иван) = да причина внешний(мрт).", kb)

    value, reason = verdict9.evaluate_predicate(kb, "болен", ("иван",), {})

    assert value == verdict9.TRITS["да"]
    assert reason.kind == "внешний"
    assert reason.name == "мрт"


def test_invalid_trit_raises_value_error():
    kb = verdict9.KnowledgeBase()

    with pytest.raises(ValueError, match="Недопустимое трит-значение 'вирус'"):
        verdict9.parse_file("факт диагноз(иван) = вирус причина факт.", kb)


def test_belief_revision_prefers_higher_confidence_conflict():
    kb = verdict9.KnowledgeBase()
    verdict9.parse_file(
        """
        факт диагноз(иван) = да причина внешний(рентген) [confidence:0.95, источник:МРТ].
        факт диагноз(иван) = нет причина внешний(опрос) [confidence:0.40, источник:опрос].
        """,
        kb,
    )

    value, reason = verdict9.evaluate_predicate(kb, "диагноз", ("иван",), {})

    assert value == verdict9.TRITS["да"]
    assert reason.name == "рентген"
    beliefs = kb.revision_engine.beliefs["диагноз(иван)"]
    defeated = [belief for belief in beliefs if belief.status == "defeated"]
    assert len(defeated) == 1
    assert defeated[0].value == verdict9.TRITS["нет"]


def test_concept_formation_generates_rule_for_consequent():
    kb = verdict9.KnowledgeBase()
    verdict9.parse_file(
        """
        факт симптом(иван) = да причина факт.
        факт температура(иван) = да причина факт.
        факт грипп(иван) = да причина факт.
        факт симптом(мария) = да причина факт.
        факт температура(мария) = да причина факт.
        факт грипп(мария) = да причина факт.
        факт симптом(олег) = да причина факт.
        факт температура(олег) = да причина факт.
        """,
        kb,
    )
    engine = ConceptFormationEngine(kb)
    engine.analyze_facts(min_support=2, min_confidence=0.5)
    engine.auto_generalize(top_n=1)

    generated_rule = next(rule for rule in kb.rules if rule.name == "грипп")
    assert generated_rule.reason.name == "mdl_concept"
    value, reason = verdict9.evaluate_predicate(kb, "грипп", ("олег",), {})
    assert value == verdict9.TRITS["да"]
    assert reason.name == "mdl_concept"


def test_abduction_prints_resolved_args_without_tuple_repr(capsys):
    kb = verdict9.KnowledgeBase()
    verdict9.parse_file(
        """
        правило мокрый(X) :- дождь(X) = да причина правило(после_дождя).
        """,
        kb,
    )

    verdict9.abduce(kb, "мокрый", ("асфальт",))

    captured = capsys.readouterr()
    assert "[АБДУКЦИЯ] Выдвинута гипотеза: дождь(асфальт) = да" in captured.out
    assert "(('асфальт',))" not in captured.out
