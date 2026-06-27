from core.models import Entity, Field, FieldType

class Completion(Entity):
    __tablename__ = 'completions'
    __page_name__ = 'completions'
    __title__ = 'Завершения'
    _abstract = False

    fields = [
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('day_number', FieldType.INTEGER, required=True, label='Номер дня'),
        Field('state', FieldType.STRING, label='Состояние', choices=['WORK', 'VAC', 'SICK', 'OTHER']),
        Field('thoughts', FieldType.TEXT, label='Мысли дня'),
        Field('tasks_json', FieldType.JSON, label='Данные задач', default={}),
        Field('friction_index', FieldType.INTEGER, label='Индекс трения', default=1),
        Field('totals', FieldType.JSON, label='Сумма характеристик', default={}),
    ]
