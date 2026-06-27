from core.models import Entity, Field, FieldType

class Category(Entity):
    __tablename__ = 'finance_categories'
    __page_name__ = 'finance_categories'
    __title__ = 'Категории операций'
    _abstract = False

    fields = [
        Field('name', FieldType.STRING, required=True, label='Название'),
        Field('type', FieldType.STRING, required=True, label='Тип',
              choices=['income', 'expense']),
        Field('is_active', FieldType.BOOLEAN, default=True, label='Активный доход?'),
        Field('color', FieldType.STRING, label='Цвет (hex)'),
    ]

class Transaction(Entity):
    __tablename__ = 'finance_transactions'
    __page_name__ = 'finance_transactions'
    __title__ = 'Операции'
    _abstract = False

    fields = [
        Field('date', FieldType.DATE, required=True, label='Дата'),
        Field('category_id', FieldType.INTEGER, required=True, label='Категория'),
        Field('amount', FieldType.FLOAT, required=True, label='Сумма'),
        Field('description', FieldType.TEXT, label='Описание'),
    ]