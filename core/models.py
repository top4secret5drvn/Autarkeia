"""
Базовые классы для декларативного описания сущностей.
"""

from enum import Enum
from datetime import date, datetime
import json

class FieldType(Enum):
    INTEGER = 'INTEGER'
    FLOAT = 'REAL'
    STRING = 'TEXT'
    TEXT = 'TEXT'
    DATE = 'DATE'
    DATETIME = 'DATETIME'
    BOOLEAN = 'BOOLEAN'
    JSON = 'JSON'  # хранится как TEXT, парсится в dict/list

class Field:
    def __init__(self, name, field_type, required=False, default=None, label=None, choices=None, **kwargs):
        self.name = name
        self.field_type = field_type
        self.required = required
        self.default = default
        self.label = label or name.capitalize()
        self.choices = choices  # для STRING: список допустимых значений
        self.kwargs = kwargs    # дополнительные атрибуты (например, min, max)

    def to_sql_type(self):
        """Возвращает тип SQLite."""
        if self.field_type == FieldType.INTEGER:
            return 'INTEGER'
        elif self.field_type == FieldType.FLOAT:
            return 'REAL'
        elif self.field_type == FieldType.BOOLEAN:
            return 'INTEGER'  # 0/1
        elif self.field_type in (FieldType.STRING, FieldType.TEXT, FieldType.JSON):
            return 'TEXT'
        elif self.field_type == FieldType.DATE:
            return 'TEXT'     # храним как YYYY-MM-DD
        elif self.field_type == FieldType.DATETIME:
            return 'TEXT'     # ISO
        else:
            return 'TEXT'

    def from_db(self, value):
        """Преобразовать значение из БД в Python."""
        if value is None:
            return None
        if self.field_type == FieldType.INTEGER:
            return int(value)
        elif self.field_type == FieldType.FLOAT:
            return float(value)
        elif self.field_type == FieldType.BOOLEAN:
            return bool(int(value))
        elif self.field_type == FieldType.DATE:
            if isinstance(value, str):
                return datetime.strptime(value, '%Y-%m-%d').date()
            return value
        elif self.field_type == FieldType.DATETIME:
            if isinstance(value, str):
                return datetime.fromisoformat(value)
            return value
        elif self.field_type == FieldType.JSON:
            if isinstance(value, str):
                return json.loads(value)
            return value
        else:
            return value

    def to_db(self, value):
        """Преобразовать Python-значение для сохранения в БД."""
        if value is None:
            return None
        if self.field_type == FieldType.BOOLEAN:
            return 1 if value else 0
        elif self.field_type == FieldType.DATE:
            if isinstance(value, date):
                return value.isoformat()
            return str(value)
        elif self.field_type == FieldType.DATETIME:
            if isinstance(value, datetime):
                return value.isoformat()
            return str(value)
        elif self.field_type == FieldType.JSON:
            return json.dumps(value, ensure_ascii=False)
        else:
            return value

    def validate(self, value):
        """Валидация значения."""
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return True
        if self.field_type == FieldType.INTEGER:
            try:
                int(value)
            except:
                raise ValueError(f"Field {self.name} must be integer")
        elif self.field_type == FieldType.FLOAT:
            try:
                float(value)
            except:
                raise ValueError(f"Field {self.name} must be number")
        elif self.field_type == FieldType.DATE:
            try:
                if isinstance(value, str):
                    datetime.strptime(value, '%Y-%m-%d')
                elif not isinstance(value, date):
                    raise ValueError
            except:
                raise ValueError(f"Field {self.name} must be date YYYY-MM-DD")
        if self.choices and value not in self.choices:
            raise ValueError(f"Field {self.name} must be one of {self.choices}")
        return True


class EntityMeta(type):
    """Метакласс для автоматической регистрации сущностей."""
    _entities = {}

    def __new__(cls, name, bases, attrs):
        new_class = super().__new__(cls, name, bases, attrs)
        if name != 'Entity' and not getattr(new_class, '_abstract', False):
            # регистрируем
            EntityMeta._entities[new_class.__tablename__] = new_class
        return new_class

class Entity(metaclass=EntityMeta):
    __tablename__ = None
    __page_name__ = None
    __title__ = None
    fields = []  # список Field

    _abstract = True

    def __init__(self, **kwargs):
        self._id = None
        self._data = {}
        for field in self.fields:
            val = kwargs.get(field.name)
            if val is None and field.default is not None:
                if callable(field.default):
                    val = field.default()
                else:
                    val = field.default
            if val is not None:
                field.validate(val)
                self._data[field.name] = val

    @property
    def id(self):
        return self._id

    def __getitem__(self, key):
        if key == 'id':
            return self._id
        return self._data.get(key)

    def __setitem__(self, key, value):
        if key == 'id':
            self._id = value
        else:
            # найти поле
            field = next((f for f in self.fields if f.name == key), None)
            if field:
                field.validate(value)
                self._data[key] = value
            else:
                raise KeyError(f"Unknown field {key}")

    def to_dict(self):
        """Возвращает словарь для JSON."""
        d = {'id': self._id}
        for f in self.fields:
            val = self._data.get(f.name)
            # для JSON приводим к строке, если это date/datetime
            if isinstance(val, (date, datetime)):
                val = val.isoformat()
            d[f.name] = val
        return d

    @classmethod
    def from_row(cls, row):
        """Создать экземпляр из строки SQLite (row – dict или кортеж)."""
        if isinstance(row, dict):
            obj = cls()
            obj._id = row.get('id')
            for f in cls.fields:
                val = row.get(f.name)
                if val is not None:
                    obj._data[f.name] = f.from_db(val)
            return obj
        else:
            # кортеж, нужен порядок колонок
            obj = cls()
            # Предполагаем, что row имеет поля id, затем все поля в порядке объявления
            obj._id = row[0]
            for i, f in enumerate(cls.fields):
                val = row[i+1]
                if val is not None:
                    obj._data[f.name] = f.from_db(val)
            return obj