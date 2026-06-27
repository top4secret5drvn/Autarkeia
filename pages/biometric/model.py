from core.models import Entity, Field, FieldType

class Substance(Entity):
    __tablename__ = 'biometric_substances'
    __page_name__ = 'biometric_substances'
    __title__ = 'Вещества (витамины, БАДы)'
    _abstract = False

    fields = [
        Field('name', FieldType.STRING, required=True, label='Название'),
        Field('dosage', FieldType.STRING, label='Дозировка'),
        Field('frequency', FieldType.STRING, label='Периодичность'),
        Field('time_of_day', FieldType.STRING, label='Время приёма'),
    ]

class IntakeLog(Entity):
    __tablename__ = 'biometric_intake_log'
    __page_name__ = 'biometric_intake_log'
    __title__ = 'Журнал приёма веществ'
    _abstract = False

    fields = [
        Field('substance_id', FieldType.INTEGER, required=True, label='Вещество'),
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('taken', FieldType.BOOLEAN, default=False, label='Принято'),
    ]

class Meal(Entity):
    __tablename__ = 'biometric_meals'
    __page_name__ = 'biometric_meals'
    __title__ = 'Приёмы пищи'
    _abstract = False

    fields = [
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('meal_type', FieldType.STRING, required=True, label='Приём пищи',
              choices=['breakfast', 'lunch', 'dinner', 'snack']),
        Field('description', FieldType.TEXT, label='Описание'),
        Field('calories', FieldType.FLOAT, label='Калории'),
        Field('notes', FieldType.TEXT, label='Примечания'),
    ]

class Measurement(Entity):
    __tablename__ = 'biometric_measurements'
    __page_name__ = 'biometric_measurements'
    __title__ = 'Физические измерения'
    _abstract = False

    fields = [
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('weight', FieldType.FLOAT, label='Вес (кг)'),
        Field('body_fat_percent', FieldType.FLOAT, label='% жира'),
        Field('muscle_mass', FieldType.FLOAT, label='Мышечная масса (кг)'),
        Field('chest', FieldType.FLOAT, label='Грудь (см)'),
        Field('waist', FieldType.FLOAT, label='Талия (см)'),
        Field('hips', FieldType.FLOAT, label='Бёдра (см)'),
        Field('heart_rate', FieldType.INTEGER, label='Пульс (уд/мин)'),
        Field('blood_pressure_systolic', FieldType.INTEGER, label='Давление (верхнее)'),
        Field('blood_pressure_diastolic', FieldType.INTEGER, label='Давление (нижнее)'),
        Field('notes', FieldType.TEXT, label='Примечания'),
    ]

class PhysicalActivity(Entity):
    __tablename__ = 'biometric_physical_activity'
    __page_name__ = 'biometric_physical_activity'
    __title__ = 'Физическая активность'
    _abstract = False

    fields = [
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('activity_type', FieldType.STRING, required=True, label='Вид активности'),
        Field('quantity', FieldType.INTEGER, required=True, label='Количество'),
        Field('intensity', FieldType.INTEGER, label='Интенсивность (1-10)'),
        Field('calories_per_unit', FieldType.FLOAT, default=0.0, label='Ккал за единицу'),
        Field('notes', FieldType.TEXT, label='Примечания'),
    ]

class ActivityLog(Entity):
    __tablename__ = 'biometric_activity_log'
    __page_name__ = 'biometric_activity_log'
    __title__ = 'Журнал активностей'
    _abstract = False

    fields = [
        Field('activity_type', FieldType.STRING, required=True, label='Вид активности'),
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('quantity', FieldType.INTEGER, required=True, label='Количество'),
        Field('completed', FieldType.BOOLEAN, default=False, label='Выполнено'),
    ]

class MentalDaily(Entity):
    __tablename__ = 'biometric_mental_daily'
    __page_name__ = 'biometric_mental_daily'
    __title__ = 'Ментальные показатели (ежедневно)'
    _abstract = False

    fields = [
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('focus', FieldType.INTEGER, label='Фокус (1-10)'),
        Field('attention', FieldType.INTEGER, label='Внимание (1-10)'),
        Field('thinking_speed', FieldType.INTEGER, label='Быстрота мышления (1-10)'),
        Field('energy', FieldType.INTEGER, label='Энергия (1-10)'),
        Field('mood', FieldType.INTEGER, label='Настроение (1-10)'),
        Field('thinking_type', FieldType.STRING, label='Тип мышления',
              choices=['творческий', 'аналитический', 'практический', 'социальный', 'смешанный']),
        Field('notes', FieldType.TEXT, label='Примечания'),
    ]

class CognitiveTest(Entity):
    __tablename__ = 'biometric_cognitive_tests'
    __page_name__ = 'biometric_cognitive_tests'
    __title__ = 'Когнитивные тесты'
    _abstract = False

    fields = [
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('test_name', FieldType.STRING, required=True, label='Название теста'),
        Field('score', FieldType.FLOAT, required=True, label='Результат'),
        Field('notes', FieldType.TEXT, label='Примечания'),
    ]

def fill_missing_activity_data(db):
    conn = db.get_conn()
    cursor = conn.cursor()

    # Получаем все записи, отсортированные от новых к старым
    cursor.execute("""
        SELECT id, activity_type, notes, calories_per_unit, date
        FROM biometric_physical_activity
        ORDER BY date DESC, id DESC
    """)
    rows = cursor.fetchall()

    type_cal_source = {}   # activity_type -> calories_per_unit
    type_notes_source = {} # activity_type -> notes

    for row in rows:
        act_type = row[1]
        notes = row[2]
        cal = row[3]

        # Запоминаем первый попавшийся (самый свежий) ненулевой калораж
        if act_type not in type_cal_source and cal is not None and cal > 0:
            type_cal_source[act_type] = cal

        # Запоминаем первый попавшийся непустой notes
        if act_type not in type_notes_source and notes and notes.strip():
            type_notes_source[act_type] = notes

    updates = []
    for row in rows:
        act_type = row[1]
        notes = row[2]
        cal = row[3]
        new_notes = notes
        new_cal = cal
        need_update = False

        # Если notes пуст и есть источник
        if (notes is None or notes.strip() == '') and act_type in type_notes_source:
            new_notes = type_notes_source[act_type]
            need_update = True

        # Если калораж = 0 или NULL и есть источник
        if (cal is None or cal == 0) and act_type in type_cal_source:
            new_cal = type_cal_source[act_type]
            need_update = True

        if need_update:
            updates.append((new_notes, new_cal, row[0]))

    if updates:
        cursor.executemany("""
            UPDATE biometric_physical_activity
            SET notes = ?, calories_per_unit = ?
            WHERE id = ?
        """, updates)
        conn.commit()
        print(f"[INFO] Обновлено {len(updates)} записей активности")
    else:
        print("[INFO] Нет записей, требующих обновления")

    print("Источники калорий:", type_cal_source)
    print("Источники заметок:", type_notes_source)
    conn.close()