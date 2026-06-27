from flask import Blueprint, request, jsonify
from datetime import date
import re

def register_goals_api(app, db):
    bp = Blueprint('goals_api', __name__, url_prefix='/api/goals')

    # ---------- Вспомогательные функции ----------
    def get_goal_progress(goal_dict, report_date):
        """goal_dict - словарь из строки БД (с ключами id, name, type, target_key, target_count, start_date, end_date, description)"""
        target_key = goal_dict['target_key']
        m = re.match(r'^(\w+):(.+)$', target_key)
        if not m:
            return 0, goal_dict['target_count']
        entity_type, entity_id = m.group(1), m.group(2)
        start = goal_dict['start_date']
        end = min(goal_dict['end_date'], report_date)

        if goal_dict['type'] == 'habit_count':
            rows = db.query("""
                SELECT COUNT(*) as cnt
                FROM completion_habits ch
                JOIN completions c ON c.id = ch.completion_id
                WHERE ch.habit_id = ? AND ch.success = 1
                  AND c.date BETWEEN ? AND ?
            """, (int(entity_id), start, end))
            count = rows[0]['cnt'] if rows else 0
            return count, goal_dict['target_count']

        elif goal_dict['type'] == 'habit_streak':
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
            return max_streak, goal_dict['target_count']

        elif goal_dict['type'] == 'activity_count':
            rows = db.query("""
                SELECT SUM(quantity) as total
                FROM biometric_physical_activity
                WHERE activity_type = ? AND date BETWEEN ? AND ?
            """, (entity_id, start, end))
            total = rows[0]['total'] if rows and rows[0]['total'] else 0
            return total, goal_dict['target_count']

        elif goal_dict['type'] == 'substance_count':
            rows = db.query("""
                SELECT COUNT(DISTINCT date) as days
                FROM biometric_intake_log
                WHERE substance_id = ? AND taken = 1 AND date BETWEEN ? AND ?
            """, (int(entity_id), start, end))
            total = rows[0]['days'] if rows and rows[0]['days'] else 0
            return total, goal_dict['target_count']

        return 0, goal_dict['target_count']

    # ---------- Эндпоинты ----------
    @bp.route('/progress', methods=['GET'])
    def goals_progress():
        report_date = request.args.get('date', date.today().isoformat())
        # Прямой SQL вместо db.list(Goal)
        rows = db.query("SELECT * FROM goals ORDER BY id")
        result = []
        for row in rows:
            goal_dict = dict(row)
            current, target = get_goal_progress(goal_dict, report_date)
            goal_dict['current'] = current
            goal_dict['target'] = target
            goal_dict['percent'] = round((current / target) * 100, 1) if target > 0 else 0
            # Преобразуем типы для JSON
            if 'start_date' in goal_dict:
                goal_dict['start_date'] = str(goal_dict['start_date'])
            if 'end_date' in goal_dict:
                goal_dict['end_date'] = str(goal_dict['end_date'])
            result.append(goal_dict)
        return jsonify({'status': 'success', 'data': result})

    @bp.route('/list', methods=['GET'])
    def list_goals():
        rows = db.query("SELECT * FROM goals ORDER BY id")
        goals_list = []
        for row in rows:
            g = dict(row)
            if 'start_date' in g:
                g['start_date'] = str(g['start_date'])
            if 'end_date' in g:
                g['end_date'] = str(g['end_date'])
            goals_list.append(g)
        return jsonify({'status': 'success', 'data': goals_list})

    @bp.route('/create', methods=['POST'])
    def create_goal():
        data = request.json
        required = ['name', 'type', 'target_key', 'target_count', 'start_date', 'end_date']
        for f in required:
            if f not in data:
                return jsonify({'status': 'error', 'message': f'Missing field: {f}'}), 400
        db.execute("""
            INSERT INTO goals (name, type, target_key, target_count, start_date, end_date, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data['name'], data['type'], data['target_key'],
            int(data['target_count']), data['start_date'], data['end_date'],
            data.get('description', '')
        ))
        new_id = db.query("SELECT last_insert_rowid() as id")[0]['id']
        return jsonify({'status': 'success', 'id': new_id})

    @bp.route('/update/<int:goal_id>', methods=['PUT'])
    def update_goal(goal_id):
        data = request.json
        # Проверяем существование
        existing = db.query("SELECT id FROM goals WHERE id = ?", (goal_id,))
        if not existing:
            return jsonify({'status': 'error', 'message': 'Goal not found'}), 404
        # Обновляем
        db.execute("""
            UPDATE goals
            SET name = ?, type = ?, target_key = ?, target_count = ?,
                start_date = ?, end_date = ?, description = ?
            WHERE id = ?
        """, (
            data.get('name'), data.get('type'), data.get('target_key'),
            int(data.get('target_count', 0)), data.get('start_date'), data.get('end_date'),
            data.get('description', ''), goal_id
        ))
        return jsonify({'status': 'success'})

    @bp.route('/delete/<int:goal_id>', methods=['DELETE'])
    def delete_goal(goal_id):
        db.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        return jsonify({'status': 'success'})

    app.register_blueprint(bp)