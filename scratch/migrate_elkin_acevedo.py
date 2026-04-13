"""
Migrate Elkin Acevedo Velasquez's PTO + SICK leave history from Paychex PDFs into Supabase.
- Deletes all existing leave_history rows for Elkin Acevedo
- Inserts each row from the PDFs exactly as-is (no calculations)

PDFs used:
  SICK : Time Off Detail-1775848588139-report.pdf  (MH1680)
  PTO  : Time Off Detail-1775848575779-report.pdf  (MH1680)
"""

import requests

SUPABASE_URL = "https://msmqgxtexgratpneaamu.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbXFneHRleGdyYXRwbmVhYW11Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQ0Mzc4MCwiZXhwIjoyMDg1MDE5NzgwfQ.GbI5H8VxhJC1_dkrnTmLJqn380GhYelkx7QNdh5nLIU"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def api(method, path, **kwargs):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = requests.request(method, url, headers=HEADERS, **kwargs)
    if not r.ok:
        print(f"  ERROR {r.status_code}: {r.text[:300]}")
        return None
    return r.json() if r.text else []

def insert_records(user_id, records, leave_type):
    records.sort(key=lambda r: (r[1], r[0]))
    balance = 0.0
    rows = []
    for ref, date, absent, accrued, carryover, comment in records:
        if carryover is not None:
            balance += carryover
            earned = carryover if carryover > 0 else None
            used   = abs(carryover) if carryover < 0 else None
        elif absent is not None:
            balance -= absent
            earned, used = None, absent
        elif accrued is not None:
            balance += accrued
            earned, used = accrued, None
        else:
            earned = used = None
        rows.append({
            "user_id":      user_id,
            "type":         leave_type,
            "entry_date":   date,
            "description":  f"Ref#{ref} - {comment}",
            "earned_hours": earned,
            "used_hours":   used,
            "balance":      round(balance, 4),
        })
    print(f"  Prepared {len(rows)} rows. Final balance: {balance:.4f} hrs")
    inserted = 0
    for i in range(0, len(rows), 50):
        batch = rows[i:i+50]
        result = api("POST", "leave_history", json=batch)
        if result is not None:
            inserted += len(batch)
            print(f"  Inserted rows {i+1}-{i+len(batch)} OK")
        else:
            print(f"  FAILED rows {i+1}-{i+len(batch)}")
    print(f"  Done: {inserted}/{len(rows)} rows inserted.")
    return balance

# ── 1. Locate Elkin Acevedo ──────────────────────────────────────────────────
print("Looking up Elkin Acevedo Velasquez (MH1680)...")
users = api("GET", "users", params={"select": "id,name,worker_id", "worker_id": "eq.MH1680"})

if not users:
    users = api("GET", "users", params={"select": "id,name,first_name,last_name,worker_id",
                                        "name": "ilike.*Elkin*Acevedo*"})

if not users:
    all_users = api("GET", "users", params={"select": "id,name,first_name,last_name,worker_id"})
    users = [u for u in (all_users or []) if
             "Elkin" in str(u.get("name","")) + str(u.get("first_name","")) and
             "Acevedo" in str(u.get("name","")) + str(u.get("last_name",""))]

if not users:
    print("FATAL: Could not locate Elkin Acevedo Velasquez. Aborting.")
    exit(1)

user    = users[0]
USER_ID = user["id"]
print(f"  Found: {user.get('name') or str(user.get('first_name',''))+' '+str(user.get('last_name',''))} "
      f"| ID={USER_ID} | Worker={user.get('worker_id','')}")

# ── 2. Delete existing leave_history ────────────────────────────────────────
print(f"\nDeleting existing leave_history for {USER_ID}...")
api("DELETE", f"leave_history?user_id=eq.{USER_ID}")
print("  Done.")

# ═══════════════════════════════════════════════════════════════════════════
# SICK RECORDS  (PDF: Time Off Detail-1775848588139-report.pdf)
# Format: (ref, date, absent_hours, accrued_hours, carryover_hours, comment)
# absent_hours: positive = hours used (reduces balance)
#               negative = hours returned/corrected (increases balance)
# ═══════════════════════════════════════════════════════════════════════════
SICK_RECORDS = [
    # PAGE 2 (oldest first)
    (2540, "2025-05-05", None,  40.00, None, "ACCRUED THRU 04-30-25"),
    (2564, "2025-05-20", None,   0.00, None, "ACCRUED THRU 05-15-25"),
    (2588, "2025-06-04", None,   0.00, None, "ACCRUED THRU 05-31-25"),
    (2614, "2025-06-18", None,   0.00, None, "ACCRUED THRU 06-15-25"),
    (2635, "2025-07-03", None,   0.00, None, "ACCRUED THRU 06-30-25"),
    (2658, "2025-07-18", None,   0.00, None, "ACCRUED THRU 07-15-25"),
    (2679, "2025-08-05", None,   0.00, None, "ACCRUED THRU 07-31-25"),
    # PAGE 1
    (2701, "2025-08-20", None,   0.00, None, "ACCRUED THRU 08-15-25"),
    (2721, "2025-09-04", None,   0.00, None, "ACCRUED THRU 08-31-25"),
    (2741, "2025-09-18", None,   0.00, None, "ACCRUED THRU 09-15-25"),
    (2760, "2025-09-30",  8.00,  None, None, "VOUCHER# 001638"),
    (2759, "2025-10-03", None,   0.00, None, "ACCRUED THRU 09-30-25"),
    (2785, "2025-10-20", None,   0.00, None, "ACCRUED THRU 10-15-25"),
    (2812, "2025-10-29",  8.00,  None, None, "VOUCHER# 001661"),
    (2813, "2025-10-30",  4.00,  None, None, "VOUCHER# 001661"),
    (2811, "2025-11-05", None,   0.00, None, "ACCRUED THRU 10-31-25"),
    (2843, "2025-11-20", None,   0.00, None, "ACCRUED THRU 11-15-25"),
    (2872, "2025-12-05", None,   0.00, None, "ACCRUED THRU 11-30-25"),
    (2899, "2025-12-19", None,   0.00, None, "ACCRUED THRU 12-15-25"),
    (2927, "2026-01-05", None,   0.00, None, "ACCRUED THRU 12-31-25"),
    (2968, "2026-01-20", None,  40.00, None, "ACCRUED THRU 01-15-26"),
    (3001, "2026-02-05", None,   0.00, None, "ACCRUED THRU 01-31-26"),
    (3027, "2026-02-20", None,   0.00, None, "ACCRUED THRU 02-15-26"),
    (3054, "2026-03-05", None,   0.00, None, "ACCRUED THRU 02-28-26"),
    (3083, "2026-03-20", None,   0.00, None, "ACCRUED THRU 03-15-26"),
    (3110, "2026-04-03", None,   0.00, None, "ACCRUED THRU 03-31-26"),
]

