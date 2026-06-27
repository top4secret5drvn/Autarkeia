from flask import Flask, send_file
import logging
import os

logging.basicConfig(level=logging.INFO)

app = Flask(__name__, static_folder='static')

# Import entities FIRST (before Database creation)
from pages.completions.model import Completion
from pages.completions.completion_habits import CompletionHabits
from pages.habits.model import Habit
from pages.combinations.model import Combination
from pages.ideas.model import Idea
from pages.ideas.api import register_ideas
from pages.finance.model import Category, Transaction
from pages.finance.api import register_finance_api
from pages.biometric.model import (Substance, IntakeLog, Meal, Measurement, PhysicalActivity, ActivityLog, MentalDaily, CognitiveTest)
from pages.biometric.api import register_biometric_api
from pages.goals.model import Goal
from pages.goals.api import register_goals_api
from pages.biometric.model import fill_missing_activity_data
from pages.skills.model import Skill
from pages.skills.api import register_skills_api
from pages.export.api import register_export_api


# === НОВОЕ: импорт планировщика ===
from core.planner import register_planner

# === НОВОЕ: импорт API для связей между модулями ===
from pages.combinations.api import register_combinations_api
from pages.combinations.migrations import migrate as migrate_combinations

# Now create the database – tables will be created immediately
from core.db import Database
from core.api import register_entity_blueprint
from core.stats_api import register_stats_api

db = Database('habits.db')
print("✓ Database initialized")

# === Выполнить миграции для новых таблиц ===
try:
    migrate_combinations(db)
    print("✓ Migrations applied")
except Exception as e:
    print(f"⚠ Migration error (tables might already exist): {e}")

import sqlite3
conn = sqlite3.connect('habits.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print(f"✓ Tables created: {tables}")
conn.close()

# Register APIs for all entities
register_entity_blueprint(app, Completion, db)
register_entity_blueprint(app, CompletionHabits, db)
register_entity_blueprint(app, Habit, db)
register_entity_blueprint(app, Combination, db)

# Register entity blueprints
register_entity_blueprint(app, Category, db)
register_entity_blueprint(app, Transaction, db)
register_entity_blueprint(app, Substance, db)
register_entity_blueprint(app, IntakeLog, db)
register_entity_blueprint(app, Meal, db)
register_entity_blueprint(app, Measurement, db)
register_entity_blueprint(app, PhysicalActivity, db)
register_entity_blueprint(app, ActivityLog, db)
register_entity_blueprint(app, MentalDaily, db)
register_entity_blueprint(app, CognitiveTest, db)
register_entity_blueprint(app, Goal, db)
#register_entity_blueprint(app, Skill, db)


register_skills_api(app, db)   # кастомные эндпоинты

# Register statistics API
register_stats_api(app, db)

# === НОВОЕ: регистрация планировщика ===
register_planner(app, db)

# После регистрации остальных сущностей (после register_planner):
register_ideas(app, db)

# Register custom APIs
register_finance_api(app, db)
register_biometric_api(app, db)

# И после регистрации остальных API добавьте:
register_export_api(app, db)
print("✓ Export API registered")

# === НОВОЕ: регистрация API для связей между модулями ===
register_combinations_api(app, db)
print("✓ Combinations API registered")
fill_missing_activity_data(db)

register_goals_api(app, db)


# Add routes for static pages
@app.route('/finance')
def finance_page():
    return send_file('static/finance.html', mimetype='text/html')

@app.route('/biometric')
def biometric_page():
    return send_file('static/biometric.html', mimetype='text/html')

# Ensure tables (optional, already done by Database.__init__)
db.ensure_tables()

@app.route('/report')
def report_page():
    """Serve the discipline report generator page"""
    return send_file('static/report.html', mimetype='text/html')

@app.route('/planner')
def planner_page():
    return app.send_static_file('planner.html')

# Добавьте маршруты для страниц:
@app.route('/ideas')
def ideas_page():
    return send_file('static/ideas.html', mimetype='text/html')

# ... маршрут для статической страницы
@app.route('/skills')
def skills_page():
    return send_file('static/skills.html', mimetype='text/html')

@app.route('/goals')
def goals_page():
    return send_file('static/goals.html', mimetype='text/html')    

@app.route('/tasks')
def tasks_page():
    return send_file('static/tasks.html', mimetype='text/html')

@app.route('/')
def index():
    """Main dashboard page"""
    return send_file('static/index.html', mimetype='text/html')

@app.route('/combinations')
def combinations_page():
    """Combinations and links management page"""
    return send_file('static/combinations.html', mimetype='text/html')

# Добавьте в app.py:

@app.route('/export')
def export_page():
    """Экспорт статистики за период"""
    return send_file('static/export.html', mimetype='text/html')

# === DEBUG ENDPOINTS ===
@app.route('/api/debug/test-completion', methods=['POST'])
def test_completion():
    """Create a test completion to debug database loading"""
    from datetime import date
    try:
        today = date.today().isoformat()
        completion = Completion(
            date=today,
            day_number=1,
            state='WORK',
            thoughts='Test completion',
            friction_index=1,
            totals={'I': 1.0, 'S': 1.0}
        )
        db.insert(completion)
        return {'status': 'success', 'message': f'Test completion created for {today}', 'id': completion.id}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {'status': 'error', 'message': str(e)}, 500


@app.route('/api/debug/list-completions', methods=['GET'])
def debug_list_completions():
    """List all completions for debugging"""
    try:
        completions = db.list(Completion)
        return {
            'status': 'success',
            'total': len(completions),
            'data': [c.to_dict() for c in completions]
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}, 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)