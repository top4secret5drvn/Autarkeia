from core.models import Entity, Field, FieldType

class Combination(Entity):
    __tablename__ = 'combinations'
    __page_name__ = 'combinations'
    __title__ = 'Сочетания привычек'
    _abstract = False

    fields = [
        Field('name', FieldType.STRING, label='Название сочетания'),
        Field('habit_a', FieldType.INTEGER, required=True, label='Привычка A'),
        Field('habit_b', FieldType.INTEGER, required=True, label='Привычка B'),
        Field('i', FieldType.FLOAT, default=0.0, label='Бонус I'),
        Field('s', FieldType.FLOAT, default=0.0, label='Бонус S'),
        Field('w', FieldType.FLOAT, default=0.0, label='Бонус W'),
        Field('e', FieldType.FLOAT, default=0.0, label='Бонус E'),
        Field('c', FieldType.FLOAT, default=0.0, label='Бонус C'),
        Field('h', FieldType.FLOAT, default=0.0, label='Бонус H'),
        Field('st', FieldType.FLOAT, default=0.0, label='Бонус ST'),
        Field('money', FieldType.FLOAT, default=0.0, label='Бонус $'),
    ]
