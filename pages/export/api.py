# pages/export/api.py
"""API для экспорта статистики за период"""

from flask import Blueprint, request, jsonify, send_file
from datetime import datetime, timedelta, date
import io
import json

def register_export_api(app, db):
    bp = Blueprint('export_api', __name__, url_prefix='/api/export')
    
    @bp.route('/stats', methods=['POST'])
    def export_stats():
        """Экспорт статистики за период в текстовый файл"""
        data = request.json or {}
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({'status': 'error', 'message': 'Укажите начальную и конечную дату'}), 400
        
        # Генерируем отчет
        report = generate_period_report(db, start_date, end_date)
        
        # Создаем файл
        filename = f"statistics_{start_date}_{end_date}.txt"
        
        return send_file(
            io.BytesIO(report.encode('utf-8')),
            mimetype='text/plain',
            as_attachment=True,
            download_name=filename
        )
    
    @bp.route('/preview', methods=['POST'])
    def preview_stats():
        """Предпросмотр статистики за период"""
        data = request.json or {}
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({'status': 'error', 'message': 'Укажите начальную и конечную дату'}), 400
        
        report = generate_period_report(db, start_date, end_date)
        return jsonify({'status': 'success', 'report': report})
    
    app.register_blueprint(bp)


def row_to_dict(row):
    """Преобразует sqlite3.Row в dict"""
    if row is None:
        return {}
    return {key: row[key] for key in row.keys()}


def get_progress_for_period(db, goal, end_date_str):
    """Получение прогресса по цели на конец периода"""
    target_key = goal.get('target_key', '')
    start = goal.get('start_date', '')
    end = min(goal.get('end_date', ''), end_date_str)
    
    # Разбор target_key: habit:123, activity:бег и т.д.
    if ':' not in target_key:
        return 0
    
    entity_type, entity_id = target_key.split(':', 1)
    
    if goal.get('type') == 'habit_count':
        rows = db.query("""
            SELECT COUNT(*) as cnt
            FROM completion_habits ch
            JOIN completions c ON c.id = ch.completion_id
            WHERE ch.habit_id = ? AND ch.success = 1
              AND c.date BETWEEN ? AND ?
        """, (int(entity_id), start, end))
        return rows[0]['cnt'] if rows else 0
    
    elif goal.get('type') == 'habit_streak':
        rows = db.query("""
            SELECT c.date, ch.success
            FROM completion_habits ch
            JOIN completions c ON c.id = ch.completion_id
            WHERE ch.habit_id = ?
              AND c.date BETWEEN ? AND ?
            ORDER BY c.date ASC
        """, (int(entity_id), start, end))
        
        streak = 0
        max_streak = 0
        for row in rows:
            if row['success']:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0
        return max_streak
    
    elif goal.get('type') == 'activity_count':
        rows = db.query("""
            SELECT SUM(quantity) as total
            FROM biometric_physical_activity
            WHERE activity_type = ? AND date BETWEEN ? AND ?
        """, (entity_id, start, end))
        return rows[0]['total'] if rows and rows[0]['total'] else 0
    
    elif goal.get('type') == 'substance_count':
        rows = db.query("""
            SELECT COUNT(DISTINCT date) as days
            FROM biometric_intake_log
            WHERE substance_id = ? AND taken = 1 AND date BETWEEN ? AND ?
        """, (int(entity_id), start, end))
        return rows[0]['days'] if rows and rows[0]['days'] else 0
    
    return 0