# ═══════════════════════════════════════════════════════════════════════════
# PTO RECORDS  (PDF: Time Off Detail-1775848575779-report.pdf)
# Format: (ref, date, absent_hours, accrued_hours, carryover_hours, comment)
# NOTE: ref 2740 (09/15/2025) shows +14.65 in HOURS ABSENT in the PDF — this
#       is a positive value, meaning hours returned/corrected (stored as -14.65
#       so balance -= (-14.65) increases the balance).
#       ref 2720 (08/31/2025) shows -14.65 — hours used, stored as 14.65.
#       ref 2898 (12/15/2025) shows -32.00 — hours used, stored as 32.00.
#       ref 2966 (12/31/2025) CARRYOVER = -20.00 (hours forfeited at year-end).
# ═══════════════════════════════════════════════════════════════════════════
PTO_RECORDS = [
    # PAGE 2 (oldest first)
    (2539, "2025-05-05", None,   1.67, None,   "ACCRUED THRU 04-30-25"),
    (2563, "2025-05-20", None,   1.67, None,   "ACCRUED THRU 05-15-25"),
    (2587, "2025-06-04", None,   1.67, None,   "ACCRUED THRU 05-31-25"),
    (2613, "2025-06-15",  8.00,  None, None,   "VOUCHER# 001566"),
    (2612, "2025-06-18", None,   1.67, None,   "ACCRUED THRU 06-15-25"),
    (2634, "2025-07-03", None,   1.67, None,   "ACCRUED THRU 06-30-25"),
    (2657, "2025-07-18", None,   1.67, None,   "ACCRUED THRU 07-15-25"),
    (2678, "2025-08-05", None,   1.67, None,   "ACCRUED THRU 07-31-25"),
    # PAGE 1
    (2700, "2025-08-20", None,   1.67, None,   "ACCRUED THRU 08-15-25"),
    (2720, "2025-08-31", 14.65,  None, None,   "VOUCHER# 001607"),
    (2719, "2025-09-04", None,   1.67, None,   "ACCRUED THRU 08-31-25"),
    (2740, "2025-09-15", -14.65, None, None,   "VOUCHER# 001631"),  # positive in PDF = hours returned
    (2739, "2025-09-18", None,   1.67, None,   "ACCRUED THRU 09-15-25"),
    (2758, "2025-10-03", None,   0.83, None,   "ACCRUED THRU 09-30-25"),
    (2784, "2025-10-20", None,   0.83, None,   "ACCRUED THRU 10-15-25"),
    (2810, "2025-11-05", None,   0.83, None,   "ACCRUED THRU 10-31-25"),
    (2842, "2025-11-20", None,   0.81, None,   "ACCRUED THRU 11-15-25"),
    (2871, "2025-12-05", None,   0.00, None,   "ACCRUED THRU 11-30-25"),
    (2898, "2025-12-15", 32.00,  None, None,   "VOUCHER# 001716"),
    (2897, "2025-12-19", None,   0.00, None,   "ACCRUED THRU 12-15-25"),
    (2966, "2025-12-31", None,   None, -20.00, "CARRYOVER 12-31-25"),
    (2926, "2026-01-05", None,   0.00, None,   "ACCRUED THRU 12-31-25"),
    (2967, "2026-01-20", None,   0.83, None,   "ACCRUED THRU 01-15-26"),
    (3000, "2026-02-05", None,   0.83, None,   "ACCRUED THRU 01-31-26"),
    (3026, "2026-02-20", None,   0.83, None,   "ACCRUED THRU 02-15-26"),
    (3053, "2026-03-05", None,   0.83, None,   "ACCRUED THRU 02-28-26"),
    (3082, "2026-03-20", None,   0.83, None,   "ACCRUED THRU 03-15-26"),
    (3109, "2026-04-03", None,   0.83, None,   "ACCRUED THRU 03-31-26"),
]

# ── 3. Insert SICK then PTO ──────────────────────────────────────────────────
print("\n--- SICK ---")
sick_balance = insert_records(USER_ID, SICK_RECORDS, "sick")

print("\n--- PTO ---")
pto_balance = insert_records(USER_ID, PTO_RECORDS, "pto")

print(f"\nAll done for Elkin Acevedo Velasquez.")
print(f"  Final SICK balance : {sick_balance:.4f} hrs")
print(f"  Final PTO  balance : {pto_balance:.4f} hrs")
