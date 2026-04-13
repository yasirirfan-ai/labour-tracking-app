"""
Migrate Sandra Bonilla's PTO history from BambooHR PDF into Supabase.
- Deletes all existing leave_history rows for Sandra Bonilla
- Inserts each row from the PDF exactly as-is (no calculations)
"""

import requests
import json

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

# ── 1. Find Sandra Bonilla's user ID ────────────────────────────────────────
print("Looking up Sandra Bonilla...")
users = api("GET", "users", params={"select": "id,name,worker_id", "name": "ilike.*Sandra*Bonilla*"})

# Also try first+last name fields if 'name' didn't match
if not users:
    users = api("GET", "users", params={
        "select": "id,name,first_name,last_name,worker_id",
        "or": "(first_name.ilike.*Sandra*,last_name.ilike.*Bonilla*)"
    })

if not users:
    print("Could not find Sandra Bonilla. Trying broad search...")
    all_users = api("GET", "users", params={"select": "id,name,first_name,last_name,worker_id"})
    users = [u for u in (all_users or []) if
             ('Sandra' in str(u.get('name','')) or 'Sandra' in str(u.get('first_name',''))) and
             ('Bonilla' in str(u.get('name','')) or 'Bonilla' in str(u.get('last_name','')))]

if not users:
    # Try by worker_id from PDF
    users = api("GET", "users", params={"select": "id,name,worker_id", "worker_id": "eq.V30838"})

if not users:
    print("FATAL: Could not locate Sandra Bonilla. Aborting.")
    exit(1)

user = users[0]
USER_ID = user["id"]
print(f"  Found: {user.get('name') or user.get('first_name','')+' '+user.get('last_name','')} | ID={USER_ID} | Worker={user.get('worker_id','')}")

# ── 2. Delete existing leave_history ────────────────────────────────────────
print(f"\nDeleting existing leave_history for {USER_ID}...")
result = api("DELETE", f"leave_history?user_id=eq.{USER_ID}")
print(f"  Done.")

# ── 3. All records from PDF (raw, no calculation) ───────────────────────────
# Format: (ref, date MM/DD/YYYY, type, absent_hours, accrued_hours, carryover_hours, comment)
# Negative hours_absent = time used; positive accrued = earned; carryover can be +/-