def generate_period_report(db, start_date_str, end_date_str):
    """Генерация отчета за период"""
    start = datetime.strptime(start_date_str, '%Y-%m-%d').date()
    end = datetime.strptime(end_date_str, '%Y-%m-%d').date()
    
    report_lines = []
    report_lines.append("=" * 70)
    report_lines.append(f"📊 ОТЧЕТ ПО ДИСЦИПЛИНЕ ЗА ПЕРИОД: {start_date_str} — {end_date_str}")
    report_lines.append("=" * 70)
    report_lines.append("")
    
    # 1. ОБЩАЯ СТАТИСТИКА ПО ДНЯМ
    report_lines.append("📅 1. ОБЩАЯ СТАТИСТИКА ДНЕЙ")
    report_lines.append("-" * 50)
    
    completions_rows = db.query(
        "SELECT * FROM completions WHERE date BETWEEN ? AND ? ORDER BY date",
        (start_date_str, end_date_str)
    )
    
    # Конвертируем строки в словари
    completions = [row_to_dict(row) for row in completions_rows]
    
    days_count = len(completions)
    report_lines.append(f"Всего дней в периоде: {days_count}")
    
    if completions:
        # Состояния дней
        state_counts = {"WORK": 0, "VAC": 0, "SICK": 0, "OTHER": 0}
        for c in completions:
            state = c.get('state') or 'WORK'
            if state in state_counts:
                state_counts[state] += 1
        
        report_lines.append(f"  • Рабочих дней (WORK): {state_counts['WORK']}")
        report_lines.append(f"  • Выходных (VAC): {state_counts['VAC']}")
        report_lines.append(f"  • Больничных (SICK): {state_counts['SICK']}")
        report_lines.append(f"  • Других (OTHER): {state_counts['OTHER']}")
        
        # Суммарные характеристики
        total_i = 0.0
        total_s = 0.0
        total_w = 0.0
        total_e = 0.0
        total_c = 0.0
        total_h = 0.0
        total_st = 0.0
        total_money = 0.0
        
        for c in completions:
            totals = c.get('totals')
            if totals and isinstance(totals, str):
                try:
                    totals = json.loads(totals)
                except:
                    totals = {}
            elif not totals:
                totals = {}
            
            total_i += float(totals.get('I', 0))
            total_s += float(totals.get('S', 0))
            total_w += float(totals.get('W', 0))
            total_e += float(totals.get('E', 0))
            total_c += float(totals.get('C', 0))
            total_h += float(totals.get('H', 0))
            total_st += float(totals.get('ST', 0))
            total_money += float(totals.get('$', 0))
        
        report_lines.append("")
        report_lines.append("📈 Суммарные характеристики за период:")
        report_lines.append(f"  • Интеллект (I): {total_i:.2f}")
        report_lines.append(f"  • Сила (S): {total_s:.2f}")
        report_lines.append(f"  • Выносливость (W): {total_w:.2f}")
        report_lines.append(f"  • Эмоции (E): {total_e:.2f}")
        report_lines.append(f"  • Харизма (C): {total_c:.2f}")
        report_lines.append(f"  • Здоровье (H): {total_h:.2f}")
        report_lines.append(f"  • Стабильность (ST): {total_st:.2f}")
        report_lines.append(f"  • Деньги ($): {total_money:.2f}")
    else:
        report_lines.append("  ❌ Нет данных за указанный период")
    
    report_lines.append("")
    
    # 2. СТАТИСТИКА ПРИВЫЧЕК
    report_lines.append("✅ 2. ВЫПОЛНЕНИЕ ПРИВЫЧЕК")
    report_lines.append("-" * 50)
    
    habits_stats_rows = db.query("""
        SELECT 
            h.name as habit_name,
            h.category,
            COUNT(CASE WHEN ch.success = 1 THEN 1 END) as completed_count,
            COUNT(CASE WHEN ch.success = 0 THEN 1 END) as failed_count,
            SUM(ch.quantity) as total_quantity,
            AVG(CASE WHEN ch.success = 1 THEN ch.i ELSE NULL END) as avg_i,
            AVG(CASE WHEN ch.success = 1 THEN ch.s ELSE NULL END) as avg_s,
            AVG(CASE WHEN ch.success = 1 THEN ch.w ELSE NULL END) as avg_w,
            AVG(CASE WHEN ch.success = 1 THEN ch.e ELSE NULL END) as avg_e,
            AVG(CASE WHEN ch.success = 1 THEN ch.c ELSE NULL END) as avg_c,
            AVG(CASE WHEN ch.success = 1 THEN ch.hh ELSE NULL END) as avg_h,
            AVG(CASE WHEN ch.success = 1 THEN ch.st ELSE NULL END) as avg_st,
            AVG(CASE WHEN ch.success = 1 THEN ch.money ELSE NULL END) as avg_money
        FROM completion_habits ch
        JOIN completions c ON c.id = ch.completion_id
        JOIN habits h ON h.id = ch.habit_id
        WHERE c.date BETWEEN ? AND ?
        GROUP BY h.id, h.name, h.category
        ORDER BY completed_count DESC
    """, (start_date_str, end_date_str))
    
    habits_stats = [row_to_dict(row) for row in habits_stats_rows]
    
    if habits_stats:
        for stat in habits_stats:
            total = stat['completed_count'] + stat['failed_count']
            success_rate = (stat['completed_count'] / total * 100) if total > 0 else 0
            
            report_lines.append(f"\n📌 {stat['habit_name']} [{stat['category']}]")
            report_lines.append(f"   Выполнено: {stat['completed_count']}/{total} ({success_rate:.1f}%)")
            
            if stat.get('total_quantity'):
                report_lines.append(f"   Общее количество: {stat['total_quantity']:.1f}")
            
            # Средние характеристики при выполнении
            if stat.get('avg_i') and stat['avg_i'] > 0:
                report_lines.append(f"   Средние характеристики: I:{stat['avg_i']:.2f} S:{stat['avg_s']:.2f} W:{stat['avg_w']:.2f} E:{stat['avg_e']:.2f} C:{stat['avg_c']:.2f} H:{stat['avg_h']:.2f} ST:{stat['avg_st']:.2f}")
    else:
        report_lines.append("  ❌ Нет данных о привычках за период")
    
    report_lines.append("")
    
    # 3. СТРИКИ (текущие)
    report_lines.append("🔥 3. ТЕКУЩИЕ СТРИКИ")
    report_lines.append("-" * 50)
    
    streaks_rows = db.query("""
        SELECT 
            h.name as habit_name,
            COUNT(*) as current_streak
        FROM completion_habits ch
        JOIN completions c ON c.id = ch.completion_id
        JOIN habits h ON h.id = ch.habit_id
        WHERE ch.success = 1
        GROUP BY h.id, h.name
        ORDER BY current_streak DESC
        LIMIT 10
    """)
    
    streaks = [row_to_dict(row) for row in streaks_rows]
    
    if streaks:
        for s in streaks:
            report_lines.append(f"  • {s['habit_name']}: 🔥{s['current_streak']} дней")
    else:
        report_lines.append("  ❌ Нет активных стриков")
    
    report_lines.append("")
    
    # 4. ЦЕЛИ
    report_lines.append("🎯 4. ПРОГРЕСС ПО ЦЕЛЯМ")
    report_lines.append("-" * 50)
    
    goals_rows = db.query("SELECT * FROM goals ORDER BY end_date")
    goals = [row_to_dict(row) for row in goals_rows]
    
    if goals:
        for goal in goals:
            target_count = goal.get('target_count', 0)
            
            # Получаем текущий прогресс на конец периода
            progress = get_progress_for_period(db, goal, end_date_str)
            
            percent = (progress / target_count * 100) if target_count > 0 else 0
            status = "✅" if progress >= target_count else "🔄"
            
            report_lines.append(f"\n{status} {goal.get('name', 'Без названия')}")
            report_lines.append(f"   Тип: {goal.get('type', '?')}")
            report_lines.append(f"   Цель: {progress}/{target_count} ({percent:.1f}%)")
            report_lines.append(f"   Период: {goal.get('start_date', '?')} — {goal.get('end_date', '?')}")
            if goal.get('description'):
                report_lines.append(f"   Описание: {goal['description']}")
    else:
        report_lines.append("  ❌ Нет активных целей")
    
    report_lines.append("")
    
    # 5. ФИЗИЧЕСКАЯ АКТИВНОСТЬ
    report_lines.append("💪 5. ФИЗИЧЕСКАЯ АКТИВНОСТЬ")
    report_lines.append("-" * 50)
    
    activities_rows = db.query("""
        SELECT 
            activity_type,
            SUM(quantity) as total_quantity,
            AVG(intensity) as avg_intensity,
            COUNT(DISTINCT date) as days_count
        FROM biometric_physical_activity
        WHERE date BETWEEN ? AND ?
        GROUP BY activity_type
        ORDER BY total_quantity DESC
    """, (start_date_str, end_date_str))
    
    activities = [row_to_dict(row) for row in activities_rows]
    
    if activities:
        for act in activities:
            report_lines.append(f"\n🏃 {act['activity_type']}")
            report_lines.append(f"   Всего: {act['total_quantity']} раз")
            if act.get('avg_intensity'):
                report_lines.append(f"   Средняя интенсивность: {act['avg_intensity']:.1f}/10")
            report_lines.append(f"   Дней с активностью: {act['days_count']}")
    else:
        report_lines.append("  ❌ Нет данных о физической активности")
    
    report_lines.append("")
    
    # 6. ВЕЩЕСТВА (витамины, БАДы)
    report_lines.append("💊 6. ПРИЁМ ВЕЩЕСТВ")
    report_lines.append("-" * 50)
    
    substances_rows = db.query("""
        SELECT 
            s.name as substance_name,
            COUNT(CASE WHEN il.taken = 1 THEN 1 END) as taken_count,
            COUNT(CASE WHEN il.taken = 0 THEN 1 END) as missed_count
        FROM biometric_substances s
        LEFT JOIN biometric_intake_log il ON il.substance_id = s.id
        LEFT JOIN completions c ON c.date = il.date
        WHERE (c.date BETWEEN ? AND ?) OR (il.date BETWEEN ? AND ?)
        GROUP BY s.id, s.name
    """, (start_date_str, end_date_str, start_date_str, end_date_str))
    
    substances = [row_to_dict(row) for row in substances_rows]
    
    if substances:
        for sub in substances:
            total = sub['taken_count'] + sub['missed_count']
            rate = (sub['taken_count'] / total * 100) if total > 0 else 0
            status = "✓" if sub['taken_count'] > 0 else "✗"
            report_lines.append(f"  {status} {sub['substance_name']}: {sub['taken_count']}/{total} ({rate:.0f}%)")
    else:
        report_lines.append("  ❌ Нет данных о приёме веществ")
    
    report_lines.append("")
    
    # 7. РАЦИОН (калории)
    report_lines.append("🍽️ 7. РАЦИОН ПИТАНИЯ")
    report_lines.append("-" * 50)
    
    meals_stats_rows = db.query("""
        SELECT 
            meal_type,
            COUNT(*) as count,
            SUM(calories) as total_calories,
            AVG(calories) as avg_calories
        FROM biometric_meals
        WHERE date BETWEEN ? AND ?
        GROUP BY meal_type
    """, (start_date_str, end_date_str))
    
    meals_stats = [row_to_dict(row) for row in meals_stats_rows]
    
    if meals_stats:
        meal_names = {"breakfast": "Завтрак", "lunch": "Обед", "dinner": "Ужин", "snack": "Перекус"}
        total_calories = 0
        for meal in meals_stats:
            name = meal_names.get(meal['meal_type'], meal['meal_type'])
            report_lines.append(f"  • {name}: {meal['count']} раз(а), в среднем {meal['avg_calories']:.0f} ккал")
            total_calories += meal['total_calories'] or 0
        report_lines.append(f"\n  📊 Всего калорий за период: {total_calories:.0f} ккал")
        if days_count > 0:
            report_lines.append(f"  📊 В среднем в день: {total_calories / days_count:.0f} ккал")
    else:
        report_lines.append("  ❌ Нет данных о питании")
    
    report_lines.append("")
    
    # 8. МЕНТАЛЬНЫЕ ПОКАЗАТЕЛИ
    report_lines.append("🧠 8. МЕНТАЛЬНЫЕ ПОКАЗАТЕЛИ")
    report_lines.append("-" * 50)
    
    mental_stats_rows = db.query("""
        SELECT 
            AVG(focus) as avg_focus,
            AVG(attention) as avg_attention,
            AVG(thinking_speed) as avg_thinking_speed,
            AVG(energy) as avg_energy,
            AVG(mood) as avg_mood,
            COUNT(*) as days_count
        FROM biometric_mental_daily
        WHERE date BETWEEN ? AND ?
    """, (start_date_str, end_date_str))
    
    mental_stats = [row_to_dict(row) for row in mental_stats_rows]
    
    if mental_stats and mental_stats[0].get('days_count', 0) > 0:
        ms = mental_stats[0]
        report_lines.append(f"  • Фокус: {ms.get('avg_focus', 0):.1f}/10")
        report_lines.append(f"  • Внимание: {ms.get('avg_attention', 0):.1f}/10")
        report_lines.append(f"  • Быстрота мышления: {ms.get('avg_thinking_speed', 0):.1f}/10")
        report_lines.append(f"  • Энергия: {ms.get('avg_energy', 0):.1f}/10")
        report_lines.append(f"  • Настроение: {ms.get('avg_mood', 0):.1f}/10")
        report_lines.append(f"\n  📊 Заполнено дней: {ms['days_count']}/{days_count}")
    else:
        report_lines.append("  ❌ Нет данных о ментальных показателях")
    
    report_lines.append("")
    
    # 9. ИЗМЕРЕНИЯ (вес, давление и т.д.)
    report_lines.append("📏 9. ФИЗИЧЕСКИЕ ИЗМЕРЕНИЯ")
    report_lines.append("-" * 50)
    
    measurements_rows = db.query("""
        SELECT 
            date,
            weight,
            body_fat_percent,
            muscle_mass,
            heart_rate,
            blood_pressure_systolic,
            blood_pressure_diastolic
        FROM biometric_measurements
        WHERE date BETWEEN ? AND ?
        ORDER BY date
    """, (start_date_str, end_date_str))
    
    measurements = [row_to_dict(row) for row in measurements_rows]
    
    if measurements:
        # Первое и последнее измерение
        first = measurements[0]
        last = measurements[-1]
        
        if first.get('weight') and last.get('weight'):
            weight_change = last['weight'] - first['weight']
            report_lines.append(f"  📊 Вес: {first['weight']:.1f} кг → {last['weight']:.1f} кг ({weight_change:+.1f} кг)")
        
        if first.get('body_fat_percent') and last.get('body_fat_percent'):
            fat_change = last['body_fat_percent'] - first['body_fat_percent']
            report_lines.append(f"  📊 % жира: {first['body_fat_percent']:.1f}% → {last['body_fat_percent']:.1f}% ({fat_change:+.1f}%)")
        
        if first.get('muscle_mass') and last.get('muscle_mass'):
            muscle_change = last['muscle_mass'] - first['muscle_mass']
            report_lines.append(f"  📊 Мышечная масса: {first['muscle_mass']:.1f} кг → {last['muscle_mass']:.1f} кг ({muscle_change:+.1f} кг)")
        
        report_lines.append(f"\n  📊 Всего измерений: {len(measurements)}")
    else:
        report_lines.append("  ❌ Нет данных об измерениях")
    
    report_lines.append("")
    
 # pages/export/api.py (исправленный, блок навыков заменен на SQL-версию)

