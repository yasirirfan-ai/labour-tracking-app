# Labour Tracking App — Babylon

A full-featured, enterprise-grade **Labour Tracking & Workforce Management** web application built with React, TypeScript, and Supabase. Designed for manufacturing environments to manage workers, tasks, manufacturing orders, compliance, and workforce analytics — all in real time.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Environment Setup](#3-environment-setup)
4. [Authentication & Roles](#4-authentication--roles)
5. [Portal Overview](#5-portal-overview)
6. [Admin Portal — Pages & Features](#6-admin-portal--pages--features)
7. [Worker Portal — Tabs & Features](#7-worker-portal--tabs--features)
8. [Data Models & Types](#8-data-models--types)
9. [Services & Business Logic](#9-services--business-logic)
10. [State Management & Context](#10-state-management--context)
11. [Routing Structure](#11-routing-structure)
12. [Integrations](#12-integrations)
13. [Internationalization (i18n)](#13-internationalization-i18n)
14. [UI & Theming](#14-ui--theming)
15. [Key Workflows](#15-key-workflows)
16. [Deployment](#16-deployment)

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19.2 + TypeScript 5.9 |
| Build Tool | Vite 7.2 |
| Routing | React Router DOM 7.13 |
| Database/Backend | Supabase (PostgreSQL + Auth + Storage) |
| Styling | Tailwind CSS |
| Charts | Chart.js 4.5 |
| Icons | Lucide React + Font Awesome |
| Date Utilities | date-fns 4.1 |
| HTTP Client | Axios 1.13 |
| i18n | i18next 26 + react-i18next 17 |
| Deployment | Vercel (with Serverless functions) |

---

## 2. Project Structure

```
labour-tracking-app/
├── api/
│   └── sync-odoo.js              # Vercel serverless proxy to Odoo ERP
├── src/
│   ├── assets/                   # Static images and icons
│   ├── components/               # Shared layout components
│   │   ├── Layout.tsx            # Admin portal wrapper with Sidebar
│   │   ├── Sidebar.tsx           # Navigation sidebar (10 links)
│   │   ├── EmployeeCardGrid.tsx  # Worker card grid view
│   │   ├── EmployeeTable.tsx     # Worker tabular view
│   │   └── EmployeeSnapshot.tsx  # Worker summary card
│   ├── context/
│   │   ├── AuthContext.tsx       # Global auth state + login/logout
│   │   └── ThemeContext.tsx      # Per-portal theme + language
│   ├── i18n/
│   │   ├── index.ts              # i18next config
│   │   └── locales/
│   │       ├── en.json           # English translations
│   │       └── es.json           # Spanish translations
│   ├── lib/                      # Business logic services
│   │   ├── supabase.ts           # Supabase client + DB types
│   │   ├── accrualService.ts     # PTO/sick leave accrual engine
│   │   ├── taskService.ts        # Task timer + state management
│   │   ├── disciplinaryService.ts# Discipline escalation logic
│   │   ├── activityLogger.ts     # Audit trail logging
│   │   └── trainingService.ts    # Training material access
│   ├── pages/                    # 15 page components
│   │   ├── LoginPage.tsx
│   │   ├── Dashboard.tsx
│   │   ├── ControlMatrixPage.tsx
│   │   ├── ControlTablePage.tsx
│   │   ├── ManufacturingOrdersPage.tsx
│   │   ├── EmployeeActivityPage.tsx
│   │   ├── WorkersPage.tsx
│   │   ├── HireWorkerPage.tsx
│   │   ├── EmployeeDetailView.tsx
│   │   ├── OperationsPage.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── DisciplineAdminPage.tsx
│   │   ├── NfcManagementPage.tsx
│   │   ├── WorkerPortalPage.tsx
│   │   └── LeaveRequestsPage.tsx
│   ├── types/
│   │   └── index.ts              # All TypeScript interfaces
│   ├── utils/                    # Helper functions
│   ├── App.tsx                   # Router + route definitions
│   ├── main.tsx                  # React root entry
│   └── index.css                 # Global styles + Tailwind + CSS vars
├── scripts/                      # Utility/migration scripts (BambooHR, etc.)
├── public/
├── vercel.json                   # Vercel deployment config
├── .env                          # Environment variables
└── package.json
```

---

## 3. Environment Setup

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VITE_API_BASE_URL=http://localhost:8001/api
CUSTOM_API_KEY=your_api_key
```

Install and run:

```bash
npm install
npm run dev       # Development server
npm run build     # Production build
npm run preview   # Preview production build
```

---

## 4. Authentication & Roles

### Login Methods
- **Username + Password** — credentials stored in Supabase `users` table
- **Google OAuth** — via Supabase Auth provider

### User Roles

| Role | Portal | Access |
|---|---|---|
| `manager` | Admin Portal (`/`) | Full access to all admin pages |
| `employee` | Worker Portal (`/worker-portal`) | Worker dashboard only |

### Session Management
- Sessions stored in `localStorage` under the key `bt_user`
- Automatic Google OAuth session restoration on app load
- Role-based redirect: managers go to Dashboard, employees go to Worker Portal
- Login page has a toggle to switch between Admin and Worker login tabs

---

## 5. Portal Overview

The app has **two completely separate portals**:

### Admin Portal
- URL: `/` (and all sub-routes)
- Accessed by users with role `manager`
- Full workforce management: tasks, orders, reports, discipline, hiring

### Worker Portal
- URL: `/worker-portal`
- Accessed by users with role `employee`
- Personal dashboard: clock in/out, tasks, training, time off, conduct

Each portal has its own **independent theme** (dark/light) and **language** (EN/ES) setting.

---

## 6. Admin Portal — Pages & Features

### Dashboard (`/`)
The main landing page for managers. Shows:
- **Stats Cards:** Active workers, total workers, running timers, today's total hours, today's labor cost
- **Active Manufacturing Orders:** Paginated list of current MOs
- **Quick Navigation:** Links to Employee Activity, Control Matrix, Reports
- **Task Filtering:** Filter visible tasks by manufacturing order

---

### Control Matrix (`/control-matrix`)
An interactive grid-based task assignment tool:
- **Axes:** Manufacturing Orders (rows) × Operations (columns)
- **Cells:** Show assigned worker + live timer
- **Assignment:** Click a cell → select worker from dropdown → task created
- **Task Actions:** Start, pause, resume, complete — directly from the cell
- **Manual Pause:** Managers can pause with a typed reason
- **Real-time Timers:** Updates every 1 second
- **Auto-sync:** Pulls fresh data every 5 seconds

---

### Control Table (`/control-table`)
A tabular view of all tasks with full CRUD:
- **Filters:** By worker, status, date range, free-text search
- **Statuses:** `pending` | `active` | `paused` | `completed` | `break`
- **Manual Entry:** Create task entries with custom start/end times
- **Edit Tasks:** Modify any task, auto-calculates duration
- **Date Grouping:** Today, this week, custom range
- **Actions:** Start, pause, resume, complete from the table

---

### Manufacturing Orders (`/manufacturing-orders`)
Full lifecycle management for production orders:
- **CRUD:** Create, edit, delete MOs
- **Odoo Sync:** Fetch orders from connected Odoo ERP via serverless API
- **Fields:** MO number, product name, SKU, quantity, PO number, scheduled date
- **Statuses:** Draft → In Progress → Completed → Greenlit
- **Pin System:** Pin priority orders to top
- **Reordering:** Drag-and-drop sort order

---

### Employee Activity (`/employee-activity`)
Real-time view of all worker shifts:
- **Timeline View:** Per-worker activity with clock in/out times
- **Clock Out Modal:** Choose to complete all tasks OR pause all tasks on clock out
- **Activity Filtering:** Filter by date
- **Auto-completion:** Tasks automatically finished when shift ends

---

### Workers (`/workers`)
Worker directory and management:
- **Search:** By name, worker ID, or username
- **Archive/Restore:** Soft-delete workers (archived workers hidden by default)
- **Rate History:** View wage change history per worker
- **Password Reset:** Admin can reset worker passwords
- **Detail Navigation:** Click any worker to open their full profile
- **Hire Button:** Quick link to onboarding form

---

### Hire / Edit Worker (`/workers/hire` and `/workers/edit/:id`)
Full onboarding and profile editing form:

| Section | Fields |
|---|---|
| Personal | First, middle, last name, preferred name, birth date, gender, marital status |
| Contact | Home/work phone, mobile, work/home email, full address |
| Employment | Hire date, job title, department, division, location, employment status, staff type |
| Compensation | Hourly rate, pay schedule, pay type, pay period, annual bonus, pay group |
| Identity | Auto-generated Worker ID (W-001 format), NFC tag ID |

---

### Employee Detail View (`/workers/:id`)
The most comprehensive page in the app — a multi-tab employee profile:

#### Personal Tab
- Edit all personal, contact, and address information
- Emergency contacts (primary and secondary with full details)
- EEO information (ethnicity, category)
- Educational background (institution, degree, major, GPA, dates)
- Work history

#### Employment Tab
- Employment details, compensation, status
- Pay schedule and rate changes

#### Training Tab
- View assigned training materials
- Track completion per item
- Training compliance percentage

#### Time Off Tab
- **PTO/Sick balances** with accrual breakdown
- **Leave history:** Full log of earned and used leave
- **Approve / Reject** pending leave requests from workers
- **Manual adjustments:** Admins can modify balances

#### Bonuses Tab
- Annual bonus percentage and calculated dollar amount

#### Conduct Tab
- View all logged disciplinary incidents for the worker
- See action history and escalation steps

---

### Operations (`/operations`)
Manage manufacturing operation types:
- CRUD for operations (name, description)
- Drag-and-drop reordering via `sort_order`
- Operations appear as columns in the Control Matrix

---

### Reports (`/reports`)
Analytics and cost reporting:
- **Charts:** Hours by worker (bar), hours by operation (bar) via Chart.js
- **Filters:** Worker, manufacturing order, operation, date range
- **Metrics:** Total hours, total labor cost, average hourly rate, training compliance %
- **Export:** Download filtered results as CSV

---

### Discipline Admin (`/discipline`)
Full disciplinary case management following SOP 3.7:
- **Log Incidents:** Worker, date, category, severity (minor / major / gross misconduct)
- **Auto-suggestion:** System suggests next disciplinary step based on prior history
  - Minor: Verbal Warning → Written Warning → Suspension
  - Major: Suspension
  - Gross Misconduct: Termination
- **Actions:** Issue formal disciplinary actions with expiry dates
- **Acknowledgment:** Workers receive and sign incident reports
- **Real-time Notification:** Manager notified when worker signs
- **Appeals:** 5–7 business day appeal window tracked automatically
- **Attachments:** File/document uploads per incident
- **Audit Trail:** Full history of all actions

---

### NFC Management (`/nfc`)
Manage NFC tags for worker identification:
- **Web NFC API:** Scan physical NFC tags in supported browsers
- **Tag Assignment:** Link a tag serial number to a worker profile
- **Remove Tags:** Unassign tags from workers
- **Fallback Simulator:** Manual tag ID entry for testing
- **Status Messages:** Success / error / info feedback

---

## 7. Worker Portal — Tabs & Features

Accessible at `/worker-portal` for employees.

### Dashboard Tab
- **Clock In / Clock Out** buttons
- **Break Start / End** controls
- **5-hour shift warning** when approaching extended work
- **Active task list:** All tasks currently assigned to the worker
- **Daily summary:** Total hours worked in the current shift

### Personal Info Tab
- View-only display of all personal and contact information
- Emergency contacts

### Conduct Tab
- View all disciplinary incidents issued to the worker
- **Sign Incidents:** Acknowledge receipt with a digital signature
- Acknowledgment status tracked per incident

### Training Tab
A compliance-enforced training viewer:
- **Mandatory materials** assigned by role and department
- **PDF Viewer** with embedded document display
- **Forced Reading Timer:** 30-second minimum per section — cannot skip
- **Scroll-to-End Enforcement:** Must scroll to the bottom to unlock the next section
- **Bilingual:** English and Spanish materials served automatically per language preference
- **Levels:** Core Operations training + Role-Specific SOPs
- **Completion Tracking:** System records completed items, calculates compliance %

### Time Off Tab
- **Request Leave:** Submit PTO or sick leave requests with date range, hours, and reason
- **Request History:** View all submitted requests with current status (pending / approved / rejected)
- **Balance Display:** Current PTO and sick leave balance

### Settings Tab
- **Language Toggle:** English / Spanish
- **Theme Toggle:** Light / Dark mode

---

## 8. Data Models & Types

All types defined in `src/types/index.ts`.

### User
```typescript
{
  id: string
  worker_id: string               // e.g., "W-001"
  username: string
  name: string
  role: "manager" | "employee"
  hourly_rate: number

  // Personal
  first_name, middle_name, last_name, preferred_name
  birth_date, gender, marital_status

  // Contact
  phone_work, phone_mobile, phone_home
  email_work, email_home
  address_line1, address_line2, city, state, zip, country

  // Employment
  hire_date, job_title, department, division, location
  employment_status, staff_type, pay_schedule, pay_type, pay_period
  annual_bonus, annual_pay, pay_group

  // Leave Balances
  pto_balance: number             // hours
  sick_balance: number            // hours
  last_pto_accrual: string
  processed_sick_seconds: number

  // Status
  status: "offline" | "present"
  availability: "available" | "break"
  last_status_change: string

  // Emergency Contacts
  emergency_contact_primary: EmergencyContact
  emergency_contact_secondary: EmergencyContact

  // Training
  completed_trainings: string[]
  training_completion: number     // percentage

  // NFC
  nfc_id: string
}
```

### Task
```typescript
{
  id: string
  description: string
  mo_reference: string            // Manufacturing Order reference
  assigned_to_id: string
  status: "pending" | "active" | "paused" | "completed" | "break"
  start_time: string
  end_time: string
  last_action_time: string
  active_seconds: number
  break_seconds: number
  total_duration_seconds: number
  hourly_rate: number
  manual: boolean
  reason: string
}
```

### Manufacturing Order
```typescript
{
  id: string
  mo_number: number
  product_name: string
  sku: string
  quantity: number
  po_number: string
  event_id: string
  scheduled_date: string
  current_status: "Draft" | "In Progress" | "Completed" | "Greenlit"
  is_pinned: boolean
  sort_order: number
}
```

### Operation
```typescript
{
  id: string
  name: string
  description: string
  sort_order: number
}
```

### Disciplinary Incident
```typescript
{
  id: string
  worker_id: string
  date: string
  category: string
  severity: "minor" | "major" | "gross_misconduct"
  description: string
  documentation: string
  attachment_url: string
}
```

### Leave Request
```typescript
{
  id: string
  user_id: string
  type: "pto" | "sick"
  start_date: string
  end_date: string
  hours_requested: number
  status: "pending" | "approved" | "rejected"
  reason: string
  admin_notes: string
  created_at: string
  processed_at: string
}
```

### Activity Log
```typescript
{
  id: string
  worker_id: string
  event_type: "clock_in" | "clock_out" | "break_start" | "break_end"
             | "task_start" | "task_stop" | "task_pause" | "task_resume" | "task_complete"
  timestamp: string
  description: string
  details: object
  related_task_id: string
}
```

---

## 9. Services & Business Logic

### Accrual Service (`src/lib/accrualService.ts`)

Manages PTO and sick leave accrual with a tiered system:

**PTO Tiers (based on tenure):**

| Tier | Tenure | Rate | Annual Max | Carryover |
|---|---|---|---|---|
| 1 | 0–12 months | 0.8335 hrs/period | 20 hrs | 20 hrs |
| 2 | 12–24 months | 1.3335 hrs/period | 32 hrs | 32 hrs |
| 3 | 24–36 months | 2.0 hrs/period | 48 hrs | 48 hrs |
| 4 | 36+ months | 4.0 hrs/period | 48 hrs | 48 hrs |

**Sick Leave (Semi-monthly only):**
- Earned: 1 hour per 30 hours worked
- 90-day waiting period before first use
- 48-hour annual cap (California-compliant)

**Key Functions:**
- `calculateAccruals(user)` — Pure calculation, no side effects
- `syncLeaveBalances(userId)` — Write updated balances to Supabase
- `fetchLeaveHistory(userId)` — Retrieve all accrual/usage records
- `isSickLeaveUsable(user)` — Check if 90-day wait has passed
- `getPtoTier(months)` / `getPtoRate(months)` — Tier lookup

---

### Task Service (`src/lib/taskService.ts`)

Handles all task lifecycle actions:

- `performTaskAction(taskId, action, userId)` — Universal state handler
  - Actions: `start`, `resume`, `pause`, `complete`, `auto_pause`, `auto_resume`
  - Accumulates `active_seconds` and `break_seconds` correctly on each state transition
  - Logs every action to `activity_logs`
  - Enriches logs with PO numbers for reporting
- `pauseAllActiveTasks(userId)` — Used on break start
- `resumeAllAutoPausedTasks(userId)` — Used on break end
- `completeAllTasks(userId)` — Used on clock out (complete option)
- `pauseAllTasksManual(userId)` — Used on clock out (pause option)

---

### Disciplinary Service (`src/lib/disciplinaryService.ts`)

Implements SOP 3.7 disciplinary escalation:

- `suggestNextStep(workerId, severity)` — Returns recommended action:
  - `gross_misconduct` → Termination
  - `major` → Suspension
  - `minor` (1st) → Verbal Warning
  - `minor` (2nd) → Written Warning
  - `minor` (3rd+) → Suspension
- `isAppealAllowed(incidentDate)` — Returns true if within 5–7 business days
- `acknowledgePolicy(userId, policyId, ipAddress)` — Record worker signature
- `getPendingAcknowledgments(userId)` — List unsigned policy notices

---

### Activity Logger (`src/lib/activityLogger.ts`)

Simple audit trail writer:

- `logActivity(userId, eventType, description, details, relatedTaskId)` — Insert to `activity_logs`
- `updateUserStatus(userId, status, availability)` — Update clock in/out and break state

---

### Training Service (`src/lib/trainingService.ts`)

Training material access layer:

- `getAllMaterials(language)` — Fetch all materials filtered by language
- `getMaterialsByLevel(level, language)` — Filter by training level
- `getPublicUrl(filePath)` — Generate Supabase Storage public URL
- Language routing: Spanish files stored under `Spanish/` folder prefix

---

## 10. State Management & Context

### AuthContext (`src/context/AuthContext.tsx`)

Global authentication state — wraps the entire app.

```typescript
{
  user: User | null
  loading: boolean
  authError: string | null
  login(username, password): Promise<void>
  loginWithGoogle(): Promise<void>
  logout(): Promise<void>
  clearAuthError(): void
}
```

- Persists session to `localStorage` as `bt_user`
- Listens for Supabase auth state changes (for Google OAuth)
- Role-based redirect on login

---

### ThemeContext (`src/context/ThemeContext.tsx`)

Portal-aware theme and language management.

```typescript
{
  adminTheme: "light" | "dark"
  workerTheme: "light" | "dark"
  adminLanguage: "en" | "es"
  workerLanguage: "en" | "es"
  toggleTheme(): void
  setLanguage(lang): void
}
```

- Detects active portal via `window.location.pathname`
- Uses `MutationObserver` to react to SPA route changes
- Applies `data-theme` and `data-portal` attributes to the DOM root
- Separate localStorage keys for each portal's preferences

---

## 11. Routing Structure

```
/login                    LoginPage        (public)
/worker-portal            WorkerPortalPage (employee role)

/ (Layout — manager role required)
├── /                     Dashboard
├── /control-matrix       ControlMatrixPage
├── /control-table        ControlTablePage
├── /manufacturing-orders ManufacturingOrdersPage
├── /employee-activity    EmployeeActivityPage
├── /workers              WorkersPage
├── /workers/hire         HireWorkerPage
├── /workers/edit/:id     HireWorkerPage (edit mode)
├── /workers/:id          EmployeeDetailView
├── /operations           OperationsPage
├── /reports              ReportsPage
├── /discipline           DisciplineAdminPage
└── /nfc                  NfcManagementPage
```

**Layout** wraps all admin routes and renders the Sidebar with:
- Dashboard, Control Matrix, Control Table, Manufacturing Orders, Employee Activity, Workers, Operations, Reports, Discipline, NFC Management

---

## 12. Integrations

### Supabase
- **Database:** PostgreSQL — all app data (users, tasks, orders, logs, leave, training)
- **Auth:** Built-in user auth + Google OAuth
- **Storage:** PDF training materials in Supabase Storage buckets
- **Real-time:** Supabase channels for live discipline acknowledgment notifications

**Database Tables:**

| Table | Purpose |
|---|---|
| `users` | Worker profiles + balances |
| `tasks` | Task assignments + timers |
| `manufacturing_orders` | Production orders |
| `operations` | Operation types |
| `activity_logs` | Full audit trail |
| `leave_requests` | PTO/sick requests |
| `leave_history` | Accrual and usage log |
| `disciplinary_incidents` | Incident reports |
| `disciplinary_actions` | Escalation actions |
| `disciplinary_policies` | Policy version control |
| `policy_acknowledgments` | Worker signatures |
| `training_materials` | Training content metadata |

---

### Odoo ERP (`api/sync-odoo.js`)
- **Type:** Vercel Serverless Function
- **Purpose:** Sync manufacturing orders from Odoo ERP into the app
- **Flow:** App calls `/api/sync-odoo` → proxied to Google Cloud Function → returns Odoo data
- **Auth:** `X-APP-KEY` header
- **Remote Endpoint:** Google Cloud Function (`us-central1-pythonautomation`)

---

## 13. Internationalization (i18n)

- **Languages:** English (`en`) and Spanish (`es`)
- **Library:** `i18next` with `react-i18next` and browser language detection
- **Files:** `src/i18n/locales/en.json` and `es.json`
- **Coverage:** 200+ translation keys

**Key namespaces:**

| Prefix | Covers |
|---|---|
| `sidebar.*` | Navigation items |
| `dashboard.*` | Stats and cards |
| `matrix.*` | Control matrix UI |
| `table.*` | Control table |
| `workerPortal.*` | Worker portal tabs and modals |
| `discipline.*` | Disciplinary forms and notices |
| `training.*` | Training viewer |
| `nfc.*` | NFC scanning |
| `timeOff.*` | Leave request forms |
| `common.*` | Shared actions (save, cancel, etc.) |

Language can be switched per portal in the Settings tab (worker) or via ThemeContext (admin).

---

## 14. UI & Theming

### CSS Architecture
- **Base:** `src/index.css` with Tailwind utilities and custom classes
- **Variables:** CSS custom properties for all theme colors

```css
--primary, --primary-light
--bg-main, --bg-card, --bg-sidebar
--border
--text-main, --text-muted
```

- **Dark/Light Mode:** Toggled via `data-theme="dark"` on the root element

### Reusable CSS Classes

| Class | Purpose |
|---|---|
| `.page-header`, `.page-title` | Consistent page headings |
| `.stat-card`, `.stat-value`, `.stat-label` | KPI stat cards |
| `.section-card`, `.section-header` | Content sections |
| `.badge` | Status pills (color-coded per status) |
| `.modal`, `.modal-backdrop`, `.modal-content` | Modal dialogs |
| `.btn`, `.btn-primary`, `.icon-btn` | Button variants |
| `.table-container`, `.list-container` | Data display wrappers |
| `.role-toggle`, `.role-btn` | Login tab toggle |
| `.input-group`, `.form-group` | Form field wrappers |
| `.loading-screen` | Full-page loading state |

### Responsive Design
- Grid layouts adapt to screen size
- Card-based patterns for all data display
- Consistent spacing: `1.25rem` padding, `1.5rem` gaps

---

## 15. Key Workflows

### Clock In / Out
1. Worker clicks **Clock In** → `logActivity(clock_in)` + `updateUserStatus(present)`
2. Assigned tasks appear in dashboard
3. Worker clicks **Clock Out** → modal appears:
   - Option A: **Complete All Tasks** → all tasks marked completed
   - Option B: **Pause All Tasks** → all tasks paused for next shift
4. `logActivity(clock_out)` + `updateUserStatus(offline)`

---

### Break Workflow
1. Worker clicks **Start Break** → `pauseAllActiveTasks()` → all active tasks auto-paused + `break_seconds` accumulation starts
2. Worker clicks **End Break** → `resumeAllAutoPausedTasks()` → all auto-paused tasks resume

---

### Task Assignment (Manager)
1. Manager opens **Control Matrix**
2. Clicks a cell (MO row × Operation column)
3. Selects a worker from the dropdown
4. Task created in `tasks` table with status `pending`
5. Worker sees the task in their portal
6. Worker starts task → status → `active`, timer starts
7. All state transitions logged to `activity_logs`

---

### Leave Request
1. Worker submits request (type, dates, hours, reason) in Worker Portal → Time Off tab
2. Record written to `leave_requests` with status `pending`
3. Manager sees request in Employee Detail View → Time Off tab
4. Manager **approves** → balance decremented + `leave_history` entry added
5. Manager **rejects** → no balance change, admin notes visible to worker

---

### Disciplinary Workflow
1. Manager logs incident with severity level in Discipline Admin page
2. System calls `suggestNextStep()` → recommends action per SOP 3.7
3. Manager issues formal action (verbal / written / suspension / termination)
4. Worker logs into their portal → Conduct tab → sees incident
5. Worker **signs** → real-time notification sent to manager via Supabase channels
6. 5–7 business day appeal window opens automatically

---

### Training Completion
1. Worker opens Worker Portal → Training tab
2. System loads materials assigned to their role/department
3. Worker opens a section → 30-second timer starts
4. Timer completes + worker scrolls to end → section unlocked
5. System marks item as complete in `completed_trainings[]`
6. Compliance percentage recalculated and stored

---

## 16. Deployment

### Vercel
The app is deployed via Vercel with:
- Static SPA build from `npm run build`
- Serverless function at `api/sync-odoo.js` for Odoo proxy
- All routes rewritten to `index.html` for client-side routing

`vercel.json` handles SPA routing rewrites.

### Required Supabase Setup
- Enable Google OAuth provider in Supabase Auth settings
- Create all tables listed in the Integrations section
- Create a Storage bucket for training materials (PDF files)
- Add Row Level Security (RLS) policies as needed

---

*Built for Babylon — enterprise labour tracking for manufacturing operations.*
