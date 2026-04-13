"""
Migrate Sandra Bonilla's SICK LEAVE history from BambooHR PDF into Supabase.
- Deletes all existing sick leave_history rows for Sandra Bonilla
- Inserts each row from the PDF exactly as-is (no calculations)
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

USER_ID = "546054be-7d6e-463d-bdd7-32336101131a"  # Sandra Bonilla

def api(method, path, **kwargs):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = requests.request(method, url, headers=HEADERS, **kwargs)
    if not r.ok:
        print(f"  ERROR {r.status_code}: {r.text[:300]}")
        return None
    return r.json() if r.text else []

# ── 1. Delete existing SICK leave history only ───────────────────────────────
print("Deleting existing SICK leave_history for Sandra Bonilla...")
api("DELETE", f"leave_history?user_id=eq.{USER_ID}&type=eq.sick")
print("  Done.")

# ── 2. All SICK records from PDF (oldest first) ──────────────────────────────
# Format: (ref, date, absent_hours, accrued_hours, carryover_hours, comment)
RAW_RECORDS = [
    # PAGE 8 (oldest)
    (  8, "2019-05-02", None,  None,   None,  "HIRE DATE / OPENING BALANCE"),
    ( 14, "2019-05-03", None,  64.00,  None,  "ACCRUED THRU 04-30-19"),
    ( 22, "2019-05-20", None,   0.00,  None,  "ACCRUED THRU 05-15-19"),
    ( 29, "2019-06-05", None,   0.00,  None,  "ACCRUED THRU 05-31-19"),
    ( 35, "2019-06-19", None,   0.00,  None,  "ACCRUED THRU 06-15-19"),
    ( 67, "2019-06-20", 24.00,  None,  None,  "VOUCHER# 000106"),
    ( 42, "2019-07-03", None,   0.00,  None,  "ACCRUED THRU 06-30-19"),
    ( 49, "2019-07-18", None,   0.00,  None,  "ACCRUED THRU 07-15-19"),
    ( 54, "2019-08-05", None,   0.00,  None,  "ACCRUED THRU 07-31-19"),
    ( 61, "2019-08-20", None,   0.00,  None,  "ACCRUED THRU 08-15-19"),
    ( 66, "2019-09-05", None,   0.00,  None,  "ACCRUED THRU 08-31-19"),
    ( 73, "2019-09-18", None,   0.00,  None,  "ACCRUED THRU 09-15-19"),
    ( 79, "2019-10-03", None,   0.00,  None,  "ACCRUED THRU 09-30-19"),
    ( 84, "2019-10-18", None,   0.00,  None,  "ACCRUED THRU 10-15-19"),
    ( 91, "2019-11-05", None,   0.00,  None,  "ACCRUED THRU 10-31-19"),
    ( 97, "2019-11-20", None,   0.00,  None,  "ACCRUED THRU 11-15-19"),
    (103, "2019-12-04", None,   0.00,  None,  "ACCRUED THRU 11-30-19"),
    (109, "2019-12-18", None,   0.00,  None,  "ACCRUED THRU 12-15-19"),
    (119, "2020-01-06", None,   0.00,  None,  "ACCRUED THRU 12-31-19"),
    # PAGE 8 cont / PAGE 7
    (131, "2020-01-17", None,  64.00,  None,  "ACCRUED THRU 01-15-20"),
    (145, "2020-02-05", None,   0.00,  None,  "ACCRUED THRU 01-31-20"),
    (160, "2020-02-20", None,   0.00,  None,  "ACCRUED THRU 02-15-20"),
    (175, "2020-03-04", None,   0.00,  None,  "ACCRUED THRU 02-29-20"),
    (184, "2020-03-18", None,   0.00,  None,  "ACCRUED THRU 03-15-20"),
    (194, "2020-04-03", None,   0.00,  None,  "ACCRUED THRU 03-31-20"),
    (206, "2020-04-20", None,   0.00,  None,  "ACCRUED THRU 04-15-20"),
    (215, "2020-05-04", None,   0.00,  None,  "ACCRUED THRU 04-30-20"),
    (225, "2020-05-20", None,   0.00,  None,  "ACCRUED THRU 05-15-20"),
    (233, "2020-06-03", None,   0.00,  None,  "ACCRUED THRU 05-31-20"),
    (242, "2020-06-18", None,   0.00,  None,  "ACCRUED THRU 06-15-20"),
    (251, "2020-06-30", 16.00,  None,  None,  "VOUCHER# 000367"),
    (250, "2020-07-02", None,   0.00,  None,  "ACCRUED THRU 06-30-20"),
    (260, "2020-07-20", None,   0.00,  None,  "ACCRUED THRU 07-15-20"),
    (270, "2020-08-05", None,   0.00,  None,  "ACCRUED THRU 07-31-20"),
    (280, "2020-08-19", None,   0.00,  None,  "ACCRUED THRU 08-15-20"),
    (288, "2020-09-03", None,   0.00,  None,  "ACCRUED THRU 08-31-20"),
    (296, "2020-09-18", None,   0.00,  None,  "ACCRUED THRU 09-15-20"),
    (305, "2020-10-05", None,   0.00,  None,  "ACCRUED THRU 09-30-20"),
    (313, "2020-10-20", None,   0.00,  None,  "ACCRUED THRU 10-15-20"),
    (322, "2020-11-04", None,   0.00,  None,  "ACCRUED THRU 10-31-20"),
    (334, "2020-11-18", None,   0.00,  None,  "ACCRUED THRU 11-15-20"),
    (346, "2020-12-03", None,   0.00,  None,  "ACCRUED THRU 11-30-20"),
    (358, "2020-12-18", None,   0.00,  None,  "ACCRUED THRU 12-15-20"),
    (369, "2021-01-05", None,   0.00,  None,  "ACCRUED THRU 12-31-20"),
    # PAGE 7
    (386, "2021-01-20", None,  64.00,  None,  "ACCRUED THRU 01-15-21"),
    (399, "2021-01-31", 40.00,  None,  None,  "VOUCHER# 000559"),
    (398, "2021-02-03", None,   0.00,  None,  "ACCRUED THRU 01-31-21"),
    (411, "2021-02-18", None,   0.00,  None,  "ACCRUED THRU 02-15-21"),
    (422, "2021-03-03", None,   0.00,  None,  "ACCRUED THRU 02-28-21"),
    (435, "2021-03-18", None,   0.00,  None,  "ACCRUED THRU 03-15-21"),
    (449, "2021-04-05", None,   0.00,  None,  "ACCRUED THRU 03-31-21"),
    (462, "2021-04-20", None,   0.00,  None,  "ACCRUED THRU 04-15-21"),
    (473, "2021-05-05", None,   0.00,  None,  "ACCRUED THRU 04-30-21"),
    (486, "2021-05-19", None,   0.00,  None,  "ACCRUED THRU 05-15-21"),
    (500, "2021-06-03", None,   0.00,  None,  "ACCRUED THRU 05-31-21"),
    (511, "2021-06-18", None,   0.00,  None,  "ACCRUED THRU 06-15-21"),
    (521, "2021-07-02", None,   0.00,  None,  "ACCRUED THRU 06-30-21"),
    (532, "2021-07-20", None,   0.00,  None,  "ACCRUED THRU 07-15-21"),
    (541, "2021-08-04", None,   0.00,  None,  "ACCRUED THRU 07-31-21"),
    (552, "2021-08-18", None,   0.00,  None,  "ACCRUED THRU 08-15-21"),
    (561, "2021-09-03", None,   0.00,  None,  "ACCRUED THRU 08-31-21"),
    (571, "2021-09-20", None,   0.00,  None,  "ACCRUED THRU 09-15-21"),
    (581, "2021-10-05", None,   0.00,  None,  "ACCRUED THRU 09-30-21"),
    (591, "2021-10-20", None,   0.00,  None,  "ACCRUED THRU 10-15-21"),
    (604, "2021-11-03", None,   0.00,  None,  "ACCRUED THRU 10-31-21"),
    (612, "2021-11-18", None,   0.00,  None,  "ACCRUED THRU 11-15-21"),
    (624, "2021-12-03", None,   0.00,  None,  "ACCRUED THRU 11-30-21"),
    (633, "2021-12-20", None,   0.00,  None,  "ACCRUED THRU 12-15-21"),
    # PAGE 6
    (643, "2022-01-05", None,   0.00,  None,  "ACCRUED THRU 12-31-21"),
    (658, "2022-01-19", None,  64.00,  None,  "ACCRUED THRU 01-15-22"),
    (668, "2022-02-03", None,   0.00,  None,  "ACCRUED THRU 01-31-22"),
    (681, "2022-02-15", 8.00,   None,  None,  "VOUCHER# 000813"),
    (680, "2022-02-18", None,   0.00,  None,  "ACCRUED THRU 02-15-22"),
    (691, "2022-03-03", None,   0.00,  None,  "ACCRUED THRU 02-28-22"),
    (704, "2022-03-15", 8.00,   None,  None,  "VOUCHER# 000828"),
    (703, "2022-03-18", None,   0.00,  None,  "ACCRUED THRU 03-15-22"),
    (740, "2022-04-05", None,   0.00,  None,  "ACCRUED THRU 03-31-22"),
    (770, "2022-04-20", None,   0.00,  None,  "ACCRUED THRU 04-15-22"),
    (801, "2022-04-30", 16.00,  None,  None,  "VOUCHER# 000870"),
    (800, "2022-05-04", None,   0.00,  None,  "ACCRUED THRU 04-30-22"),
    (835, "2022-05-15", 24.00,  None,  None,  "VOUCHER# 000883"),
    (834, "2022-05-18", None,   0.00,  None,  "ACCRUED THRU 05-15-22"),
    (867, "2022-06-03", None,   0.00,  None,  "ACCRUED THRU 05-31-22"),
    (897, "2022-06-15", 8.00,   None,  None,  "VOUCHER# 000905"),
    (896, "2022-06-17", None,   0.00,  None,  "ACCRUED THRU 06-15-22"),
    (927, "2022-07-05", None,   0.00,  None,  "ACCRUED THRU 06-30-22"),
    (951, "2022-07-20", None,   0.00,  None,  "ACCRUED THRU 07-15-22"),
    (975, "2022-08-03", None,   0.00,  None,  "ACCRUED THRU 07-31-22"),
    (999, "2022-08-18", None,   0.00,  None,  "ACCRUED THRU 08-15-22"),
    (1023,"2022-09-02", None,   0.00,  None,  "ACCRUED THRU 08-31-22"),
    (1049,"2022-09-20", None,   0.00,  None,  "ACCRUED THRU 09-15-22"),
    (1073,"2022-10-05", None,   0.00,  None,  "ACCRUED THRU 09-30-22"),
    (1098,"2022-10-19", None,   0.00,  None,  "ACCRUED THRU 10-15-22"),
    # PAGE 5
    (1122,"2022-11-03", None,   0.00,  None,  "ACCRUED THRU 10-31-22"),
    (1145,"2022-11-18", None,   0.00,  None,  "ACCRUED THRU 11-15-22"),
    (1171,"2022-12-05", None,   0.00,  None,  "ACCRUED THRU 11-30-22"),
    (1198,"2022-12-20", None,   0.00,  None,  "ACCRUED THRU 12-15-22"),
    (1224,"2023-01-05", None,   0.00,  None,  "ACCRUED THRU 12-31-22"),
    (1255,"2023-01-15", 24.00,  None,  None,  "VOUCHER# 001022"),
    (1254,"2023-01-18", None,  64.00,  None,  "ACCRUED THRU 01-15-23"),
    (1281,"2023-02-03", None,   0.00,  None,  "ACCRUED THRU 01-31-23"),
    (1301,"2023-02-21", None,   0.00,  None,  "ACCRUED THRU 02-15-23"),
    (1322,"2023-03-03", None,   0.00,  None,  "ACCRUED THRU 02-28-23"),
    (1344,"2023-03-20", None,   0.00,  None,  "ACCRUED THRU 03-15-23"),
    (1367,"2023-04-05", None,   0.00,  None,  "ACCRUED THRU 03-31-23"),
    (1388,"2023-04-19", None,   0.00,  None,  "ACCRUED THRU 04-15-23"),
    (1406,"2023-05-03", None,   0.00,  None,  "ACCRUED THRU 04-30-23"),
    (1424,"2023-05-15", 8.00,   None,  None,  "VOUCHER# 001081"),
    (1423,"2023-05-18", None,   0.00,  None,  "ACCRUED THRU 05-15-23"),
    (1440,"2023-06-05", None,   0.00,  None,  "ACCRUED THRU 05-31-23"),
    (1459,"2023-06-15", 8.00,   None,  None,  "VOUCHER# 001102"),
    (1458,"2023-06-20", None,   0.00,  None,  "ACCRUED THRU 06-15-23"),
    (1479,"2023-06-30", 8.00,   None,  None,  "VOUCHER# 001108"),
    (1478,"2023-07-05", None,   0.00,  None,  "ACCRUED THRU 06-30-23"),
    (1501,"2023-07-19", None,   0.00,  None,  "ACCRUED THRU 07-15-23"),
    (1528,"2023-07-31", 8.00,   None,  None,  "VOUCHER# 001123"),
    (1527,"2023-08-03", None,   0.00,  None,  "ACCRUED THRU 07-31-23"),
    (1548,"2023-08-18", None,   0.00,  None,  "ACCRUED THRU 08-15-23"),
    # PAGE 4
    (1573,"2023-09-05", None,   0.00,  None,  "ACCRUED THRU 08-31-23"),
    (1595,"2023-09-20", None,   0.00,  None,  "ACCRUED THRU 09-15-23"),
    (1623,"2023-10-04", None,   0.00,  None,  "ACCRUED THRU 09-30-23"),
    (1643,"2023-10-18", None,   0.00,  None,  "ACCRUED THRU 10-15-23"),
    (1665,"2023-11-03", None,   0.00,  None,  "ACCRUED THRU 10-31-23"),
    (1687,"2023-11-20", None,   0.00,  None,  "ACCRUED THRU 11-15-23"),
    (1707,"2023-12-05", None,   0.00,  None,  "ACCRUED THRU 11-30-23"),
    (1729,"2023-12-20", None,   0.00,  None,  "ACCRUED THRU 12-15-23"),
    (1751,"2024-01-04", None,   0.00,  None,  "ACCRUED THRU 12-31-23"),
    (1784,"2024-01-15", 8.00,   None,  None,  "VOUCHER# 001247"),
    (1783,"2024-01-18", None,  64.00,  None,  "ACCRUED THRU 01-15-24"),
    (1806,"2024-02-05", None,   0.00,  None,  "ACCRUED THRU 01-31-24"),
    (1829,"2024-02-15", 16.00,  None,  None,  "VOUCHER# 001263"),
    (1828,"2024-02-21", None,   0.00,  None,  "ACCRUED THRU 02-15-24"),
    (1850,"2024-03-05", None,   0.00,  None,  "ACCRUED THRU 02-29-24"),
    (1872,"2024-03-20", None,   0.00,  None,  "ACCRUED THRU 03-15-24"),
    (1903,"2024-03-31", 4.00,   None,  None,  "VOUCHER# 001307"),
    (1902,"2024-04-03", None,   0.00,  None,  "ACCRUED THRU 03-31-24"),
    (1930,"2024-04-15", 8.00,   None,  None,  "VOUCHER# 001316"),
    (1929,"2024-04-18", None,   0.00,  None,  "ACCRUED THRU 04-15-24"),
    (1957,"2024-05-03", None,   0.00,  None,  "ACCRUED THRU 04-30-24"),
    (2010,"2024-05-31", 13.00,  None,  None,  "VOUCHER# 001343"),
    (1983,"2024-05-20", None,   0.00,  None,  "ACCRUED THRU 05-15-24"),
    (2009,"2024-06-05", None,   0.00,  None,  "ACCRUED THRU 05-31-24"),
    # PAGE 3
    (2039,"2024-06-15", 16.00,  None,  None,  "VOUCHER# 001353"),
    (2038,"2024-06-18", None,   0.00,  None,  "ACCRUED THRU 06-15-24"),
    (2068,"2024-07-03", None,   0.00,  None,  "ACCRUED THRU 06-30-24"),
    (2094,"2024-07-18", None,   0.00,  None,  "ACCRUED THRU 07-15-24"),
    (2118,"2024-08-05", None,   0.00,  None,  "ACCRUED THRU 07-31-24"),
    (2140,"2024-08-20", None,   0.00,  None,  "ACCRUED THRU 08-15-24"),
    (2158,"2024-09-05", None,   0.00,  None,  "ACCRUED THRU 08-31-24"),
    (2182,"2024-09-18", None,   0.00,  None,  "ACCRUED THRU 09-15-24"),
    (2205,"2024-10-03", None,   0.00,  None,  "ACCRUED THRU 09-30-24"),
    (2228,"2024-10-18", None,   0.00,  None,  "ACCRUED THRU 10-15-24"),
    (2251,"2024-11-05", None,   0.00,  None,  "ACCRUED THRU 10-31-24"),
    (2271,"2024-11-20", None,   0.00,  None,  "ACCRUED THRU 11-15-24"),
    (2291,"2024-12-04", None,   0.00,  None,  "ACCRUED THRU 11-30-24"),
    (2311,"2024-12-18", None,   0.00,  None,  "ACCRUED THRU 12-15-24"),
    (2335,"2025-01-03", None,   0.00,  None,  "ACCRUED THRU 12-31-24"),
    (2366,"2024-12-31", None,   None, -1.00,  "CARRYOVER 12-31-24"),
    # PAGE 2
    (2367,"2025-01-21", None,  64.00,  None,  "ACCRUED THRU 01-15-25"),
    (2394,"2025-01-31", 10.00,  None,  None,  "VOUCHER# 001481"),
    (2393,"2025-02-05", None,   0.00,  None,  "ACCRUED THRU 01-31-25"),
    (2418,"2025-02-20", None,   0.00,  None,  "ACCRUED THRU 02-15-25"),
    (2443,"2025-03-05", None,   0.00,  None,  "ACCRUED THRU 02-28-25"),
    (2470,"2025-03-19", None,   0.00,  None,  "ACCRUED THRU 03-15-25"),
    (2497,"2025-03-31", 24.00,  None,  None,  "VOUCHER# 001525"),
    (2496,"2025-04-03", None,   0.00,  None,  "ACCRUED THRU 03-31-25"),
    (2518,"2025-04-18", None,   0.00,  None,  "ACCRUED THRU 04-15-25"),
    (2544,"2025-05-05", None,   0.00,  None,  "ACCRUED THRU 04-30-25"),
    (2568,"2025-05-20", None,   0.00,  None,  "ACCRUED THRU 05-15-25"),
    (2592,"2025-06-04", None,   0.00,  None,  "ACCRUED THRU 05-31-25"),
    (2618,"2025-06-18", None,   0.00,  None,  "ACCRUED THRU 06-15-25"),
    (2641,"2025-06-30", 8.00,   None,  None,  "VOUCHER# 001578"),
    (2640,"2025-07-03", None,   0.00,  None,  "ACCRUED THRU 06-30-25"),
    (2662,"2025-07-18", None,   0.00,  None,  "ACCRUED THRU 07-15-25"),
    (2683,"2025-08-05", None,   0.00,  None,  "ACCRUED THRU 07-31-25"),
    (2706,"2025-08-20", None,   0.00,  None,  "ACCRUED THRU 08-15-25"),
    (2726,"2025-09-04", None,   0.00,  None,  "ACCRUED THRU 08-31-25"),
    (2745,"2025-09-18", None,   0.00,  None,  "ACCRUED THRU 09-15-25"),
    (2768,"2025-10-03", None,   0.00,  None,  "ACCRUED THRU 09-30-25"),
    (2795,"2025-10-20", None,   0.00,  None,  "ACCRUED THRU 10-15-25"),
    (2828,"2025-11-05", None,   0.00,  None,  "ACCRUED THRU 10-31-25"),
    (2857,"2025-11-20", None,   0.00,  None,  "ACCRUED THRU 11-15-25"),
    (2884,"2025-12-05", None,   0.00,  None,  "ACCRUED THRU 11-30-25"),
    (2913,"2025-12-19", None,   0.00,  None,  "ACCRUED THRU 12-15-25"),
    # PAGE 1
    (2949,"2026-01-05", None,   0.00,  None,  "ACCRUED THRU 12-31-25"),
    (2987,"2026-01-20", None,  40.00,  None,  "ACCRUED THRU 01-15-26"),
    (3013,"2026-02-05", None,   0.00,  None,  "ACCRUED THRU 01-31-26"),
    (3040,"2026-02-13", 8.00,   None,  None,  "VOUCHER# 001766"),
    (3039,"2026-02-20", None,   0.00,  None,  "ACCRUED THRU 02-15-26"),
    (3067,"2026-02-28", 8.00,   None,  None,  "VOUCHER# 001777"),
    (3066,"2026-03-05", None,   0.00,  None,  "ACCRUED THRU 02-28-26"),
    (3095,"2026-03-20", None,   0.00,  None,  "ACCRUED THRU 03-15-26"),
    (3122,"2026-04-03", None,   0.00,  None,  "ACCRUED THRU 03-31-26"),
]

# Sort oldest to newest
RAW_RECORDS.sort(key=lambda r: (r[1], r[0]))

# ── 3. Compute running balance ───────────────────────────────────────────────
running_balance = 0.0
rows_to_insert = []

for ref, date, absent, accrued, carryover, comment in RAW_RECORDS:
    if carryover is not None:
        running_balance += carryover
        earned = carryover if carryover > 0 else None
        used   = abs(carryover) if carryover < 0 else None
    elif absent is not None:
        running_balance -= absent
        earned = None
        used   = absent
    elif accrued is not None:
        running_balance += accrued
        earned = accrued
        used   = None
    else:
        earned = None
        used   = None

    rows_to_insert.append({
        "user_id":      USER_ID,
        "type":         "sick",
        "entry_date":   date,
        "description":  f"Ref#{ref} - {comment}",
        "earned_hours": earned,
        "used_hours":   used,
        "balance":      round(running_balance, 2),
    })

print(f"Prepared {len(rows_to_insert)} SICK rows. Final balance: {running_balance:.2f} hrs")

# ── 4. Insert in batches of 50 ──────────────────────────────────────────────
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

print(f"\nDone. {inserted}/{len(rows_to_insert)} SICK rows inserted for Sandra Bonilla.")
print(f"Final sick balance in ledger: {running_balance:.2f} hrs")
