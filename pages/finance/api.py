from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta, date
from core.db import Database
from pages.finance.model import Transaction, Category
import sqlite3

def register_finance_api(app, db):
    bp = Blueprint('finance_api', __name__, url_prefix='/api/finance')

    @bp.route('/stats', methods=['GET'])
    def get_stats():
        period = request.args.get('period', 'month')
        date_str = request.args.get('date', datetime.today().date().isoformat())
        end_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        if period == 'all':
            start_date = date(2000, 1, 1)
        elif period == 'week':
            start_date = end_date - timedelta(days=7)
        elif period == 'month':
            start_date = end_date - timedelta(days=30)
        elif period == 'year':
            start_date = end_date - timedelta(days=365)
        else:
            start_date = end_date - timedelta(days=30)

        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Get all categories
        cursor.execute("SELECT id, type, is_active FROM finance_categories")
        categories = {row['id']: {'type': row['type'], 'is_active': bool(row['is_active'])} for row in cursor.fetchall()}

        # Get transactions in period
        cursor.execute("""
            SELECT date, category_id, amount
            FROM finance_transactions
            WHERE date BETWEEN ? AND ?
        """, (start_date.isoformat(), end_date.isoformat()))
        rows = cursor.fetchall()
        conn.close()

        stats = {
            'income': 0.0,
            'expense': 0.0,
            'active_income': 0.0,
            'passive_income': 0.0,
            'net': 0.0,
            'expense_percent': 0.0,
            'daily_series': [],  # for chart: [{date, income, expense}]
        }

        daily_data = {}
        for row in rows:
            row_date = row['date']
            cat = categories.get(row['category_id'])
            if not cat:
                continue
            amount = row['amount']
            if cat['type'] == 'income':
                stats['income'] += amount
                if cat['is_active']:
                    stats['active_income'] += amount
                else:
                    stats['passive_income'] += amount
            else:
                stats['expense'] += amount

            if row_date not in daily_data:
                daily_data[row_date] = {'income': 0.0, 'expense': 0.0}
            if cat['type'] == 'income':
                daily_data[row_date]['income'] += amount
            else:
                daily_data[row_date]['expense'] += amount

        stats['net'] = stats['income'] - stats['expense']
        if stats['income'] > 0:
            stats['expense_percent'] = (stats['expense'] / stats['income']) * 100

        # Build daily series sorted by date
        sorted_dates = sorted(daily_data.keys())
        for row_date in sorted_dates:
            stats['daily_series'].append({
                'date': row_date,
                'income': daily_data[row_date]['income'],
                'expense': daily_data[row_date]['expense']
            })

        return jsonify({'status': 'success', 'data': stats})

    app.register_blueprint(bp)