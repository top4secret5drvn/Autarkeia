from core.models import Entity, Field, FieldType

class Habit(Entity):
    __tablename__ = 'habits'
    __page_name__ = 'habits'
    __title__ = 'Справочник привычек'
    _abstract = False

    fields = [
        Field('name', FieldType.STRING, required=True, label='Название'),
        Field('category', FieldType.STRING, label='Категория'),
        Field('default_quantity', FieldType.FLOAT, label='Кол-во по умолчанию'),
        Field('unit', FieldType.STRING, label='Единица'),
        Field('i', FieldType.FLOAT, default=0.0, label='Интеллект (I)'),
        Field('s', FieldType.FLOAT, default=0.0, label='Сила (S)'),
        Field('w', FieldType.FLOAT, default=0.0, label='Выносливость (W)'),
        Field('e', FieldType.FLOAT, default=0.0, label='Эмоции (E)'),
        Field('c', FieldType.FLOAT, default=0.0, label='Харизма (C)'),
        Field('h', FieldType.FLOAT, default=0.0, label='Здоровье (H)'),
        Field('st', FieldType.FLOAT, default=1.0, label='Стабильность (ST)'),
        Field('money', FieldType.FLOAT, default=0.0, label='Деньги ($)'),
    ]
