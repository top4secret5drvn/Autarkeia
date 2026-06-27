from core.models import Entity, Field, FieldType

class Goal(Entity):
    __tablename__ = 'goals'
    __page_name__ = 'goals'
    __title__ = 'Цели'
    _abstract = False

    fields = [
        Field('name', FieldType.STRING, required=True, label='Название цели'),
        Field('type', FieldType.STRING, required=True,
              choices=['habit_count', 'habit_streak', 'activity_count', 'substance_count'],
              label='Тип цели'),
        Field('target_key', FieldType.STRING, required=True,
              label='Ключ цели (например, habit:123, activity:бег)'),
        Field('target_count', FieldType.INTEGER, required=True, label='Целевое количество'),
        Field('start_date', FieldType.DATE, required=True, label='Дата начала'),
        Field('end_date', FieldType.DATE, required=True, label='Дата окончания'),
        Field('description', FieldType.TEXT, label='Описание'),
    ]