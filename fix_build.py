import os

path = r'c:\Users\ESHOP\Downloads\labour-tracking-app-main\labour-tracking-app-main\src\pages\EmployeeDetailView.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
found = False
# Line 1722 index 1721
for i, line in enumerate(lines):
    if i == 1721 and line.strip() == '</div>':
        found = True
        continue
    new_lines.append(line)

if not found:
    print("Pattern not found at line 1722 as expected.")
    exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print("Successfully removed redundant div at line 1722.")
