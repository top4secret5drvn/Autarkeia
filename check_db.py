#!/usr/bin/env python3
"""Проверка содержимого БД - детальный анализ"""

import sqlite3
from datetime import date
import os

db_path = 'habits.db'

# Проверим존재ет ли файл
if not os.path.exists(db_path):
    print(f"❌ БД файл не найден: {db_path}")
    exit(1)

print(f"✅ БД файл найден: {db_path}")
print(f"   Размер: {os.path.getsize(db_path)} байт")

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("\n" + "="*60)
print("📋 ТАБЛИЦЫ В БД")
print("="*60)

cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
tables = cursor.fetchall()
if tables:
    for i, table in enumerate(tables, 1):
        table_name = table[0]
        cursor.execute(f"SELECT COUNT(*) as cnt FROM {table_name}")
        count = cursor.fetchone()['cnt']
        print(f"{i:2}. {table_name:30} - {count} записей")
else:
    print("   (нет таблиц)")

print("\n" + "="*60)
print("📊 COMPLETIONS (Дни)")
print("="*60)

cursor.execute("SELECT * FROM completions ORDER BY date DESC LIMIT 20")
rows = cursor.fetchall()
if rows:
    cols = [desc[0] for desc in cursor.description]
    print(f"Столбцы: {cols}")
    print(f"Всего записей: {len(rows)} (показано последние 20)")
    for row in rows:
        d = dict(row)
        print(f"  ID: {d['id']:3}, Date: {d['date']:12}, Day: {d['day_number']:3}, State: {d['state']:6}")
else:
    print("  ❌ НЕТ ДАННЫХ! Это может быть причина проблемы.")

print("\n" + "="*60)
print("📝 COMPLETION_HABITS (Привычки в днях)")
print("="*60)

cursor.execute("SELECT * FROM completion_habits ORDER BY completion_id DESC LIMIT 20")
rows = cursor.fetchall()
if rows:
    cols = [desc[0] for desc in cursor.description]
    print(f"Столбцы (первые 8): {cols[:8]}")
    print(f"Всего записей: {len(rows)} (показано последние 20)")
    for row in rows:
        d = dict(row)
        print(f"  ID: {d['id']:3}, Compl_ID: {d['completion_id']:3}, Name: {d['name']:30}, Success: {d['success']}")
else:
    print("  ❌ НЕТ ДАННЫХ! Привычки не сохранены.")

print("\n" + "="*60)
print("🔍 ТЕСТ: Поиск completions за СЕГОДНЯ")
print("="*60)

today = date.today().isoformat()
print(f"Сегодняшняя дата: {today}")
cursor.execute("SELECT id, date, day_number FROM completions WHERE date = ?", (today,))
rows = cursor.fetchall()
if rows:
    print(f"✅ Найдено {len(rows)} completions за сегодня:")
    for row in rows:
        print(f"   ID: {row['id']}, Date: {row['date']}, Day: {row['day_number']}")
else:
    print(f"❌ Не найдено completions за {today}")
    # Показать какие даты есть в БД
    cursor.execute("SELECT DISTINCT date FROM completions ORDER BY date DESC LIMIT 10")
    dates = cursor.fetchall()
    if dates:
        print(f"\n   Доступные даты в БД (последние 10):")
        for d in dates:
            print(f"     - {d['date']}")
    else:
        print("   И вообще нет никаких дат в БД!")

print("\n" + "="*60)
print("📈 СТАТИСТИКА")
print("="*60)

cursor.execute("SELECT COUNT(*) as cnt FROM completions")
comp_count = cursor.fetchone()['cnt']
cursor.execute("SELECT COUNT(*) as cnt FROM completion_habits")
habit_count = cursor.fetchone()['cnt']

print(f"Всего Completions: {comp_count}")
print(f"Всего Completion_Habits: {habit_count}")

if comp_count > 0 and habit_count == 0:
    print("\n⚠️ WARNING: Есть completions но нет привычек!")
elif comp_count == 0 and habit_count > 0:
    print("\n⚠️ WARNING: Есть привычки но нет completions!")
elif comp_count == 0 and habit_count == 0:
    print("\n⚠️ ПРОБЛЕМА: БД пустая! Нужно сохранить данные.")
else:
    avg_habits = habit_count / comp_count if comp_count > 0 else 0
    print(f"Среднее привычек на день: {avg_habits:.1f}")

conn.close()

print("\n" + "="*60)
print("✔ Анализ завершён")
print("="*60)