# ... остальной код остается таким же, меняем только блок навыков ...

    # 10. НАВЫКИ И РАНГИ
    report_lines.append("📚 10. НАВЫКИ И РАНГИ")
    report_lines.append("-" * 50)
    
    try:
        # Получаем навыки напрямую через SQL
        skills_rows = db.query("SELECT id, name, total_minutes, description FROM skills ORDER BY name")
        skills = [row_to_dict(row) for row in skills_rows]
        
        if skills:
            MAX_MINUTES = 600000  # 10000 часов
            level_names = {
                1: "Новичок", 2: "Ученик", 3: "Подмастерье", 4: "Практикант",
                5: "Опытный ученик", 6: "Младший специалист", 7: "Специалист",
                8: "Продвинутый специалист", 9: "Эксперт", 10: "Мастер",
                11: "Профессионал", 12: "Ведущий профессионал", 13: "Эксперт высшего уровня",
                14: "Гуру", 15: "Визионер", 16: "Мастер-наставник", 17: "Элитный эксперт",
                18: "Легенда", 19: "Мастер легенд", 20: "Профессор"
            }
            
            for skill in skills:
                skill_id = skill['id']
                skill_name = skill['name']
                skill_description = skill.get('description', '')
                total_minutes = skill.get('total_minutes', 0) or 0
                total_hours = total_minutes / 60
                
                report_lines.append(f"\n📖 {skill_name}")
                report_lines.append(f"   Всего часов: {total_hours:.1f} ч")
                
                # Расчет уровня
                if total_minutes >= MAX_MINUTES:
                    level = 20
                    level_name = "Профессор"
                    progress = 100.0
                    next_minutes = 0
                else:
                    level = min(20, int((total_minutes / MAX_MINUTES) * 20) + 1)
                    level_name = level_names.get(level, "Мастер")
                    
                    level_min = (level - 1) * (MAX_MINUTES / 20)
                    level_max = level * (MAX_MINUTES / 20)
                    progress = ((total_minutes - level_min) / (level_max - level_min)) * 100 if level_max > level_min else 0
                    next_minutes = level_max - total_minutes
                
                report_lines.append(f"   Уровень: {level} — {level_name}")
                report_lines.append(f"   Прогресс до следующего уровня: {progress:.1f}%")
                if next_minutes > 0:
                    report_lines.append(f"   Осталось минут: {next_minutes:.0f}")
                
                if skill_description:
                    report_lines.append(f"   Описание: {skill_description}")
                
                # Получаем связанные привычки
                try:
                    habit_links_rows = db.query("""
                        SELECT h.name, sh.minutes_per_unit 
                        FROM skill_habits sh
                        JOIN habits h ON h.id = sh.habit_id
                        WHERE sh.skill_id = ?
                    """, (skill_id,))
                    habit_links = [row_to_dict(row) for row in habit_links_rows]
                    
                    if habit_links:
                        report_lines.append("   Связанные привычки:")
                        for link in habit_links:
                            report_lines.append(f"     • {link['name']}: {link['minutes_per_unit']:.1f} мин за единицу")
                except Exception as e:
                    report_lines.append(f"   (Ошибка загрузки привычек: {str(e)})")
        else:
            report_lines.append("  ❌ Нет данных о навыках")
    except Exception as e:
        report_lines.append(f"  ❌ Ошибка загрузки навыков: {str(e)}")
    
    report_lines.append("")
    
    # 11. ФИНАНСЫ
    report_lines.append("💰 11. ФИНАНСОВАЯ СТАТИСТИКА")
    report_lines.append("-" * 50)
    
    try:
        finance_stats_rows = db.query("""
            SELECT 
                c.type as category_type,
                c.is_active,
                SUM(t.amount) as total_amount,
                COUNT(*) as transactions_count
            FROM finance_transactions t
            JOIN finance_categories c ON c.id = t.category_id
            WHERE t.date BETWEEN ? AND ?
            GROUP BY c.type, c.is_active
        """, (start_date_str, end_date_str))
        
        finance_stats = [row_to_dict(row) for row in finance_stats_rows]
    except:
        finance_stats = []
    
    if finance_stats:
        total_income = 0
        total_expense = 0
        active_income = 0
        passive_income = 0
        
        for stat in finance_stats:
            if stat['category_type'] == 'income':
                total_income += stat['total_amount'] or 0
                if stat.get('is_active'):
                    active_income += stat['total_amount'] or 0
                else:
                    passive_income += stat['total_amount'] or 0
            else:
                total_expense += stat['total_amount'] or 0
        
        report_lines.append(f"  📈 Доходы: {total_income:.2f}")
        report_lines.append(f"     • Активный доход: {active_income:.2f}")
        report_lines.append(f"     • Пассивный доход: {passive_income:.2f}")
        report_lines.append(f"  📉 Расходы: {total_expense:.2f}")
        report_lines.append(f"  💵 Чистая прибыль: {total_income - total_expense:.2f}")
        
        if total_income > 0:
            savings_rate = (total_income - total_expense) / total_income * 100
            report_lines.append(f"  📊 Норма сбережения: {savings_rate:.1f}%")
    else:
        report_lines.append("  ❌ Нет данных о финансах")
    
    report_lines.append("")
    
    # 12. ЗАМЕТКИ И МЫСЛИ ЗА ПЕРИОД
    report_lines.append("💭 12. ЗАМЕТКИ ЗА ПЕРИОД")
    report_lines.append("-" * 50)
    
    thoughts_rows = db.query("""
        SELECT date, thoughts 
        FROM completions 
        WHERE date BETWEEN ? AND ? AND thoughts IS NOT NULL AND thoughts != ''
        ORDER BY date
    """, (start_date_str, end_date_str))
    
    thoughts = [row_to_dict(row) for row in thoughts_rows]
    
    if thoughts:
        for t in thoughts:
            report_lines.append(f"\n📅 {t['date']}:")
            thought_text = t.get('thoughts', '')
            if len(thought_text) > 200:
                thought_text = thought_text[:200] + '...'
            report_lines.append(f"   {thought_text}")
    else:
        report_lines.append("  ❌ Нет заметок за период")
    
    report_lines.append("")
    report_lines.append("=" * 70)
    report_lines.append(f"📅 Отчёт сгенерирован: {date.today().isoformat()}")
    report_lines.append("=" * 70)
    
    return "\n".join(report_lines)