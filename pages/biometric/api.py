from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from core.db import Database
from pages.biometric.model import MentalDaily, Measurement, PhysicalActivity, ActivityLog
import sqlite3

def register_biometric_api(app, db):
    bp = Blueprint('biometric_api', __name__, url_prefix='/api/biometric')

    @bp.route('/mental/trend', methods=['GET'])
    def mental_trend():
        days = int(request.args.get('days', 30))
        end_date = datetime.today().date()
        start_date = end_date - timedelta(days=days)
        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, focus, attention, thinking_speed, energy, mood
            FROM biometric_mental_daily
            WHERE date BETWEEN ? AND ?
            ORDER BY date
        """, (start_date.isoformat(), end_date.isoformat()))
        rows = cursor.fetchall()
        conn.close()
        data = []
        for row in rows:
            data.append({
                'date': row['date'],
                'focus': row['focus'],
                'attention': row['attention'],
                'thinking_speed': row['thinking_speed'],
                'energy': row['energy'],
                'mood': row['mood'],
            })
        return jsonify({'status': 'success', 'data': data})

    @bp.route('/measurements/weight', methods=['GET'])
    def weight_trend():
        days = int(request.args.get('days', 30))
        end_date = datetime.today().date()
        start_date = end_date - timedelta(days=days)
        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, weight
            FROM biometric_measurements
            WHERE date BETWEEN ? AND ? AND weight IS NOT NULL
            ORDER BY date
        """, (start_date.isoformat(), end_date.isoformat()))
        rows = cursor.fetchall()
        conn.close()
        data = [{'date': row['date'], 'weight': row['weight']} for row in rows]
        return jsonify({'status': 'success', 'data': data})

    @bp.route('/activity/summary', methods=['GET'])
    def activity_summary():
        period = request.args.get('period', 'month')
        end_date = datetime.today().date()
        if period == 'week':
            start_date = end_date - timedelta(days=7)
        elif period == 'month':
            start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=365)
        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT activity_type, SUM(quantity) as total_quantity
            FROM biometric_physical_activity
            WHERE date BETWEEN ? AND ?
            GROUP BY activity_type
            ORDER BY total_quantity DESC
        """, (start_date.isoformat(), end_date.isoformat()))
        rows = cursor.fetchall()
        conn.close()
        data = [{'activity_type': row['activity_type'], 'total_quantity': row['total_quantity']} for row in rows]
        return jsonify({'status': 'success', 'data': data})

    @bp.route('/activity/save', methods=['POST'])
    def save_physical_activity():
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'No data provided'}), 400

        required_fields = ['date', 'activity_type', 'quantity']
        for field in required_fields:
            if field not in data:
                return jsonify({'status': 'error', 'message': f'Missing required field: {field}'}), 400

        try:
            quantity = int(data['quantity'])
            if quantity < 0:
                raise ValueError('Quantity must be non-negative')
            intensity = None
            if data.get('intensity') is not None and data.get('intensity') != '':
                intensity = int(data['intensity'])
                if not (1 <= intensity <= 10):
                    raise ValueError('Intensity must be between 1 and 10')
            calories_per_unit = float(data.get('calories_per_unit', 0.0))
        except (ValueError, TypeError) as e:
            return jsonify({'status': 'error', 'message': f'Invalid quantity/intensity/calories: {e}'}), 400

        try:
            conn = db.get_conn()
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

        try:
            cursor.execute("""
                SELECT id, quantity FROM biometric_physical_activity
                WHERE date = ? AND activity_type = ?
            """, (data['date'], data['activity_type']))
            existing = cursor.fetchone()

            if existing:
                cursor.execute("""
                    UPDATE biometric_physical_activity
                    SET quantity = ?, intensity = ?, notes = ?, calories_per_unit = ?
                    WHERE id = ?
                """, (quantity, intensity, data.get('notes'), calories_per_unit, existing['id']))
                activity_id = existing['id']
            else:
                cursor.execute("""
                    INSERT INTO biometric_physical_activity (date, activity_type, quantity, intensity, notes, calories_per_unit)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (data['date'], data['activity_type'], quantity, intensity, data.get('notes'), calories_per_unit))
                activity_id = cursor.lastrowid

            conn.commit()
            conn.close()
            return jsonify({'status': 'success', 'id': activity_id})
        except Exception as e:
            conn.rollback()
            conn.close()
            return jsonify({'status': 'error', 'message': 'DB error: ' + str(e)}), 500

    @bp.route('/activity/log', methods=['GET'])
    def get_activity_log():
        date = request.args.get('date', datetime.today().date().isoformat())
        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM biometric_activity_log
            WHERE date = ?
            ORDER BY activity_type
        """, (date,))
        rows = cursor.fetchall()
        conn.close()
        data = [{'id': row['id'], 'activity_type': row['activity_type'], 'date': row['date'], 'quantity': row['quantity'], 'completed': row['completed']} for row in rows]
        return jsonify({'status': 'success', 'data': data})

    @bp.route('/activity/types', methods=['GET'])
    def get_activity_types():
        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT activity_type FROM biometric_physical_activity
            UNION
            SELECT DISTINCT activity_type FROM biometric_activity_log
            ORDER BY activity_type
        """)
        rows = cursor.fetchall()
        conn.close()
        data = [row['activity_type'] for row in rows if row['activity_type']]
        if not data:
            data = ['Отжимания', 'Приседания', 'Скручивания']
        return jsonify({'status': 'success', 'data': data})

    @bp.route('/activity/log/toggle', methods=['POST'])
    def toggle_activity_completion():
        data = request.get_json()
        if not data or 'activity_type' not in data or 'date' not in data:
            return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400

        activity_type = data['activity_type']
        date = data['date']
        quantity = data.get('quantity', 1)
        completed = data.get('completed', False)

        try:
            quantity = int(quantity)
            if quantity < 0:
                raise ValueError('Quantity must be non-negative')
            completed = bool(completed)
        except (ValueError, TypeError) as e:
            return jsonify({'status': 'error', 'message': f'Invalid quantity/completed: {e}'}), 400

        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            cursor.execute("""
                SELECT id FROM biometric_activity_log
                WHERE activity_type = ? AND date = ?
            """, (activity_type, date))
            existing = cursor.fetchone()

            if existing:
                cursor.execute("""
                    UPDATE biometric_activity_log
                    SET completed = ?, quantity = ?
                    WHERE id = ?
                """, (int(bool(completed)), quantity, existing['id']))
            else:
                cursor.execute("""
                    INSERT INTO biometric_activity_log (activity_type, date, quantity, completed)
                    VALUES (?, ?, ?, ?)
                """, (activity_type, date, quantity, int(bool(completed))))

            # Синхронизация с biometric_physical_activity
            cursor.execute("""
                SELECT id, calories_per_unit FROM biometric_physical_activity
                WHERE date = ? AND activity_type = ?
            """, (date, activity_type))
            phys = cursor.fetchone()

            if completed:
                if phys:
                    cursor.execute("""
                        UPDATE biometric_physical_activity
                        SET quantity = ?, intensity = ?, notes = ?
                        WHERE id = ?
                    """, (quantity, None, '', phys['id']))
                else:
                    cursor.execute("""
                        INSERT INTO biometric_physical_activity (date, activity_type, quantity, intensity, notes, calories_per_unit)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (date, activity_type, quantity, None, '', 0.0))
            else:
                if phys:
                    cursor.execute("""
                        DELETE FROM biometric_physical_activity
                        WHERE id = ?
                    """, (phys['id'],))

            conn.commit()
            conn.close()
            return jsonify({'status': 'success'})
        except Exception as e:
            conn.rollback()
            conn.close()
            return jsonify({'status': 'error', 'message': 'DB error: ' + str(e)}), 500

    @bp.route('/activity/predict/<activity_type>', methods=['GET'])
    def predict_activity(activity_type):
        try:
            from core.ml import predict_activity_progress
            result = predict_activity_progress(db, activity_type)
            return jsonify({'status': 'success', 'data': result})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    app.register_blueprint(bp)