RAW_RECORDS = [
    # PAGE 1 (newest first → we'll insert oldest→newest, sorted by date)
    (3121, "2026-04-03", "PTO", None,   2.00,  None, "ACCRUED THRU 03-31-26"),
    (3094, "2026-03-20", "PTO", None,   2.00,  None, "ACCRUED THRU 03-15-26"),
    (3065, "2026-03-05", "PTO", None,   2.00,  None, "ACCRUED THRU 02-28-26"),
    (3038, "2026-02-20", "PTO", None,   2.00,  None, "ACCRUED THRU 02-15-26"),
    (3012, "2026-02-05", "PTO", None,   2.00,  None, "ACCRUED THRU 01-31-26"),
    (2985, "2026-01-20", "PTO", None,   2.00,  None, "ACCRUED THRU 01-15-26"),
    (2939, "2026-01-05", "PTO", None,   0.00,  None, "ACCRUED THRU 12-31-25"),
    (2986, "2026-01-02", "PTO", 8.00,   None,  None, "VOUCHER# 001744"),
    (2984, "2025-12-31", "PTO", None,   None, -44.00,"CARRYOVER 12-31-25"),
    (2948, "2025-12-30", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2947, "2025-12-29", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2946, "2025-12-24", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2945, "2025-12-23", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2944, "2025-12-22", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2943, "2025-12-19", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2911, "2025-12-19", "PTO", None,   0.00,  None, "ACCRUED THRU 12-15-25"),
    (2942, "2025-12-18", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2941, "2025-12-17", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    (2940, "2025-12-16", "PTO", 8.00,   None,  None, "VOUCHER# 001733"),
    # PAGE 2
    (2912, "2025-12-15", "PTO", 8.00,   None,  None, "VOUCHER# 001722"),
    (2883, "2025-12-05", "PTO", None,   0.00,  None, "ACCRUED THRU 11-30-25"),
    (2856, "2025-11-20", "PTO", None,   0.00,  None, "ACCRUED THRU 11-15-25"),
    (2826, "2025-11-05", "PTO", None,   0.00,  None, "ACCRUED THRU 10-31-25"),
    (2827, "2025-10-31", "PTO", 8.00,   None,  None, "VOUCHER# 001667"),
    (2794, "2025-10-20", "PTO", None,   0.00,  None, "ACCRUED THRU 10-15-25"),
    (2771, "2025-10-15", "PTO", 8.00,   None,  None, "VOUCHER# 001646"),
    (2767, "2025-10-03", "PTO", None,   0.00,  None, "ACCRUED THRU 09-30-25"),
    (2744, "2025-09-18", "PTO", None,   4.00,  None, "ACCRUED THRU 09-15-25"),
    (2725, "2025-09-04", "PTO", None,   4.00,  None, "ACCRUED THRU 08-31-25"),
    (2704, "2025-08-20", "PTO", None,   4.00,  None, "ACCRUED THRU 08-15-25"),
    (2705, "2025-08-15", "PTO", 8.00,   None,  None, "VOUCHER# 001602"),
    (2682, "2025-08-05", "PTO", None,   4.00,  None, "ACCRUED THRU 07-31-25"),
    (2661, "2025-07-18", "PTO", None,   4.00,  None, "ACCRUED THRU 07-15-25"),
    (2639, "2025-07-03", "PTO", None,   4.00,  None, "ACCRUED THRU 06-30-25"),
    (2617, "2025-06-18", "PTO", None,   4.00,  None, "ACCRUED THRU 06-15-25"),
    (2591, "2025-06-04", "PTO", None,   4.00,  None, "ACCRUED THRU 05-31-25"),
    (2567, "2025-05-20", "PTO", None,   4.00,  None, "ACCRUED THRU 05-15-25"),
    (2543, "2025-05-05", "PTO", None,   4.00,  None, "ACCRUED THRU 04-30-25"),
    (2517, "2025-04-18", "PTO", None,   4.00,  None, "ACCRUED THRU 04-15-25"),
    (2495, "2025-04-03", "PTO", None,   4.00,  None, "ACCRUED THRU 03-31-25"),
    (2469, "2025-03-19", "PTO", None,   4.00,  None, "ACCRUED THRU 03-15-25"),
    (2442, "2025-03-05", "PTO", None,   4.00,  None, "ACCRUED THRU 02-28-25"),
    (2417, "2025-02-20", "PTO", None,   4.00,  None, "ACCRUED THRU 02-15-25"),
    (2392, "2025-02-05", "PTO", None,   4.00,  None, "ACCRUED THRU 01-31-25"),
    # PAGE 3
    (2364, "2025-01-21", "PTO", None,   4.00,  None, "ACCRUED THRU 01-15-25"),
    (2365, "2025-01-15", "PTO", 18.00,  None,  None, "VOUCHER# 001473"),
    (2333, "2025-01-03", "PTO", None,   4.00,  None, "ACCRUED THRU 12-31-24"),
    (2363, "2024-12-31", "PTO", None,   None,  10.00,"CARRYOVER 12-31-24"),
    (2334, "2024-12-31", "PTO", 32.00,  None,  None, "VOUCHER# 001460"),
    (2310, "2024-12-18", "PTO", None,   4.00,  None, "ACCRUED THRU 12-15-24"),
    (2290, "2024-12-04", "PTO", None,   4.00,  None, "ACCRUED THRU 11-30-24"),
    (2270, "2024-11-20", "PTO", None,   4.00,  None, "ACCRUED THRU 11-15-24"),
    (2250, "2024-11-05", "PTO", None,   4.00,  None, "ACCRUED THRU 10-31-24"),
    (2227, "2024-10-18", "PTO", None,   4.00,  None, "ACCRUED THRU 10-15-24"),
    (2203, "2024-10-03", "PTO", None,   4.00,  None, "ACCRUED THRU 09-30-24"),
    (2204, "2024-09-30", "PTO", 16.00,  None,  None, "VOUCHER# 001416"),
    (2181, "2024-09-18", "PTO", None,   4.00,  None, "ACCRUED THRU 09-15-24"),
    (2157, "2024-09-05", "PTO", None,   4.00,  None, "ACCRUED THRU 08-31-24"),
    (2139, "2024-08-20", "PTO", None,   4.00,  None, "ACCRUED THRU 08-15-24"),
    (2117, "2024-08-05", "PTO", None,   4.00,  None, "ACCRUED THRU 07-31-24"),
    (2092, "2024-07-18", "PTO", None,   4.00,  None, "ACCRUED THRU 07-15-24"),
    (2093, "2024-07-15", "PTO", 12.00,  None,  None, "VOUCHER# 001372"),
    (2066, "2024-07-03", "PTO", None,   4.00,  None, "ACCRUED THRU 06-30-24"),
    (2067, "2024-06-30", "PTO", 5.00,   None,  None, "VOUCHER# 001364"),
    (2036, "2024-06-18", "PTO", None,   4.00,  None, "ACCRUED THRU 06-15-24"),
    (2037, "2024-06-15", "PTO", 8.00,   None,  None, "VOUCHER# 001353"),
    (2008, "2024-06-05", "PTO", None,   4.00,  None, "ACCRUED THRU 05-31-24"),
    (1982, "2024-05-20", "PTO", None,   4.00,  None, "ACCRUED THRU 05-15-24"),
    (1956, "2024-05-03", "PTO", None,   4.00,  None, "ACCRUED THRU 04-30-24"),
    # PAGE 4
    (1827, "2024-02-21", "PTO", None,   4.00,  None, "ACCRUED THRU 02-15-24"),
    (1805, "2024-02-05", "PTO", None,   4.00,  None, "ACCRUED THRU 01-31-24"),
    (1781, "2024-01-18", "PTO", None,   4.00,  None, "ACCRUED THRU 01-15-24"),
    (1782, "2024-01-15", "PTO", 16.00,  None,  None, "VOUCHER# 001247"),
    (1749, "2024-01-04", "PTO", None,   4.00,  None, "ACCRUED THRU 12-31-23"),
    (1780, "2023-12-31", "PTO", None,   None,  3.00, "CARRYOVER 12-31-23"),
    (1750, "2023-12-31", "PTO", 24.00,  None,  None, "VOUCHER# 001231"),
    (1728, "2023-12-20", "PTO", None,   4.00,  None, "ACCRUED THRU 12-15-23"),
    (1706, "2023-12-05", "PTO", None,   4.00,  None, "ACCRUED THRU 11-30-23"),
    (1686, "2023-11-20", "PTO", None,   4.00,  None, "ACCRUED THRU 11-15-23"),
    (1663, "2023-11-03", "PTO", None,   4.00,  None, "ACCRUED THRU 10-31-23"),
    (1664, "2023-10-31", "PTO", 8.00,   None,  None, "VOUCHER# 001199"),
    (1642, "2023-10-18", "PTO", None,   4.00,  None, "ACCRUED THRU 10-15-23"),
    (1622, "2023-10-04", "PTO", None,   4.00,  None, "ACCRUED THRU 09-30-23"),
    (1594, "2023-09-20", "PTO", None,   4.00,  None, "ACCRUED THRU 09-15-23"),
    (1571, "2023-09-05", "PTO", None,   4.00,  None, "ACCRUED THRU 08-31-23"),
    (1572, "2023-08-31", "PTO", 15.00,  None,  None, "VOUCHER# 001152"),
    (1546, "2023-08-18", "PTO", None,   4.00,  None, "ACCRUED THRU 08-15-23"),
    (1547, "2023-08-15", "PTO", 8.00,   None,  None, "VOUCHER# 001144"),
    (1525, "2023-08-03", "PTO", None,   4.00,  None, "ACCRUED THRU 07-31-23"),
    (1526, "2023-07-31", "PTO", 8.00,   None,  None, "VOUCHER# 001123"),
    # PAGE 5
    (1499, "2023-07-19", "PTO", None,   4.00,  None, "ACCRUED THRU 07-15-23"),
    (1500, "2023-07-15", "PTO", 8.00,   None,  None, "VOUCHER# 001115"),
    (1477, "2023-07-05", "PTO", None,   4.00,  None, "ACCRUED THRU 06-30-23"),
    (1457, "2023-06-20", "PTO", None,   4.00,  None, "ACCRUED THRU 06-15-23"),
    (1439, "2023-06-05", "PTO", None,   4.00,  None, "ACCRUED THRU 05-31-23"),
    (1422, "2023-05-18", "PTO", None,   4.00,  None, "ACCRUED THRU 05-15-23"),
    (1405, "2023-05-03", "PTO", None,   4.00,  None, "ACCRUED THRU 04-30-23"),
    (1387, "2023-04-19", "PTO", None,   4.00,  None, "ACCRUED THRU 04-15-23"),
    (1365, "2023-04-05", "PTO", None,   4.00,  None, "ACCRUED THRU 03-31-23"),
    (1366, "2023-03-31", "PTO", 8.00,   None,  None, "VOUCHER# 001061"),
    (1343, "2023-03-20", "PTO", None,   4.00,  None, "ACCRUED THRU 03-15-23"),
    (1321, "2023-03-03", "PTO", None,   4.00,  None, "ACCRUED THRU 02-28-23"),
    (1300, "2023-02-21", "PTO", None,   4.00,  None, "ACCRUED THRU 02-15-23"),
    (1280, "2023-02-03", "PTO", None,   4.00,  None, "ACCRUED THRU 01-31-23"),
    (1252, "2023-01-18", "PTO", None,   4.00,  None, "ACCRUED THRU 01-15-23"),
    (1253, "2023-01-15", "PTO", 32.00,  None,  None, "VOUCHER# 001022"),
    (1222, "2023-01-05", "PTO", None,   4.00,  None, "ACCRUED THRU 12-31-22"),
    (1251, "2022-12-31", "PTO", None,   None,  18.00,"CARRYOVER 12-31-22"),
    (1223, "2022-12-31", "PTO", 24.00,  None,  None, "VOUCHER# 001015"),
    (1196, "2022-12-20", "PTO", None,   4.00,  None, "ACCRUED THRU 12-15-22"),
    (1197, "2022-12-15", "PTO", 32.00,  None,  None, "VOUCHER# 001006"),
    (1169, "2022-12-05", "PTO", None,   4.00,  None, "ACCRUED THRU 11-30-22"),
    (1170, "2022-11-30", "PTO", 8.00,   None,  None, "VOUCHER# 000995"),
    (1144, "2022-11-18", "PTO", None,   4.00,  None, "ACCRUED THRU 11-15-22"),
    (1121, "2022-11-03", "PTO", None,   4.00,  None, "ACCRUED THRU 10-31-22"),
    # PAGE 6
    (1097, "2022-10-19", "PTO", None,   4.00,  None, "ACCRUED THRU 10-15-22"),
    (1072, "2022-10-05", "PTO", None,   4.00,  None, "ACCRUED THRU 09-30-22"),
    (1047, "2022-09-20", "PTO", None,   4.00,  None, "ACCRUED THRU 09-15-22"),
    (1048, "2022-09-15", "PTO", 16.00,  None,  None, "VOUCHER# 000958"),
    (1021, "2022-09-02", "PTO", None,   4.00,  None, "ACCRUED THRU 08-31-22"),
    (1022, "2022-08-31", "PTO", 19.00,  None,  None, "VOUCHER# 000951"),
    ( 998, "2022-08-18", "PTO", None,   4.00,  None, "ACCRUED THRU 08-15-22"),
    ( 973, "2022-08-03", "PTO", None,   4.00,  None, "ACCRUED THRU 07-31-22"),
    ( 974, "2022-07-31", "PTO", 11.00,  None,  None, "VOUCHER# 000937"),
    ( 950, "2022-07-20", "PTO", None,   4.00,  None, "ACCRUED THRU 07-15-22"),
    ( 925, "2022-07-05", "PTO", None,   4.00,  None, "ACCRUED THRU 06-30-22"),
    ( 926, "2022-06-30", "PTO", 16.00,  None,  None, "VOUCHER# 000923"),
    ( 895, "2022-06-17", "PTO", None,   4.00,  None, "ACCRUED THRU 06-15-22"),
    ( 865, "2022-06-03", "PTO", None,   4.00,  None, "ACCRUED THRU 05-31-22"),
    ( 866, "2022-05-31", "PTO", 8.00,   None,  None, "VOUCHER# 000892"),
    ( 833, "2022-05-18", "PTO", None,   4.00,  None, "ACCRUED THRU 05-15-22"),
    ( 799, "2022-05-04", "PTO", None,   4.00,  None, "ACCRUED THRU 04-30-22"),
    ( 769, "2022-04-20", "PTO", None,   4.00,  None, "ACCRUED THRU 04-15-22"),
    ( 739, "2022-04-05", "PTO", None,   4.00,  None, "ACCRUED THRU 03-31-22"),
    ( 702, "2022-03-18", "PTO", None,   4.00,  None, "ACCRUED THRU 03-15-22"),
    ( 690, "2022-03-03", "PTO", None,   4.00,  None, "ACCRUED THRU 02-28-22"),
    ( 679, "2022-02-18", "PTO", None,   4.00,  None, "ACCRUED THRU 02-15-22"),
    ( 667, "2022-02-03", "PTO", None,   4.00,  None, "ACCRUED THRU 01-31-22"),
    ( 657, "2022-01-19", "PTO", None,   4.00,  None, "ACCRUED THRU 01-15-22"),
    ( 642, "2022-01-05", "PTO", None,   4.00,  None, "ACCRUED THRU 12-31-21"),
    # PAGE 7
    ( 656, "2021-12-31", "PTO", None,   None,  56.00,"CARRYOVER 12-31-21"),
    ( 632, "2021-12-20", "PTO", None,   4.00,  None, "ACCRUED THRU 12-15-21"),
    ( 623, "2021-12-03", "PTO", None,   4.00,  None, "ACCRUED THRU 11-30-21"),
    ( 611, "2021-11-18", "PTO", None,   4.00,  None, "ACCRUED THRU 11-15-21"),
    ( 603, "2021-11-03", "PTO", None,   4.00,  None, "ACCRUED THRU 10-31-21"),
    ( 590, "2021-10-20", "PTO", None,   4.00,  None, "ACCRUED THRU 10-15-21"),
    ( 580, "2021-10-05", "PTO", None,   4.00,  None, "ACCRUED THRU 09-30-21"),
    ( 570, "2021-09-20", "PTO", None,   4.00,  None, "ACCRUED THRU 09-15-21"),
    ( 560, "2021-09-03", "PTO", None,   4.00,  None, "ACCRUED THRU 08-31-21"),
    ( 551, "2021-08-18", "PTO", None,   4.00,  None, "ACCRUED THRU 08-15-21"),
    ( 540, "2021-08-04", "PTO", None,   4.00,  None, "ACCRUED THRU 07-31-21"),
    ( 531, "2021-07-20", "PTO", None,   4.00,  None, "ACCRUED THRU 07-15-21"),
    ( 520, "2021-07-02", "PTO", None,   4.00,  None, "ACCRUED THRU 06-30-21"),
    ( 510, "2021-06-18", "PTO", None,   4.00,  None, "ACCRUED THRU 06-15-21"),
    ( 498, "2021-06-03", "PTO", None,   4.00,  None, "ACCRUED THRU 05-31-21"),
    ( 499, "2021-05-31", "PTO", 3.00,   None,  None, "VOUCHER# 000664"),
    ( 484, "2021-05-19", "PTO", None,   4.00,  None, "ACCRUED THRU 05-15-21"),
    ( 485, "2021-05-15", "PTO", 2.00,   None,  None, "VOUCHER# 000636"),
    ( 472, "2021-05-05", "PTO", None,   4.00,  None, "ACCRUED THRU 04-30-21"),
    ( 460, "2021-04-20", "PTO", None,   4.00,  None, "ACCRUED THRU 04-15-21"),
    ( 461, "2021-04-15", "PTO", 8.00,   None,  None, "VOUCHER# 000615"),
    ( 448, "2021-04-05", "PTO", None,   4.00,  None, "ACCRUED THRU 03-31-21"),
    ( 433, "2021-03-18", "PTO", None,   4.00,  None, "ACCRUED THRU 03-15-21"),
    ( 434, "2021-03-15", "PTO", 16.00,  None,  None, "VOUCHER# 000594"),
    ( 421, "2021-03-03", "PTO", None,   4.00,  None, "ACCRUED THRU 02-28-21"),
    # PAGE 8
    ( 409, "2021-02-18", "PTO", None,   4.00,  None, "ACCRUED THRU 02-15-21"),
    ( 410, "2021-02-15", "PTO", 8.00,   None,  None, "VOUCHER# 000566"),
    ( 397, "2021-02-03", "PTO", None,   4.00,  None, "ACCRUED THRU 01-31-21"),
    ( 385, "2021-01-20", "PTO", None,   4.00,  None, "ACCRUED THRU 01-15-21"),
    ( 368, "2021-01-05", "PTO", None,   4.00,  None, "ACCRUED THRU 12-31-20"),
    ( 384, "2020-12-31", "PTO", None,   None,  -3.00,"CARRYOVER 12-31-20"),
    ( 356, "2020-12-18", "PTO", None,   4.00,  None, "ACCRUED THRU 12-15-20"),
    ( 357, "2020-12-15", "PTO", 16.00,  None,  None, "VOUCHER# 000540"),
    ( 344, "2020-12-03", "PTO", None,   4.00,  None, "ACCRUED THRU 11-30-20"),
    ( 345, "2020-11-30", "PTO", 8.00,   None,  None, "VOUCHER# 000534"),
    ( 333, "2020-11-18", "PTO", None,   4.00,  None, "ACCRUED THRU 11-15-20"),
    ( 321, "2020-11-04", "PTO", None,   4.00,  None, "ACCRUED THRU 10-31-20"),
    ( 312, "2020-10-20", "PTO", None,   4.00,  None, "ACCRUED THRU 10-15-20"),
    ( 304, "2020-10-05", "PTO", None,   4.00,  None, "ACCRUED THRU 09-30-20"),
    ( 295, "2020-09-18", "PTO", None,   4.00,  None, "ACCRUED THRU 09-15-20"),
    ( 287, "2020-09-03", "PTO", None,   4.00,  None, "ACCRUED THRU 08-31-20"),
    ( 279, "2020-08-19", "PTO", None,   4.00,  None, "ACCRUED THRU 08-15-20"),
    ( 268, "2020-08-05", "PTO", None,   4.00,  None, "ACCRUED THRU 07-31-20"),
    ( 269, "2020-07-31", "PTO", 16.00,  None,  None, "VOUCHER# 000377"),
    ( 258, "2020-07-20", "PTO", None,   4.00,  None, "ACCRUED THRU 07-15-20"),
    ( 259, "2020-07-15", "PTO", 24.00,  None,  None, "VOUCHER# 000372"),
    ( 249, "2020-07-02", "PTO", None,   4.00,  None, "ACCRUED THRU 06-30-20"),
    ( 240, "2020-06-18", "PTO", None,   4.00,  None, "ACCRUED THRU 06-15-20"),
    ( 241, "2020-06-15", "PTO", 16.00,  None,  None, "VOUCHER# 000362"),
    ( 232, "2020-06-03", "PTO", None,   4.00,  None, "ACCRUED THRU 05-31-20"),
    # PAGE 9
    ( 224, "2020-05-20", "PTO", None,   4.00,  None, "ACCRUED THRU 05-15-20"),
    ( 214, "2020-05-04", "PTO", None,   4.00,  None, "ACCRUED THRU 04-30-20"),
    ( 205, "2020-04-20", "PTO", None,   4.00,  None, "ACCRUED THRU 04-15-20"),
    ( 193, "2020-04-03", "PTO", None,   4.00,  None, "ACCRUED THRU 03-31-20"),
    ( 183, "2020-03-18", "PTO", None,   4.00,  None, "ACCRUED THRU 03-15-20"),
    ( 174, "2020-03-04", "PTO", None,   4.00,  None, "ACCRUED THRU 02-29-20"),
    ( 158, "2020-02-20", "PTO", None,   4.00,  None, "ACCRUED THRU 02-15-20"),
    ( 159, "2020-02-15", "PTO", 16.00,  None,  None, "VOUCHER# 000259"),
    ( 143, "2020-02-05", "PTO", None,   4.00,  None, "ACCRUED THRU 01-31-20"),
    ( 144, "2020-01-31", "PTO", 16.00,  None,  None, "VOUCHER# 000240"),
    ( 130, "2020-01-17", "PTO", None,   4.00,  None, "ACCRUED THRU 01-15-20"),
    ( 117, "2020-01-06", "PTO", None,   4.00,  None, "ACCRUED THRU 12-31-19"),
    ( 129, "2019-12-31", "PTO", None,   None,  13.00,"CARRYOVER 12-31-19"),
    ( 118, "2019-12-31", "PTO", 8.00,   None,  None, "VOUCHER# 000219"),
    ( 108, "2019-12-18", "PTO", None,   4.00,  None, "ACCRUED THRU 12-15-19"),
    ( 101, "2019-12-04", "PTO", None,   4.00,  None, "ACCRUED THRU 11-30-19"),
    ( 102, "2019-11-30", "PTO", 8.00,   None,  None, "VOUCHER# 000208"),
    (  96, "2019-11-20", "PTO", None,   4.00,  None, "ACCRUED THRU 11-15-19"),
    (  89, "2019-11-05", "PTO", None,   4.00,  None, "ACCRUED THRU 10-31-19"),
    (  90, "2019-10-31", "PTO", 7.00,   None,  None, "VOUCHER# 000170"),
    (  83, "2019-10-18", "PTO", None,   4.00,  None, "ACCRUED THRU 10-15-19"),
    (  78, "2019-10-03", "PTO", None,   4.00,  None, "ACCRUED THRU 09-30-19"),
    (  72, "2019-09-18", "PTO", None,   4.00,  None, "ACCRUED THRU 09-15-19"),
    (  65, "2019-09-05", "PTO", None,   4.00,  None, "ACCRUED THRU 08-31-19"),
    (  59, "2019-08-20", "PTO", None,   4.00,  None, "ACCRUED THRU 08-15-19"),
    # PAGE 10
    (  60, "2019-08-15", "PTO", 32.00,  None,  None, "VOUCHER# 000104"),
    (  53, "2019-08-05", "PTO", None,   4.00,  None, "ACCRUED THRU 07-31-19"),
    (  48, "2019-07-18", "PTO", None,   4.00,  None, "ACCRUED THRU 07-15-19"),
    (  41, "2019-07-03", "PTO", None,   4.00,  None, "ACCRUED THRU 06-30-19"),
    (  34, "2019-06-19", "PTO", None,   4.00,  None, "ACCRUED THRU 06-15-19"),
    (  28, "2019-06-05", "PTO", None,   4.00,  None, "ACCRUED THRU 05-31-19"),
    (  21, "2019-05-20", "PTO", None,   4.00,  None, "ACCRUED THRU 05-15-19"),
    (  13, "2019-05-03", "PTO", None,   4.00,  None, "ACCRUED THRU 04-30-19"),
    (   7, "2019-05-02", "PTO", None,   None,  None, "HIRE DATE / OPENING BALANCE"),
]

# Sort oldest → newest
RAW_RECORDS.sort(key=lambda r: (r[1], r[0]))

# ── 4. Compute running balance ───────────────────────────────────────────────
running_balance = 0.0
rows_to_insert = []

for ref, date, code, absent, accrued, carryover, comment in RAW_RECORDS:
    # Determine what this row does to the balance
    if carryover is not None:
        running_balance += carryover
        earned  = carryover if carryover > 0 else None
        used    = abs(carryover) if carryover < 0 else None
        desc    = comment
    elif absent is not None:
        running_balance -= absent
        earned  = None
        used    = absent
        desc    = comment
    elif accrued is not None:
        running_balance += accrued
        earned  = accrued
        used    = None
        desc    = comment
    else:
        earned  = None
        used    = None
        desc    = comment

    rows_to_insert.append({
        "user_id":      USER_ID,
        "type":         "pto",
        "entry_date":   date,
        "description":  f"Ref#{ref} – {desc}",
        "earned_hours": earned,
        "used_hours":   used,
        "balance":      round(running_balance, 2),
    })

print(f"\nPrepared {len(rows_to_insert)} rows. Final balance will be: {running_balance:.2f} hrs")

# ── 5. Insert in batches of 50 ──────────────────────────────────────────────
BATCH = 50
inserted = 0
for i in range(0, len(rows_to_insert), BATCH):
    batch = rows_to_insert[i:i+BATCH]
    result = api("POST", "leave_history", json=batch)
    if result is not None:
        inserted += len(batch)
        print(f"  Inserted rows {i+1}-{i+len(batch)}  OK")
    else:
        print(f"  FAILED on rows {i+1}-{i+len(batch)}")

print(f"\nDone. {inserted}/{len(rows_to_insert)} rows inserted for Sandra Bonilla.")
print(f"Final PTO balance in ledger: {running_balance:.2f} hrs")
