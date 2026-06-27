"""Миграция для добавления таблиц связей между модулями."""

def migrate(db):
    """Создать таблицы для связей между модулями"""
    
    # Таблица: Привычка ↔ Биометрика (убрали UNIQUE)
    db.execute("""
        CREATE TABLE IF NOT EXISTS habit_biometric_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            biometric_type TEXT NOT NULL,
            biometric_id INTEGER,
            bonus_i FLOAT DEFAULT 0,
            bonus_s FLOAT DEFAULT 0,
            bonus_w FLOAT DEFAULT 0,
            bonus_e FLOAT DEFAULT 0,
            bonus_c FLOAT DEFAULT 0,
            bonus_h FLOAT DEFAULT 0,
            bonus_st FLOAT DEFAULT 0,
            bonus_money FLOAT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
        )
    """)
    
    # Таблица: Привычка ↔ Финансы (убрали UNIQUE)
    db.execute("""
        CREATE TABLE IF NOT EXISTS habit_finance_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            finance_type TEXT NOT NULL,
            category_id INTEGER,
            threshold FLOAT DEFAULT 0,
            bonus_i FLOAT DEFAULT 0,
            bonus_s FLOAT DEFAULT 0,
            bonus_w FLOAT DEFAULT 0,
            bonus_e FLOAT DEFAULT 0,
            bonus_c FLOAT DEFAULT 0,
            bonus_h FLOAT DEFAULT 0,
            bonus_st FLOAT DEFAULT 0,
            bonus_money FLOAT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
        )
    """)
    
    # Таблица: Автоматические характеристики от биометрики (без изменений)
    db.execute("""
        CREATE TABLE IF NOT EXISTS biometric_characteristics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            biometric_type TEXT NOT NULL,
            biometric_id INTEGER,
            bonus_i FLOAT DEFAULT 0,
            bonus_s FLOAT DEFAULT 0,
            bonus_w FLOAT DEFAULT 0,
            bonus_e FLOAT DEFAULT 0,
            bonus_c FLOAT DEFAULT 0,
            bonus_h FLOAT DEFAULT 0,
            bonus_st FLOAT DEFAULT 1,
            bonus_money FLOAT DEFAULT 0,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(biometric_type, biometric_id)
        )
    """)
    
    # Таблица: История применённых бонусов (без изменений)
    db.execute("""
        CREATE TABLE IF NOT EXISTS applied_bonuses_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            habit_id INTEGER,
            source_type TEXT,
            bonus_type TEXT,
            bonus_i FLOAT,
            bonus_s FLOAT,
            bonus_w FLOAT,
            bonus_e FLOAT,
            bonus_c FLOAT,
            bonus_h FLOAT,
            bonus_st FLOAT,
            bonus_money FLOAT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Добавить колонку biometric_value в habit_biometric_links, если её нет
    try:
        db.execute("ALTER TABLE habit_biometric_links ADD COLUMN biometric_value TEXT")
        print("✓ Добавлена колонка biometric_value в habit_biometric_links")
    except Exception as e:
        # колонка уже существует
        pass
        
    db.commit()
    print("✓ Таблицы для связей между модулями созданы")