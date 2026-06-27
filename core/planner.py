"""
Планировщик проектов (roadmaps) с поддержкой обучающих задач (кривая Эббингауза).
Работает с файловой структурой roadmaps/ и использует ORM для записи в БД.
"""

import os
import re
from datetime import date, timedelta
from flask import Blueprint, request, jsonify

from core.db import Database
from pages.habits.model import Habit
from pages.completions.model import Completion
from pages.completions.completion_habits import CompletionHabits

def register_planner(app, db):
    """
    Регистрирует blueprint планировщика с доступом к БД через ORM.
    """
    bp = Blueprint('planner', __name__, url_prefix='/api/planner')

    # ------------------------------------------------------------
    # Файловая часть
    # ------------------------------------------------------------
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ROADMAPS_DIR = os.path.join(BASE_DIR, 'roadmaps')

    def _ensure_roadmaps_dir():
        if not os.path.exists(ROADMAPS_DIR):
            os.makedirs(ROADMAPS_DIR)

    def _is_safe_path(path, base):
        real_base = os.path.realpath(base)
        real_path = os.path.realpath(path)
        return real_path.startswith(real_base)

    def _calculate_ebbinghaus_next_date(x_count):
        intervals = {0: 0, 1: 1, 2: 3, 3: 7, 4: 14, 5: 30}
        days = intervals.get(x_count, 30)
        return (date.today() + timedelta(days=days)).isoformat()

    @bp.route('/projects', methods=['GET'])
    def list_projects():
        try:
            _ensure_roadmaps_dir()
            projects = [name for name in os.listdir(ROADMAPS_DIR)
                        if os.path.isdir(os.path.join(ROADMAPS_DIR, name))]
            return jsonify({'status': 'success', 'data': sorted(projects)})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/create_project', methods=['POST'])
    def create_project():
        try:
            data = request.json or {}
            name = data.get('name')
            if not name:
                return jsonify({'status': 'error', 'message': 'name required'}), 400
            proj_path = os.path.join(ROADMAPS_DIR, name)
            if not _is_safe_path(proj_path, ROADMAPS_DIR):
                return jsonify({'status': 'error', 'message': 'invalid name'}), 400
            os.makedirs(proj_path, exist_ok=True)
            return jsonify({'status': 'success'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/project/<path:project_name>', methods=['GET'])
    def get_project(project_name):
        try:
            proj_path = os.path.join(ROADMAPS_DIR, project_name)
            if not _is_safe_path(proj_path, ROADMAPS_DIR) or not os.path.isdir(proj_path):
                return jsonify({'status': 'error', 'message': 'project not found'}), 404

            items = []
            for fn in sorted(os.listdir(proj_path)):
                fp = os.path.join(proj_path, fn)
                if os.path.isfile(fp):
                    with open(fp, 'r', encoding='utf-8') as f:
                        content = f.read()
                    completed = 'выполнено' in fn.lower()
                    items.append({'filename': fn, 'content': content, 'completed': completed})
            return jsonify({'status': 'success', 'data': items})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/task', methods=['POST', 'PUT', 'DELETE'])
    def manage_task():
        try:
            data = request.json or {}
            project = data.get('project')
            filename = data.get('filename')
            if not project or not filename:
                return jsonify({'status': 'error', 'message': 'project and filename required'}), 400

            proj_path = os.path.join(ROADMAPS_DIR, project)
            if not _is_safe_path(proj_path, ROADMAPS_DIR) or not os.path.isdir(proj_path):
                return jsonify({'status': 'error', 'message': 'project not found'}), 404

            fp = os.path.join(proj_path, filename)
            if not _is_safe_path(fp, proj_path):
                return jsonify({'status': 'error', 'message': 'invalid filename'}), 400

            if request.method == 'POST':
                if os.path.exists(fp):
                    return jsonify({'status': 'error', 'message': 'file exists'}), 400
                content = data.get('content', '')
                with open(fp, 'w', encoding='utf-8') as f:
                    f.write(content)
                return jsonify({'status': 'success', 'filename': filename})

            if request.method == 'PUT':
                if not os.path.exists(fp):
                    return jsonify({'status': 'error', 'message': 'file not found'}), 404
                with open(fp, 'r', encoding='utf-8') as f:
                    old = f.read()
                repeat_header = ''
                if old.startswith('════'):
                    lines = old.split('\n')
                    if len(lines) >= 3 and lines[0].startswith('════'):
                        repeat_header = '\n'.join(lines[:3]) + '\n\n'
                new_content = data.get('content', '')
                final = repeat_header + new_content
                with open(fp, 'w', encoding='utf-8') as f:
                    f.write(final)
                return jsonify({'status': 'success'})

            if request.method == 'DELETE':
                if not os.path.exists(fp):
                    return jsonify({'status': 'error', 'message': 'file not found'}), 404
                os.remove(fp)
                return jsonify({'status': 'success'})

        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/toggle_training', methods=['POST'])
    def toggle_training():
        try:
            data = request.json or {}
            project = data.get('project')
            if not project:
                return jsonify({'status': 'error', 'message': 'project required'}), 400

            src = os.path.join(ROADMAPS_DIR, project)
            if not _is_safe_path(src, ROADMAPS_DIR) or not os.path.isdir(src):
                return jsonify({'status': 'error', 'message': 'project not found'}), 404

            basename = os.path.basename(src)
            new_basename = basename[1:] if basename.startswith('!') else '!' + basename
            dst = os.path.join(ROADMAPS_DIR, new_basename)
            if os.path.exists(dst):
                return jsonify({'status': 'error', 'message': 'target name exists'}), 400

            os.rename(src, dst)
            return jsonify({'status': 'success', 'new_name': new_basename})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/complete', methods=['POST'])
    def mark_complete():
        try:
            data = request.json or {}
            project = data.get('project')
            filename = data.get('filename')
            mark = bool(data.get('mark', True))
            if not project or not filename:
                return jsonify({'status': 'error', 'message': 'project and filename required'}), 400

            proj_path = os.path.join(ROADMAPS_DIR, project)
            if not _is_safe_path(proj_path, ROADMAPS_DIR) or not os.path.isdir(proj_path):
                return jsonify({'status': 'error', 'message': 'project not found'}), 404

            src = os.path.join(proj_path, filename)
            if not os.path.exists(src) or not os.path.isfile(src):
                return jsonify({'status': 'error', 'message': 'file not found'}), 404

            name, ext = os.path.splitext(filename)
            done_suffix = ' выполнено'
            is_training = project.startswith('!')

            # -------- Подготовка нового имени и содержимого (без переименования) --------
            if is_training:
                base = name
                if base.endswith(done_suffix):
                    base = base[:-len(done_suffix)]

                m = re.match(r"^(.*?)(?:\s(\d{4}-\d{2}-\d{2}))?(?:\s([x]+))?$", base)
                if m:
                    core = (m.group(1) or '').strip()
                    date_part = m.group(2)
                    xs = m.group(3) or ''
                    x_count = len(xs)
                else:
                    core = base.strip()
                    date_part = None
                    x_count = 0

                today_str = date.today().isoformat()

                if mark:
                    x_count = min(3, x_count + 1)
                    date_part = today_str
                else:
                    if name.endswith(done_suffix):
                        x_count = 3
                    elif x_count > 0:
                        x_count = max(0, x_count - 1)
                    if x_count == 0:
                        date_part = None

                parts = [core]
                if date_part:
                    parts.append(date_part)
                if x_count > 0:
                    parts.append('x' * x_count)
                new_name_body = ' '.join(parts).strip()
                if x_count >= 3:
                    new_name = new_name_body + done_suffix + ext
                else:
                    new_name = new_name_body + ext

                # Читаем содержимое
                with open(src, 'r', encoding='utf-8') as f:
                    current = f.read()
                lines = current.split('\n')
                if lines and lines[0].startswith('════'):
                    current = '\n'.join(lines[3:]).lstrip('\n')
                if mark and x_count > 0:
                    next_repeat = _calculate_ebbinghaus_next_date(x_count)
                    header = f"════════════════════════════════════════\n  Повтор: {next_repeat}\n════════════════════════════════════════\n\n"
                    new_content = header + current
                else:
                    new_content = current

                final_filename = new_name
            else:
                if mark and done_suffix not in name:
                    today_str = date.today().isoformat()
                    new_name = f"{name} {today_str}{done_suffix}{ext}"
                elif not mark and done_suffix in name:
                    base = re.sub(r"\s\d{4}-\d{2}-\d{2}(?=\sвыполнено)", '', name)
                    base = base.replace(done_suffix, '')
                    new_name = base + ext
                else:
                    new_name = filename
                final_filename = new_name
                new_content = None  # для обычных проектов не нужно

            # -------- Работа с БД через ORM --------
            today_date = date.today().isoformat()
            project_clean = project.lstrip('!')
            core_name = os.path.splitext(final_filename)[0]
            habit_name = f"Работа по проекту ({project_clean} {core_name})"
            category = "Проекты"

            deltas = data.get('deltas') or {}
            def get_delta(key):
                try:
                    return float(deltas.get(key, 0))
                except:
                    return 0.0

            # Привычка
            existing_habits = db.list(Habit, filters={'name': habit_name, 'category': category})
            if existing_habits:
                habit = existing_habits[0]
            else:
                habit = Habit(
                    name=habit_name,
                    category=category,
                    description='',
                    i=0.0, s=0.0, w=0.0, e=0.0, c=0.0, h=0.0, st=0.0, money=0.0,
                    is_composite=0, is_active=1
                )
                db.insert(habit)

            # День дисциплины
            existing_completions = db.list(Completion, filters={'date': today_date})
            if existing_completions:
                completion = existing_completions[0]
            else:
                all_completions = db.list(Completion, order_by='day_number DESC', limit=1)
                if all_completions:
                    next_day = (all_completions[0]['day_number'] or 0) + 1
                else:
                    next_day = 1
                completion = Completion(
                    date=today_date,
                    day_number=next_day,
                    state=None,
                    thoughts=None,
                    tasks_json={},
                    friction_index=1,
                    totals={}
                )
                db.insert(completion)

            # CompletionHabits
            existing_ch = db.list(CompletionHabits, filters={
                'completion_id': completion.id,
                'habit_id': habit.id
            })

            if mark:
                if existing_ch:
                    ch = existing_ch[0]
                    # Сохраняем старые дельты
                    old_deltas = {
                        'I': ch['i'] or 0.0,
                        'S': ch['s'] or 0.0,
                        'W': ch['w'] or 0.0,
                        'E': ch['e'] or 0.0,
                        'C': ch['c'] or 0.0,
                        'H': ch['hh'] or 0.0,
                        'ST': ch['st'] or 0.0,
                        '$': ch['money'] or 0.0
                    }
                    # Обновляем поля
                    ch['success'] = True
                    ch['quantity'] = 1.0
                    ch['i'] = get_delta('I')
                    ch['s'] = get_delta('S')
                    ch['w'] = get_delta('W')
                    ch['e'] = get_delta('E')
                    ch['c'] = get_delta('C')
                    ch['hh'] = get_delta('H')
                    ch['st'] = get_delta('ST')
                    ch['money'] = get_delta('$')
                    db.update(ch)

                    totals = completion['totals'] or {}
                    for key, old_val in old_deltas.items():
                        totals[key] = totals.get(key, 0.0) - old_val
                    for key in ('I','S','W','E','C','H','ST','$'):
                        totals[key] = totals.get(key, 0.0) + get_delta(key)
                    completion['totals'] = totals
                    db.update(completion)
                else:
                    ch = CompletionHabits(
                        completion_id=completion.id,
                        habit_id=habit.id,
                        name=habit_name,
                        category=category,
                        success=True,
                        quantity=1.0,
                        unit=None,
                        i=get_delta('I'),
                        s=get_delta('S'),
                        w=get_delta('W'),
                        e=get_delta('E'),
                        c=get_delta('C'),
                        hh=get_delta('H'),
                        st=get_delta('ST'),
                        money=get_delta('$')
                    )
                    db.insert(ch)
                    totals = completion['totals'] or {}
                    for key in ('I','S','W','E','C','H','ST','$'):
                        totals[key] = totals.get(key, 0.0) + get_delta(key)
                    completion['totals'] = totals
                    tasks_json = completion['tasks_json'] or {}
                    tasks_json['completed_count'] = tasks_json.get('completed_count', 0) + 1
                    completion['tasks_json'] = tasks_json
                    db.update(completion)
            else:
                # Снятие отметки
                if existing_ch:
                    ch = existing_ch[0]
                    totals = completion['totals'] or {}
                    totals['I'] = totals.get('I', 0.0) - (ch['i'] or 0.0)
                    totals['S'] = totals.get('S', 0.0) - (ch['s'] or 0.0)
                    totals['W'] = totals.get('W', 0.0) - (ch['w'] or 0.0)
                    totals['E'] = totals.get('E', 0.0) - (ch['e'] or 0.0)
                    totals['C'] = totals.get('C', 0.0) - (ch['c'] or 0.0)
                    totals['H'] = totals.get('H', 0.0) - (ch['hh'] or 0.0)
                    totals['ST'] = totals.get('ST', 0.0) - (ch['st'] or 0.0)
                    totals['$'] = totals.get('$', 0.0) - (ch['money'] or 0.0)
                    completion['totals'] = totals

                    tasks_json = completion['tasks_json'] or {}
                    tasks_json['completed_count'] = max(0, tasks_json.get('completed_count', 0) - 1)
                    completion['tasks_json'] = tasks_json
                    db.update(completion)

                    db.delete(CompletionHabits, ch.id)

            # -------- Файловые операции --------
            if is_training:
                dst = os.path.join(proj_path, final_filename)
                os.rename(src, dst)
                with open(dst, 'w', encoding='utf-8') as f:
                    f.write(new_content)
            else:
                dst = os.path.join(proj_path, final_filename)
                os.rename(src, dst)

            return jsonify({'status': 'success', 'filename': final_filename})

        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'status': 'error', 'message': str(e)}), 500

    # Регистрируем blueprint
    app.register_blueprint(bp)