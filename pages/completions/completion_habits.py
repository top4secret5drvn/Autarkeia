from core.models import Entity, Field, FieldType

class CompletionHabits(Entity):
    __tablename__ = 'completion_habits'
    __page_name__ = 'completion_habits'
    __title__ = 'Привычки завершения'
    _abstract = False

    fields = [
        Field('completion_id', FieldType.INTEGER, required=True, label='ID Завершения'),
        Field('habit_id', FieldType.INTEGER, label='ID Привычки'),
        Field('name', FieldType.STRING, required=True, label='Название привычки'),
        Field('category', FieldType.STRING, required=True, label='Категория'),
        Field('success', FieldType.BOOLEAN, required=True, label='Выполнено'),
        Field('quantity', FieldType.FLOAT, label='Количество'),
        Field('unit', FieldType.STRING, label='Единица измерения'),
        Field('i', FieldType.FLOAT, default=0.0, label='Интеллект (I)'),
        Field('s', FieldType.FLOAT, default=0.0, label='Сила (S)'),
        Field('w', FieldType.FLOAT, default=0.0, label='Выносливость (W)'),
        Field('e', FieldType.FLOAT, default=0.0, label='Эмоции (E)'),
        Field('c', FieldType.FLOAT, default=0.0, label='Харизма (C)'),
        Field('hh', FieldType.FLOAT, default=0.0, label='Здоровье (H)'),
        Field('st', FieldType.FLOAT, default=0.0, label='Стабильность (ST)'),
        Field('money', FieldType.FLOAT, default=0.0, label='Деньги ($)'),
    ]
