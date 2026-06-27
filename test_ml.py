from app import app
from core.db import Database

db = Database()
conn = db.get_conn()
cur = conn.cursor()
cur.execute('INSERT INTO biometric_physical_activity (date, activity_type, quantity) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)', 
            ('2026-03-20', 'Приседания', 10),
            ('2026-03-21', 'Приседания', 12),
            ('2026-03-22', 'Приседания', 15),
            ('2026-03-23', 'Приседания', 18),
            ('2026-03-24', 'Приседания', 20),
            ('2026-03-25', 'Приседания', 22),
            ('2026-03-26', 'Приседания', 25))
conn.commit()
conn.close()

client = app.test_client()
r = client.get('/api/biometric/activity/predict/Приседания')
print(r.status_code, r.get_json())