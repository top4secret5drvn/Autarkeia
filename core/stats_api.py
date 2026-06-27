from flask import Blueprint, jsonify
from datetime import date, timedelta

def register_stats_api(app, db):
    bp = Blueprint('stats', __name__, url_prefix='/api/stats')

    @bp.route('/streaks', methods=['GET'])
    def get_streaks():
        try:
            from pages.completions.model import Completion
            all_completions = db.list(Completion, order_by='date')
            
            if not all_completions:
                return jsonify({
                    'status': 'success',
                    'data': {
                        'total_days': 0,
                        'current_streak': 0,
                        'best_streak': 0,
                        'avg_st': 0
                    }
                })

            # Конвертируем в словари и получаем даты
            completions_dicts = [c.to_dict() for c in all_completions]
            dates = sorted([c['date'] for c in completions_dicts])
            
            total_days = len(dates)
            
            # Расчет стейков
            if not dates:
                current_streak = 0
                best_streak = 0
            else:
                date_objects = [date.fromisoformat(d) for d in dates]
                
                # Best streak
                best_streak = 0
                current_streak_val = 0
                if date_objects:
                    best_streak = 1
                    current_streak_val = 1
                    for i in range(1, len(date_objects)):
                        if (date_objects[i] - date_objects[i-1]).days == 1:
                            current_streak_val += 1
                        else:
                            current_streak_val = 1
                        if current_streak_val > best_streak:
                            best_streak = current_streak_val
                
                # Current streak
                current_streak = 0
                today = date.today()
                
                if date_objects:
                    # Проверяем, был ли сегодня комлишн
                    if date_objects[-1] == today:
                        current_streak = 1
                        for i in range(len(date_objects) - 2, -1, -1):
                            if (date_objects[i+1] - date_objects[i]).days == 1:
                                current_streak += 1
                            else:
                                break
                    # Проверяем, был ли вчера комлишн
                    elif (today - date_objects[-1]).days == 1:
                        current_streak = 1
                        for i in range(len(date_objects) - 2, -1, -1):
                            if (date_objects[i+1] - date_objects[i]).days == 1:
                                current_streak += 1
                            else:
                                break
                    else:
                        current_streak = 0


            # Расчет среднего ST
            total_st = 0
            count_st = 0
            from pages.completions.completion_habits import CompletionHabits
            all_completion_habits = db.list(CompletionHabits)
            
            for ch in all_completion_habits:
                ch_dict = ch.to_dict()
                st_val = ch_dict.get('st')
                if st_val is not None:
                    total_st += float(st_val)
                    count_st += 1
            
            avg_st = total_st / count_st if count_st > 0 else 0

            return jsonify({
                'status': 'success',
                'data': {
                    'total_days': total_days,
                    'current_streak': current_streak,
                    'best_streak': best_streak,
                    'avg_st': avg_st
                }
            })

        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'status': 'error', 'message': str(e)}), 500

    app.register_blueprint(bp)
