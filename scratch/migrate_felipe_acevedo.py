"""
Migrate Felipe Acevedo Barera's PTO + SICK leave history from Paychex PDFs into Supabase.
- Deletes all existing leave_history rows for Felipe Acevedo
- Inserts each row from the PDFs exactly as-is (no calculations)

PDFs used:
  SICK : EMPLOYEEPTO DETAILS/EMPLOYEE/Felipe Acevedo/Time Off Detail-1775848462277-report.pdf  (MH3880)
  PTO  : EMPLOYEEPTO DETAILS/EMPLOYEE/Felipe Acevedo/Time Off Detail-1775848436682-report.pdf  (MH3880)
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

# ── 1. Locate Felipe Acevedo ─────────────────────────────────────────────────
print("Looking up Felipe Acevedo Barera (MH3880)...")
users = api("GET", "users", params={"select": "id,name,worker_id", "worker_id": "eq.MH3880"})

if not users:
    users = api("GET", "users", params={"select": "id,name,first_name,last_name,worker_id",
                                        "name": "ilike.*Felipe*Acevedo*"})

if not users:
    all_users = api("GET", "users", params={"select": "id,name,first_name,last_name,worker_id"})
    users = [u for u in (all_users or []) if
             "Felipe" in str(u.get("name","")) + str(u.get("first_name","")) and
             "Acevedo" in str(u.get("name","")) + str(u.get("last_name",""))]

if not users:
    print("FATAL: Could not locate Felipe Acevedo Barera. Aborting.")
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
# SICK RECORDS  (PDF: Time Off Detail-1775848462277-report.pdf)
# Format: (ref, date, absent_hours, accrued_hours, carryover_hours, comment)
# absent_hours: positive = hours used (reduces balance)
# NOTE: refs 2816 & 2817 (VOUCHER# 001662) show 0.00 absent in the PDF.
# ═══════════════════════════════════════════════════════════════════════════
SICK_RECORDS = [
    # PAGE 2 (oldest first)
    (2542, "2025-05-05", None,  40.00, None, "ACCRUED THRU 04-30-25"),
    (2566, "2025-05-20", None,   0.00, None, "ACCRUED THRU 05-15-25"),
    (2590, "2025-06-04", None,   0.00, None, "ACCRUED THRU 05-31-25"),
    (2616, "2025-06-18", None,   0.00, None, "ACCRUED THRU 06-15-25"),
    (2638, "2025-06-30",  8.00,  None, None, "VOUCHER# 001577"),
    (2637, "2025-07-03", None,   0.00, None, "ACCRUED THRU 06-30-25"),
    (2660, "2025-07-18", None,   0.00, None, "ACCRUED THRU 07-15-25"),
    (2681, "2025-08-05", None,   0.00, None, "ACCRUED THRU 07-31-25"),
    # PAGE 1
    (2703, "2025-08-20", None,   0.00, None, "ACCRUED THRU 08-15-25"),
    (2724, "2025-09-04", None,   0.00, None, "ACCRUED THRU 08-31-25"),
    (2743, "2025-09-18", None,   0.00, None, "ACCRUED THRU 09-15-25"),
    (2762, "2025-10-03", None,   0.00, None, "ACCRUED THRU 09-30-25"),
    (2787, "2025-10-20", None,   0.00, None, "ACCRUED THRU 10-15-25"),
    (2816, "2025-10-29",  0.00,  None, None, "VOUCHER# 001662"),   # 0 hrs absent per PDF
    (2817, "2025-10-30",  0.00,  None, None, "VOUCHER# 001662"),   # 0 hrs absent per PDF
    (2815, "2025-11-05", None,   0.00, None, "ACCRUED THRU 10-31-25"),
    (2845, "2025-11-20", None,   0.00, None, "ACCRUED THRU 11-15-25"),
    (2846, "2025-11-12",  8.00,  None, None, "VOUCHER# 001695"),
    (2847, "2025-11-13",  8.00,  None, None, "VOUCHER# 001695"),
    (2874, "2025-12-05", None,   0.00, None, "ACCRUED THRU 11-30-25"),
    (2902, "2025-12-19", None,   0.00, None, "ACCRUED THRU 12-15-25"),
    (2930, "2025-12-19",  8.00,  None, None, "VOUCHER# 001728"),
    (2929, "2026-01-05", None,   0.00, None, "ACCRUED THRU 12-31-25"),
    (2971, "2026-01-20", None,  40.00, None, "ACCRUED THRU 01-15-26"),
    (3003, "2026-02-05", None,   0.00, None, "ACCRUED THRU 01-31-26"),
    (3029, "2026-02-20", None,   0.00, None, "ACCRUED THRU 02-15-26"),
    (3056, "2026-03-05", None,   0.00, None, "ACCRUED THRU 02-28-26"),
    (3085, "2026-03-20", None,   0.00, None, "ACCRUED THRU 03-15-26"),
    (3112, "2026-04-03", None,   0.00, None, "ACCRUED THRU 03-31-26"),
]

# ═══════════════════════════════════════════════════════════════════════════
# PTO RECORDS  (PDF: Time Off Detail-1775848436682-report.pdf)
# Format: (ref, date, absent_hours, accrued_hours, carryover_hours, comment)
# NOTE: ref 2969 (12/31/2025) CARRYOVER = +4.00 (hours carried over, increases balance).
#       ref 2723 (08/31/2025) absent -8.00 in PDF → stored as 8.00 (hours used).
#       ref 2901 (12/15/2025) absent -8.00 in PDF → stored as 8.00 (hours used).
# ═══════════════════════════════════════════════════════════════════════════
PTO_RECORDS = [
    # PAGE 2 (oldest first)
    (2541, "2025-05-05", None,  1.67, None,  "ACCRUED THRU 04-30-25"),
    (2565, "2025-05-20", None,  1.67, None,  "ACCRUED THRU 05-15-25"),
    (2589, "2025-06-04", None,  1.67, None,  "ACCRUED THRU 05-31-25"),
    (2615, "2025-06-18", None,  1.67, None,  "ACCRUED THRU 06-15-25"),
    (2636, "2025-07-03", None,  1.67, None,  "ACCRUED THRU 06-30-25"),
    (2659, "2025-07-18", None,  1.67, None,  "ACCRUED THRU 07-15-25"),
    (2680, "2025-08-05", None,  1.67, None,  "ACCRUED THRU 07-31-25"),
    # PAGE 1
    (2702, "2025-08-20", None,  1.67, None,  "ACCRUED THRU 08-15-25"),
    (2723, "2025-08-31",  8.00, None, None,  "VOUCHER# 001608"),
    (2722, "2025-09-04", None,  1.67, None,  "ACCRUED THRU 08-31-25"),
    (2742, "2025-09-18", None,  1.67, None,  "ACCRUED THRU 09-15-25"),
    (2761, "2025-10-03", None,  0.83, None,  "ACCRUED THRU 09-30-25"),
    (2786, "2025-10-20", None,  0.83, None,  "ACCRUED THRU 10-15-25"),
    (2814, "2025-11-05", None,  0.83, None,  "ACCRUED THRU 10-31-25"),
    (2844, "2025-11-20", None,  0.81, None,  "ACCRUED THRU 11-15-25"),
    (2873, "2025-12-05", None,  0.00, None,  "ACCRUED THRU 11-30-25"),
    (2901, "2025-12-15",  8.00, None, None,  "VOUCHER# 001717"),
    (2900, "2025-12-19", None,  0.00, None,  "ACCRUED THRU 12-15-25"),
    (2969, "2025-12-31", None,  None, 4.00,  "CARRYOVER 12-31-25"),
    (2928, "2026-01-05", None,  0.00, None,  "ACCRUED THRU 12-31-25"),
    (2970, "2026-01-20", None,  0.83, None,  "ACCRUED THRU 01-15-26"),
    (3002, "2026-02-05", None,  0.83, None,  "ACCRUED THRU 01-31-26"),
    (3028, "2026-02-20", None,  0.83, None,  "ACCRUED THRU 02-15-26"),
    (3055, "2026-03-05", None,  0.83, None,  "ACCRUED THRU 02-28-26"),
    (3084, "2026-03-20", None,  0.83, None,  "ACCRUED THRU 03-15-26"),
    (3111, "2026-04-03", None,  0.83, None,  "ACCRUED THRU 03-31-26"),
]

# ── 3. Insert SICK then PTO ──────────────────────────────────────────────────
print("\n--- SICK ---")
sick_balance = insert_records(USER_ID, SICK_RECORDS, "sick")

print("\n--- PTO ---")
pto_balance = insert_records(USER_ID, PTO_RECORDS, "pto")

print(f"\nAll done for Felipe Acevedo Barera.")
print(f"  Final SICK balance : {sick_balance:.4f} hrs")
print(f"  Final PTO  balance : {pto_balance:.4f} hrs")
