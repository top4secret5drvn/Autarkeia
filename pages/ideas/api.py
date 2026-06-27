from flask import Blueprint, request, jsonify
from datetime import date
from pages.ideas.model import Idea
from pages.completions.model import Completion
from pages.completions.completion_habits import CompletionHabits
from pages.habits.model import Habit

def register_ideas(app, db):
    bp = Blueprint('ideas', __name__, url_prefix='/api/ideas')

    @bp.route('/', methods=['GET'])
    def list_ideas():
        try:
            items = db.list(Idea, order_by='id DESC')
            return jsonify({'status': 'success', 'data': [item.to_dict() for item in items]})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/<int:id>', methods=['GET'])
    def get_idea(id):
        try:
            item = db.get(Idea, id)
            if not item:
                return jsonify({'status': 'error', 'message': 'Not found'}), 404
            return jsonify({'status': 'success', 'data': item.to_dict()})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/', methods=['POST'])
    def create_idea():
        try:
            data = request.json or {}
            idea = Idea(
                title=data.get('title'),
                description=data.get('description', ''),
                realism=data.get('realism', 5),
                related_ids=data.get('related_ids', []),
                idea_type=data.get('idea_type', 'own'),
                source=data.get('source', ''),
                problems=data.get('problems', ''),
                what_changes=data.get('what_changes', ''),
                difficulty=data.get('difficulty', 'background'),
                is_completed=False,
                i=float(data.get('i', 0)),
                s=float(data.get('s', 0)),
                w=float(data.get('w', 0)),
                e=float(data.get('e', 0)),
                c=float(data.get('c', 0)),
                h=float(data.get('h', 0)),
                st=float(data.get('st', 0)),
                money=float(data.get('money', 0))
            )
            db.insert(idea)
            return jsonify({'status': 'success', 'id': idea.id, 'data': idea.to_dict()})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400

    @bp.route('/<int:id>', methods=['PUT'])
    def update_idea(id):
        try:
            idea = db.get(Idea, id)
            if not idea:
                return jsonify({'status': 'error', 'message': 'Not found'}), 404
            data = request.json or {}
            for field in Idea.fields:
                if field.name in data:
                    idea[field.name] = data[field.name]
            db.update(idea)
            return jsonify({'status': 'success', 'data': idea.to_dict()})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400

    @bp.route('/<int:id>', methods=['DELETE'])
    def delete_idea(id):
        try:
            db.delete(Idea, id)
            return jsonify({'status': 'success'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/related', methods=['GET'])
    def related_ideas():
        try:
            items = db.list(Idea, order_by='title')
            return jsonify({'status': 'success', 'data': [item.to_dict() for item in items]})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/<int:id>/complete', methods=['POST'])
    def complete_idea(id):
        try:
            idea = db.get(Idea, id)
            if not idea:
                return jsonify({'status': 'error', 'message': 'Not found'}), 404
            if idea['is_completed']:
                return jsonify({'status': 'error', 'message': 'Already completed'}), 400

            data = request.json or {}
            deltas = data.get('deltas', {})
            if not deltas:
                deltas = {
                    'I': idea['i'] or 0,
                    'S': idea['s'] or 0,
                    'W': idea['w'] or 0,
                    'E': idea['e'] or 0,
                    'C': idea['c'] or 0,
                    'H': idea['h'] or 0,
                    'ST': idea['st'] or 0,
                    '$': idea['money'] or 0
                }
            else:
                for k in deltas:
                    deltas[k] = float(deltas[k])

            today_str = date.today().isoformat()
            completions = db.list(Completion, filters={'date': today_str})
            if completions:
                completion = completions[0]
            else:
                all_comps = db.list(Completion, order_by='day_number DESC', limit=1)
                next_day = (all_comps[0]['day_number'] if all_comps else 0) + 1
                completion = Completion(
                    date=today_str,
                    day_number=next_day,
                    state=None,
                    thoughts=None,
                    tasks_json={},
                    friction_index=1,
                    totals={}
                )
                db.insert(completion)

            habit_name = f"Идея: {idea['title']}"
            habits = db.list(Habit, filters={'name': habit_name, 'category': 'Идеи'})
            if habits:
                habit = habits[0]
            else:
                habit = Habit(
                    name=habit_name,
                    category='Идеи',
                    default_quantity=1,
                    unit=None,
                    i=deltas.get('I', 0),
                    s=deltas.get('S', 0),
                    w=deltas.get('W', 0),
                    e=deltas.get('E', 0),
                    c=deltas.get('C', 0),
                    h=deltas.get('H', 0),
                    st=deltas.get('ST', 0),
                    money=deltas.get('$', 0)
                )
                db.insert(habit)

            ch = CompletionHabits(
                completion_id=completion.id,
                habit_id=habit.id,
                name=habit_name,
                category='Идеи',
                success=True,
                quantity=1.0,
                unit=None,
                i=deltas.get('I', 0),
                s=deltas.get('S', 0),
                w=deltas.get('W', 0),
                e=deltas.get('E', 0),
                c=deltas.get('C', 0),
                hh=deltas.get('H', 0),
                st=deltas.get('ST', 0),
                money=deltas.get('$', 0)
            )
            db.insert(ch)

            totals = completion['totals'] or {}
            for key in ('I','S','W','E','C','H','ST','$'):
                totals[key] = totals.get(key, 0.0) + deltas.get(key, 0.0)
            completion['totals'] = totals
            db.update(completion)

            idea['is_completed'] = True
            db.update(idea)

            return jsonify({'status': 'success'})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'status': 'error', 'message': str(e)}), 500

    app.register_blueprint(bp)