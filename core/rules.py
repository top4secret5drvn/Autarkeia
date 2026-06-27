"""
Простая экспертная система на основе правил.
"""

class RuleEngine:
    def __init__(self):
        self.rules = []

    def add_rule(self, condition, action):
        """Добавляет правило.
        condition – функция, принимающая факты (dict) и возвращающая bool.
        action – функция, выполняющая действие при срабатывании правила.
        """
        self.rules.append((condition, action))

    def add_rule_string(self, rule_str):
        """Добавляет правило из строки формата: IF условие THEN действие.
        Условие может содержать операторы ==, !=, >, <, >=, <=, and/or.
        Действие – произвольный Python-код, который выполняется в контексте фактов.
        """
        import re
        parts = re.split(r'\s+THEN\s+', rule_str, flags=re.IGNORECASE)
        if len(parts) != 2:
            raise ValueError("Rule must be in format: IF condition THEN action")
        cond_str, action_str = parts
        cond_str = cond_str.replace('IF', '').strip()
        # компилируем условие в функцию
        def condition(facts):
            # безопасное выполнение с доступом к facts
            try:
                return eval(cond_str, {"__builtins__": None}, facts)
            except:
                return False
        def action(facts):
            # выполняем действие в том же контексте
            exec(action_str, {"__builtins__": None}, facts)
        self.rules.append((condition, action))

    def infer(self, facts):
        """Запускает все правила, которые срабатывают на фактах.
        Факты могут изменяться внутри действий.
        Возвращает изменённые факты.
        """
        changed = True
        while changed:
            changed = False
            for cond, act in self.rules:
                if cond(facts):
                    act(facts)
                    changed = True
        return facts