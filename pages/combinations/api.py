"""API для управления сочетаниями и связями между модулями."""
from flask import Blueprint, request, jsonify
from core.db import Database

def register_combinations_api(app, db: Database):
    """
    API для работы со сложными сочетаниями:
    - Привычка ↔ Привычка (уже есть в Combination)
    - Привычка ↔ Биометрика
    - Привычка ↔ Финансы
    - Автоматические характеристики от биометрики
    """
    
    bp = Blueprint('combinations_api', __name__, url_prefix='/api/combinations')
    
    # ===== ПРИВЫЧКА ↔ БИОМЕТРИКА =====
    @bp.route('/habit-biometric', methods=['GET'])
    def get_habit_biometric_links():
        """Получить все связи привычка ↔ биометрика"""
        try:
            links = db.query(
                "SELECT * FROM habit_biometric_links ORDER BY habit_id, biometric_type"
            )
            return jsonify({'status': 'success', 'data': [dict(link) for link in links]})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @bp.route('/habit-biometric', methods=['POST'])
    def create_habit_biometric_link():
        """Создать связь привычка ↔ биометрика"""
        data = request.json
        try:
            db.execute("""
                INSERT INTO habit_biometric_links 
                (habit_id, biometric_type, biometric_id, biometric_value, bonus_i, bonus_s, bonus_w, 
                bonus_e, bonus_c, bonus_h, bonus_st, bonus_money)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data['habit_id'],
                data['biometric_type'],
                data.get('biometric_id'),
                data.get('biometric_value'),   # новое поле
                data.get('bonus_i', 0),
                data.get('bonus_s', 0),
                data.get('bonus_w', 0),
                data.get('bonus_e', 0),
                data.get('bonus_c', 0),
                data.get('bonus_h', 0),
                data.get('bonus_st', 0),
                data.get('bonus_money', 0),
            ))
            db.commit()
            return jsonify({'status': 'success', 'message': 'created'}), 201
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @bp.route('/habit-biometric/<int:link_id>', methods=['DELETE'])
    def delete_habit_biometric_link(link_id):
        """Удалить связь привычка ↔ биометрика"""
        try:
            db.execute("DELETE FROM habit_biometric_links WHERE id = ?", (link_id,))
            db.commit()
            return jsonify({'status': 'success', 'message': 'deleted'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # ===== ПРИВЫЧКА ↔ ФИНАНСЫ =====
    @bp.route('/habit-finance', methods=['GET'])
    def get_habit_finance_links():
        """Получить все связи привычка ↔ финансы"""
        try:
            links = db.query(
                "SELECT * FROM habit_finance_links ORDER BY habit_id"
            )
            return jsonify({'status': 'success', 'data': [dict(link) for link in links]})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @bp.route('/habit-finance', methods=['POST'])
    def create_habit_finance_link():
        """Создать связь привычка ↔ финансы"""
        data = request.json
        try:
            db.execute("""
                INSERT INTO habit_finance_links 
                (habit_id, finance_type, category_id, threshold, bonus_i, bonus_s, 
                 bonus_w, bonus_e, bonus_c, bonus_h, bonus_st, bonus_money)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data['habit_id'],
                data['finance_type'],  # 'income_active', 'income_passive', 'expense'
                data.get('category_id'),
                data.get('threshold', 0),  # минимальная сумма для срабатывания
                data.get('bonus_i', 0),
                data.get('bonus_s', 0),
                data.get('bonus_w', 0),
                data.get('bonus_e', 0),
                data.get('bonus_c', 0),
                data.get('bonus_h', 0),
                data.get('bonus_st', 0),
                data.get('bonus_money', 0),
            ))
            db.commit()
            return jsonify({'status': 'success', 'message': 'created'}), 201
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @bp.route('/habit-finance/<int:link_id>', methods=['DELETE'])
    def delete_habit_finance_link(link_id):
        """Удалить связь привычка ↔ финансы"""
        try:
            db.execute("DELETE FROM habit_finance_links WHERE id = ?", (link_id,))
            db.commit()
            return jsonify({'status': 'success', 'message': 'deleted'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # ===== АВТОМАТИЧЕСКИЕ ХАРАКТЕРИСТИКИ ОТ БИОМЕТРИКИ =====
    @bp.route('/biometric-characteristics', methods=['GET'])
    def get_biometric_characteristics():
        """Получить все настройки автоматических характеристик от биометрики"""
        try:
            chars = db.query(
                "SELECT * FROM biometric_characteristics ORDER BY biometric_type, biometric_id"
            )
            return jsonify({'status': 'success', 'data': [dict(c) for c in chars]})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @bp.route('/biometric-characteristics', methods=['POST'])
    def create_biometric_characteristic():
        """Создать правило автоматического начисления характеристик"""
        data = request.json
        try:
            db.execute("""
                INSERT INTO biometric_characteristics 
                (biometric_type, biometric_id, bonus_i, bonus_s, bonus_w, 
                 bonus_e, bonus_c, bonus_h, bonus_st, bonus_money, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data['biometric_type'],
                data.get('biometric_id'),
                data.get('bonus_i', 0),
                data.get('bonus_s', 0),
                data.get('bonus_w', 0),
                data.get('bonus_e', 0),
                data.get('bonus_c', 0),
                data.get('bonus_h', 0),
                data.get('bonus_st', 0),
                data.get('bonus_money', 0),
                data.get('description', ''),
            ))
            db.commit()
            return jsonify({'status': 'success', 'message': 'created'}), 201
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @bp.route('/biometric-characteristics/<int:char_id>', methods=['DELETE'])
    def delete_biometric_characteristic(char_id):
        """Удалить правило автоматического начисления"""
        try:
            db.execute("DELETE FROM biometric_characteristics WHERE id = ?", (char_id,))
            db.commit()
            return jsonify({'status': 'success', 'message': 'deleted'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # ===== РАСЧЁТЫ =====
    @bp.route('/calculate-bonuses/<int:habit_id>/<date_str>', methods=['GET'])
    def calculate_bonuses_for_habit(habit_id, date_str):
        """
        Рассчитать все бонусы для привычки на конкретную дату
        на основе связей с биометрикой и финансами
        """
        try:
            bonuses = {
                'habit': {'i': 0, 's': 0, 'w': 0, 'e': 0, 'c': 0, 'h': 0, 'st': 0, 'money': 0},
                'biometric': {'i': 0, 's': 0, 'w': 0, 'e': 0, 'c': 0, 'h': 0, 'st': 0, 'money': 0},
                'finance': {'i': 0, 's': 0, 'w': 0, 'e': 0, 'c': 0, 'h': 0, 'st': 0, 'money': 0},
            }

            # Получить связи привычка-биометрика
            biometric_links = db.query(
                "SELECT * FROM habit_biometric_links WHERE habit_id = ?",
                (habit_id,)
            )

            for link in biometric_links:
                # Определяем, есть ли запись в биометрике за эту дату
                found = False
                btype = link['biometric_type']

                if btype == 'activity':
                    # Запрос для активности
                    if link['biometric_id'] is not None:
                        # Конкретная запись по ID
                        rows = db.query(
                            "SELECT id FROM biometric_physical_activity WHERE id = ? AND date = ?",
                            (link['biometric_id'], date_str)
                        )
                        found = len(rows) > 0
                    elif link['biometric_value'] is not None:
                        # Конкретный тип активности (например, 'отжимания')
                        rows = db.query(
                            "SELECT id FROM biometric_physical_activity WHERE activity_type = ? AND date = ?",
                            (link['biometric_value'], date_str)
                        )
                        found = len(rows) > 0
                    else:
                        # Любая активность
                        rows = db.query(
                            "SELECT id FROM biometric_physical_activity WHERE date = ?",
                            (date_str,)
                        )
                        found = len(rows) > 0

                elif btype == 'substance':
                    # Вещества
                    if link['biometric_id'] is not None:
                        rows = db.query(
                            "SELECT id FROM biometric_intake_log WHERE substance_id = ? AND date = ? AND taken = 1",
                            (link['biometric_id'], date_str)
                        )
                        found = len(rows) > 0
                    else:
                        # любое принятое вещество
                        rows = db.query(
                            "SELECT id FROM biometric_intake_log WHERE date = ? AND taken = 1",
                            (date_str,)
                        )
                        found = len(rows) > 0

                elif btype == 'meal':
                    # Приём пищи
                    if link['biometric_id'] is not None:
                        rows = db.query(
                            "SELECT id FROM biometric_meals WHERE id = ? AND date = ?",
                            (link['biometric_id'], date_str)
                        )
                        found = len(rows) > 0
                    else:
                        rows = db.query(
                            "SELECT id FROM biometric_meals WHERE date = ?",
                            (date_str,)
                        )
                        found = len(rows) > 0

                elif btype == 'measurement':
                    # Измерение
                    if link['biometric_id'] is not None:
                        rows = db.query(
                            "SELECT id FROM biometric_measurements WHERE id = ? AND date = ?",
                            (link['biometric_id'], date_str)
                        )
                        found = len(rows) > 0
                    else:
                        rows = db.query(
                            "SELECT id FROM biometric_measurements WHERE date = ?",
                            (date_str,)
                        )
                        found = len(rows) > 0

                # Если запись найдена – добавляем бонусы
                if found:
                    bonuses['biometric']['i'] += link['bonus_i']
                    bonuses['biometric']['s'] += link['bonus_s']
                    bonuses['biometric']['w'] += link['bonus_w']
                    bonuses['biometric']['e'] += link['bonus_e']
                    bonuses['biometric']['c'] += link['bonus_c']
                    bonuses['biometric']['h'] += link['bonus_h']
                    bonuses['biometric']['st'] += link['bonus_st']
                    bonuses['biometric']['money'] += link['bonus_money']

            # Получить связи привычка-финансы
            finance_links = db.query(
                "SELECT * FROM habit_finance_links WHERE habit_id = ?",
                (habit_id,)
            )
            for link in finance_links:
                # Проверить транзакции за эту дату
                # TODO: проверка сумм и типов
                bonuses['finance']['i'] += link['bonus_i']
                bonuses['finance']['s'] += link['bonus_s']
                bonuses['finance']['w'] += link['bonus_w']
                bonuses['finance']['e'] += link['bonus_e']
                bonuses['finance']['c'] += link['bonus_c']
                bonuses['finance']['h'] += link['bonus_h']
                bonuses['finance']['st'] += link['bonus_st']
                bonuses['finance']['money'] += link['bonus_money']

            return jsonify(bonuses)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    app.register_blueprint(bp)