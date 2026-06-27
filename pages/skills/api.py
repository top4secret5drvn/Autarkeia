from flask import Blueprint, jsonify, request
from core.db import Database

def register_skills_api(app, db: Database):
    bp = Blueprint('skills_api', __name__, url_prefix='/api/skills')

    # ========= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =========
    def get_level_info(total_minutes):
        """Возвращает (уровень, название, минут до следующего уровня, % прогресса)"""
        MAX_MINUTES = 600000  # 10000 часов
        # 20 уровней
        level = min(20, int((total_minutes / MAX_MINUTES) * 20) + 1)
        if total_minutes >= MAX_MINUTES:
            return 20, "Профессор", 0, 100.0

        level_min = (level - 1) * (MAX_MINUTES / 20)
        level_max = level * (MAX_MINUTES / 20)
        progress = ((total_minutes - level_min) / (level_max - level_min)) * 100 if level_max > level_min else 0
        next_minutes = level_max - total_minutes

        level_names = {
            1: "Новичок", 2: "Ученик", 3: "Подмастерье", 4: "Практикант",
            5: "Опытный ученик", 6: "Младший специалист", 7: "Специалист",
            8: "Продвинутый специалист", 9: "Эксперт", 10: "Мастер",
            11: "Профессионал", 12: "Ведущий профессионал", 13: "Эксперт высшего уровня",
            14: "Гуру", 15: "Визионер", 16: "Мастер-наставник", 17: "Элитный эксперт",
            18: "Легенда", 19: "Мастер легенд", 20: "Профессор"
        }
        return level, level_names.get(level, "Мастер"), next_minutes, progress

    def get_skill_habits(skill_id):
        rows = db.query("SELECT habit_id, minutes_per_unit FROM skill_habits WHERE skill_id = ?", (skill_id,))
        return [{'habit_id': r['habit_id'], 'minutes_per_unit': r['minutes_per_unit']} for r in rows]

    # ========= API ЭНДПОИНТЫ =========
    @bp.route('/create', methods=['POST'])
    def create_skill():
        data = request.json
        name = data.get('name')
        if not name:
            return jsonify({'status': 'error', 'message': 'Name required'}), 400

        existing = db.query("SELECT id FROM skills WHERE name = ?", (name,))
        if existing:
            skill_id = existing[0]['id']
            if 'description' in data:
                db.execute("UPDATE skills SET description = ? WHERE id = ?", (data['description'], skill_id))
            for habit_link in data.get('habits', []):
                habit_id = habit_link.get('habit_id')
                minutes = habit_link.get('minutes_per_unit', 0)
                if habit_id:
                    existing_link = db.query("SELECT id FROM skill_habits WHERE skill_id = ? AND habit_id = ?",
                                             (skill_id, habit_id))
                    if not existing_link:
                        db.execute("INSERT INTO skill_habits (skill_id, habit_id, minutes_per_unit) VALUES (?, ?, ?)",
                                   (skill_id, habit_id, minutes))
            db.commit()
            return jsonify({'status': 'success', 'id': skill_id, 'message': 'Added links to existing skill'})
        else:
            db.execute("INSERT INTO skills (name, total_minutes, description) VALUES (?, ?, ?)",
                       (name, 0.0, data.get('description', '')))
            skill_id = db.query("SELECT last_insert_rowid() as id")[0]['id']
            for habit_link in data.get('habits', []):
                habit_id = habit_link.get('habit_id')
                minutes = habit_link.get('minutes_per_unit', 0)
                if habit_id:
                    db.execute("INSERT INTO skill_habits (skill_id, habit_id, minutes_per_unit) VALUES (?, ?, ?)",
                               (skill_id, habit_id, minutes))
            db.commit()
            return jsonify({'status': 'success', 'id': skill_id})

    @bp.route('/update/<int:skill_id>', methods=['PUT'])
    def update_skill(skill_id):
        data = request.json
        if 'description' in data:
            db.execute("UPDATE skills SET description = ? WHERE id = ?", (data['description'], skill_id))
        db.execute("DELETE FROM skill_habits WHERE skill_id = ?", (skill_id,))
        for habit_link in data.get('habits', []):
            habit_id = habit_link.get('habit_id')
            minutes = habit_link.get('minutes_per_unit', 0)
            if habit_id:
                db.execute("INSERT INTO skill_habits (skill_id, habit_id, minutes_per_unit) VALUES (?, ?, ?)",
                           (skill_id, habit_id, minutes))
        db.commit()
        return jsonify({'status': 'success'})

    @bp.route('/recalc', methods=['POST'])
    def recalc_skills():
        try:
            skills = db.query("SELECT id FROM skills")
            for skill in skills:
                skill_id = skill['id']
                links = db.query("SELECT habit_id, minutes_per_unit FROM skill_habits WHERE skill_id = ?", (skill_id,))
                total_minutes = 0.0
                for link in links:
                    habit_id = link['habit_id']
                    minutes_per_unit = link['minutes_per_unit']
                    if minutes_per_unit == 0:
                        continue
                    rows = db.query("""
                        SELECT COUNT(*) as cnt FROM completion_habits
                        WHERE habit_id = ? AND success = 1
                    """, (habit_id,))
                    count = rows[0]['cnt'] if rows else 0
                    total_minutes += count * minutes_per_unit
                db.execute("UPDATE skills SET total_minutes = ? WHERE id = ?", (total_minutes, skill_id))
            db.commit()
            return jsonify({'status': 'success', 'message': 'Skills recalculated'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/with-levels', methods=['GET'])
    def get_skills_with_levels():
        try:
            skills_rows = db.query("SELECT * FROM skills ORDER BY name")
            skills = []
            for row in skills_rows:
                skill_id = row['id']
                habits_links = get_skill_habits(skill_id)
                total_minutes = row['total_minutes'] or 0.0
                level, level_name, next_minutes, progress = get_level_info(total_minutes)
                skills.append({
                    'id': skill_id,
                    'name': row['name'],
                    'total_minutes': total_minutes,
                    'total_hours': total_minutes / 60.0,
                    'level': level,
                    'level_name': level_name,
                    'next_level_minutes': next_minutes,
                    'progress_percent': progress,
                    'description': row['description'],
                    'habits': habits_links
                })
            return jsonify({'status': 'success', 'data': skills})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/item/<int:id>', methods=['GET'])
    def get_skill(id):
        try:
            row = db.query("SELECT * FROM skills WHERE id = ?", (id,))
            if not row:
                return jsonify({'status': 'error', 'message': 'Not found'}), 404
            skill = row[0]
            habits_links = get_skill_habits(id)
            return jsonify({'status': 'success', 'data': {
                'id': skill['id'],
                'name': skill['name'],
                'description': skill['description'],
                'total_minutes': skill['total_minutes'],
                'habits': habits_links
            }})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/delete/<int:id>', methods=['DELETE'])
    def delete_skill(id):
        try:
            db.execute("DELETE FROM skill_habits WHERE skill_id = ?", (id,))
            db.execute("DELETE FROM skills WHERE id = ?", (id,))
            db.commit()
            return jsonify({'status': 'success'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    app.register_blueprint(bp)