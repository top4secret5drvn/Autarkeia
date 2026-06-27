from core.models import Entity, Field, FieldType

class Skill(Entity):
    __tablename__ = 'skills'
    __page_name__ = 'skills'
    __title__ = 'Навыки'
    _abstract = False

    fields = [
        Field('name', FieldType.STRING, required=True, label='Название навыка'),
        Field('total_minutes', FieldType.FLOAT, default=0.0, label='Всего минут'),
        Field('description', FieldType.TEXT, label='Описание'),
    ]

class SkillHabit(Entity):
    __tablename__ = 'skill_habits'
    __page_name__ = 'skill_habits'
    __title__ = 'Привычки навыков'
    _abstract = False

    fields = [
        Field('skill_id', FieldType.INTEGER, required=True, label='ID навыка'),
        Field('habit_id', FieldType.INTEGER, required=True, label='ID привычки'),
        Field('minutes_per_unit', FieldType.FLOAT, default=0.0, label='Минут за единицу'),
    ]