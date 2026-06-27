from core.models import Entity, Field, FieldType

class Idea(Entity):
    __tablename__ = 'ideas'
    __page_name__ = 'ideas'
    __title__ = 'Идеи'
    _abstract = False

    fields = [
        Field('title', FieldType.STRING, required=True, label='Название'),
        Field('description', FieldType.TEXT, label='Описание'),
        Field('realism', FieldType.INTEGER, default=5, label='Реалистичность (1-10)'),
        Field('related_ids', FieldType.JSON, default=[], label='Связанные идеи (ID)'),
        Field('idea_type', FieldType.STRING, default='own', label='Тип идеи', choices=['own', 'observation']),
        Field('source', FieldType.STRING, label='Источник'),
        Field('problems', FieldType.TEXT, label='Проблемы, которые решает'),
        Field('what_changes', FieldType.TEXT, label='Что изменит внедрение'),
        Field('difficulty', FieldType.STRING, default='background', label='Сложность введения',
              choices=['background', 'initial_control', 'constant_control']),
        Field('is_completed', FieldType.BOOLEAN, default=False, label='Выполнена'),
        Field('i', FieldType.FLOAT, default=0.0, label='I'),
        Field('s', FieldType.FLOAT, default=0.0, label='S'),
        Field('w', FieldType.FLOAT, default=0.0, label='W'),
        Field('e', FieldType.FLOAT, default=0.0, label='E'),
        Field('c', FieldType.FLOAT, default=0.0, label='C'),
        Field('h', FieldType.FLOAT, default=0.0, label='H'),
        Field('st', FieldType.FLOAT, default=0.0, label='ST'),
        Field('money', FieldType.FLOAT, default=0.0, label='$'),
    ]