from app import app
from core.db import Database

db = Database()
conn = db.get_conn()
cur = conn.cursor()
cur.execute("DELETE FROM biometric_physical_activity WHERE date='2026-03-27'")
cur.execute("DELETE FROM biometric_activity_log WHERE date='2026-03-27'")
conn.commit(); conn.close()

client = app.test_client()

for q in [20, 25, 30]:
    r = client.post('/api/biometric/activity/save', json={'date': '2026-03-27', 'activity_type': 'Приседания', 'quantity': q, 'intensity': 5, 'notes': 'тест'})
    print('save', q, r.status_code, r.get_json())
    r = client.post('/api/biometric/activity/log/toggle', json={'date': '2026-03-27', 'activity_type': 'Приседания', 'quantity': q, 'completed': True})
    print('toggle', q, r.status_code, r.get_json())

r = client.get('/api/biometric/activity/log?date=2026-03-27')
print('log', r.get_json())
r = client.get('/api/biometric_physical_activity/list?date=2026-03-27')
print('phys', r.get_json())
