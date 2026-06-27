"""
Работа с SQLite: создание таблиц, CRUD, выполнение запросов.
"""

# core/db.py (updated)
import sqlite3
import logging
from datetime import datetime
from .models import Entity, FieldType, Field, EntityMeta   # <-- added EntityMeta

logger = logging.getLogger(__name__)

class Database:
    def __init__(self, db_path='habits.db'):
        self.db_path = db_path
        self._init_tables()

    def _init_tables(self):
        print("[DEBUG] EntityMeta._entities:", list(EntityMeta._entities.keys()))
        conn = self.get_conn()
        cursor = conn.cursor()
        for entity_cls in EntityMeta._entities.values():
            print(f"[DEBUG] Creating/migrating table for {entity_cls.__tablename__}")
            self._create_or_migrate_table(entity_cls, cursor)
        conn.commit()
        conn.close()

    def _create_or_migrate_table(self, entity_cls, cursor):
        if entity_cls.__tablename__ is None:
            return
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (entity_cls.__tablename__,))
        exists = cursor.fetchone()
        if not exists:
            self._create_table(entity_cls, cursor)
        else:
            # Check for migrations
            self._migrate_table(entity_cls, cursor)

    def _migrate_table(self, entity_cls, cursor):
        # Get current columns
        cursor.execute(f"PRAGMA table_info({entity_cls.__tablename__})")
        current_cols = {row[1]: row[2] for row in cursor.fetchall()}  # name: type

        # Check for PhysicalActivity specific migration
        if entity_cls.__tablename__ == 'biometric_physical_activity':
            if 'duration_minutes' in current_cols and 'quantity' not in current_cols:
                print(f"[DEBUG] Migrating {entity_cls.__tablename__}: renaming duration_minutes to quantity")
                # Rename column (SQLite way: create new table, copy data, drop old)
                cursor.execute(f"""
                    CREATE TABLE {entity_cls.__tablename__}_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        date TEXT NOT NULL,
                        activity_type TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        intensity INTEGER,
                        notes TEXT
                    )
                """)
                cursor.execute(f"""
                    INSERT INTO {entity_cls.__tablename__}_new (id, date, activity_type, quantity, intensity, notes)
                    SELECT id, date, activity_type, duration_minutes, intensity, notes FROM {entity_cls.__tablename__}
                """)
                cursor.execute(f"DROP TABLE {entity_cls.__tablename__}")
                cursor.execute(f"ALTER TABLE {entity_cls.__tablename__}_new RENAME TO {entity_cls.__tablename__}")
                print(f"[DEBUG] Migration completed for {entity_cls.__tablename__}")
                cursor.execute(f"PRAGMA table_info({entity_cls.__tablename__})")
                current_cols = {row[1]: row[2] for row in cursor.fetchall()}

        # Add any new columns that are present in the entity definition but missing from the table
        missing_fields = [field for field in entity_cls.fields if field.name not in current_cols]
        for field in missing_fields:
            col_def = f"{field.name} {field.to_sql_type()}"
            if field.default is not None:
                default_val = field.default() if callable(field.default) else field.default
                if isinstance(default_val, str):
                    default_literal = default_val.replace("'", "''")
                    col_def += f" DEFAULT '{default_literal}'"
                elif isinstance(default_val, bool):
                    col_def += f" DEFAULT {1 if default_val else 0}"
                else:
                    col_def += f" DEFAULT {default_val}"
            elif field.required:
                print(f"[DEBUG] Adding nullable required field {field.name} to {entity_cls.__tablename__} because SQLite cannot add NOT NULL without default")
            cursor.execute(f"ALTER TABLE {entity_cls.__tablename__} ADD COLUMN {col_def}")
            print(f"[DEBUG] Added missing column {field.name} to {entity_cls.__tablename__}")

    def _create_table(self, entity_cls, cursor):
        if entity_cls.__tablename__ is None:
            return
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (entity_cls.__tablename__,))
        if cursor.fetchone():
            print(f"[DEBUG] Table {entity_cls.__tablename__} already exists")
            return
        cols = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
        for field in entity_cls.fields:
            sql_type = field.to_sql_type()
            col_def = f"{field.name} {sql_type}"
            if field.required:
                col_def += " NOT NULL"
            cols.append(col_def)
        create_sql = f"CREATE TABLE {entity_cls.__tablename__} ({', '.join(cols)})"
        print(f"[DEBUG] Executing: {create_sql}")
        cursor.execute(create_sql)
        print(f"[DEBUG] Created table {entity_cls.__tablename__}")

    def ensure_tables(self):
        """Публичный метод для создания таблиц (можно вызвать после регистрации сущностей)."""
        self._init_tables()

    def get_conn(self):
        """Возвращает соединение с БД."""
        return sqlite3.connect(self.db_path)

    def insert(self, entity):
        """Вставляет сущность в БД. Возвращает ID."""
        conn = self.get_conn()
        cursor = conn.cursor()
        fields = [f.name for f in entity.fields]
        values = []
        placeholders = []
        for f in entity.fields:
            val = entity._data.get(f.name)
            values.append(f.to_db(val))
            placeholders.append('?')
        sql = f"INSERT INTO {entity.__tablename__} ({', '.join(fields)}) VALUES ({', '.join(placeholders)})"
        cursor.execute(sql, values)
        entity._id = cursor.lastrowid
        conn.commit()
        conn.close()
        return entity._id

    def update(self, entity):
        """Обновляет существующую сущность."""
        conn = self.get_conn()
        cursor = conn.cursor()
        set_clause = ', '.join([f"{f.name}=?" for f in entity.fields])
        values = [f.to_db(entity._data.get(f.name)) for f in entity.fields]
        values.append(entity._id)
        sql = f"UPDATE {entity.__tablename__} SET {set_clause} WHERE id=?"
        cursor.execute(sql, values)
        conn.commit()
        conn.close()

    def delete(self, entity_cls, id):
        """Удаляет запись по ID."""
        conn = self.get_conn()
        cursor = conn.cursor()
        cursor.execute(f"DELETE FROM {entity_cls.__tablename__} WHERE id=?", (id,))
        conn.commit()
        conn.close()

    def get(self, entity_cls, id):
        """Возвращает сущность по ID."""
        conn = self.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {entity_cls.__tablename__} WHERE id=?", (id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return entity_cls.from_row(dict(row))
        return None

    def commit(self):
        """No-op: each execute already commits."""
        pass

    def list(self, entity_cls, filters=None, order_by=None, limit=None, offset=None):
        """Возвращает список сущностей с фильтрацией."""
        conn = self.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        sql = f"SELECT * FROM {entity_cls.__tablename__}"
        params = []
        if filters:
            conditions = []
            for key, value in filters.items():
                conditions.append(f"{key}=?")
                params.append(value)
            sql += " WHERE " + " AND ".join(conditions)
        if order_by:
            sql += f" ORDER BY {order_by}"
        if limit:
            sql += f" LIMIT {limit}"
        if offset:
            sql += f" OFFSET {offset}"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        conn.close()
        return [entity_cls.from_row(dict(row)) for row in rows]

    def count(self, entity_cls, filters=None):
        """Возвращает количество записей."""
        conn = self.get_conn()
        cursor = conn.cursor()
        sql = f"SELECT COUNT(*) FROM {entity_cls.__tablename__}"
        params = []
        if filters:
            conditions = []
            for key, value in filters.items():
                conditions.append(f"{key}=?")
                params.append(value)
            sql += " WHERE " + " AND ".join(conditions)
        cursor.execute(sql, params)
        count = cursor.fetchone()[0]
        conn.close()
        return count

    def execute(self, sql, params=None):
        """Выполняет произвольный SQL запрос."""
        conn = self.get_conn()
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        conn.commit()
        conn.close()

    def query(self, sql, params=None):
        """Выполняет SELECT и возвращает список строк как словари."""
        conn = self.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        rows = cursor.fetchall()
        conn.close()
        return rows