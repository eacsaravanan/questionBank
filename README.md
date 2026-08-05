# dturn Question Bank — Multi-Exam Question Bank & Secure Testing Platform

A full-stack scaffold for a TNPSC / UPSC / SSC / RRB / Banking / NEET / JEE /
Engineering / TNUSRB / CLAT question bank platform: dynamic content
hierarchy, multilingual (Unicode) authoring with Tanglish→Tamil assist,
OCR-assisted question entry, role-based workflow (Super Admin → Admin →
SME → Approver), white-label branding, and a secure, time-locked exam
delivery engine.

**This is a working foundation, not a finished production product.** It's
built to be extended by a dev team — see "What's real vs. what's scaffolded"
below before you point it at a live exam.

---

## 1. Architecture

```
                     ┌────────────────────┐
                     │   React Frontend    │  Vite + Tailwind
                     │  (role dashboards,  │  Nginx in prod
                     │   secure exam UI)   │
                     └─────────┬──────────┘
                               │ HTTPS / JSON
                     ┌─────────▼──────────┐
                     │   Express API       │  Node 20
                     │  auth · rbac · audit│
                     └──┬───────────┬─────┘
                        │           │
              ┌─────────▼──┐   ┌────▼─────┐
              │ PostgreSQL │   │  Redis    │  sessions, rate-limit
              │  (Prisma)  │   │           │  counters, lockouts
              └────────────┘   └───────────┘

Background: scheduler.js (self-healing exam release + auto-submit sweep)
```

- **Backend**: Node.js + Express + Prisma ORM + PostgreSQL. `/backend/prisma/schema.prisma`
  is the single source of truth for the data model — the full
  Exam→Subject→Unit→Chapter→Topic→Subtopic→Question hierarchy, RBAC as
  data (not hardcoded enums), question/paper approval workflow, exam
  scheduling, branding profiles, audit log.
- **Frontend**: React + Vite + Tailwind, no UI framework lock-in. Role-based
  routing (`RoleGuard`), a shared `AppShell` layout, and a distinct
  "lockdown" dark theme for the actual exam-taking screen.
- **Redis**: login rate-limiting / account lockout counters, general API
  rate limiting.
- **File storage**: local disk under `/backend/uploads` (institute logos,
  OCR source images) — swap for S3/GCS in production (see §6).

## 2. Feature map → code

| Requirement | Where |
|---|---|
| Dynamic Exam/Subject/Unit/Chapter/Topic/Subtopic hierarchy | `schema.prisma`, `routes/content.routes.js` |
| Dynamic RBAC, Super Admin defines roles at runtime | `schema.prisma` (Role/Permission as data), `middleware/rbac.js`, `routes/user.routes.js` |
| Question authoring, multilingual (Unicode) | `routes/question.routes.js`, `QuestionTranslation` model |
| Tanglish → Tamil assist | `utils/transliterate.js`, wired into `QuestionBuilder.jsx` |
| OCR-assisted question entry (mixed with manual, switchable anytime) | `routes/ocr.routes.js`, `utils/ocrSegment.js`, `QuestionBuilder.jsx` |
| SME review → Super Admin approval workflow | `question.routes.js` (`/review`, `/approve`), `questionPaper.routes.js` |
| Paper assembly from pre-approved questions | `questionPaper.routes.js`, `PaperAssembly.jsx` |
| Exam scheduling, time-locked release, verification codes | `routes/exam.routes.js`, `jobs/scheduler.js` |
| Self-healing / auto-recovery + manual-intervention guidance | `jobs/scheduler.js` (see inline comments) |
| Full audit log + CSV export, every role | `middleware/auditLog.js`, `routes/audit.routes.js`, `AuditLogViewer.jsx` |
| SMTP configuration (Super Admin, runtime) | `routes/systemConfig.routes.js`, `utils/notify.js`, `SmtpSettings.jsx` |
| Exam master config (marks, negative marking, sections) | `ExamMasterConfig` model, `SystemSettings.jsx` |
| White-labeling / institute branding, header-footer designer, confidential mode | `BrandingProfile` model, `routes/branding.routes.js`, `BrandingSettings.jsx` |
| Employee/admin/SME account creation, subject assignment | `routes/user.routes.js`, `UserManagement.jsx` |
| Candidate login, verification code, secure exam room | `ExamGate.jsx`, `ExamRoom.jsx` |
| Configurable view mode (all-at-once / one-by-one), answer changes | `QuestionPaper.viewMode`/`allowAnswerChange`, enforced in `ExamRoom.jsx` |

## 3. White-labeling

Super Admin can create any number of **Branding Profiles**
(`/super-admin/branding`): institute name, address, phone, email, website,
logo (uploaded, shown on first page only or every page), and a
placeholder-driven header/footer template
(`{{logo}} {{instituteName}} {{address}} {{examName}} {{paperCode}}
{{date}} {{pageNumber}} {{totalPages}} {{confidentialNotice}}`).

**Confidential mode** is a hard switch, not just a UI toggle: turning it on
strips institute identity fields at write time (server-side, not just at
render time), and any profile in that state can never have a logo attached.
A paper using a confidential profile prints a neutral header regardless of
what other data exists — there's no code path that can leak identity for a
profile marked confidential. Each `QuestionPaper` can pick a specific
profile or fall back to the tenant default.

*Not yet wired up*: the actual PDF renderer that turns `headerTemplate` +
question content into a paginated paper. The schema and CRUD are ready;
plug in a PDF engine (e.g. Puppeteer rendering the template to HTML, or a
templating library like `pdfmake`) reading `BrandingProfile` fields.

## 4. OCR-assisted question entry

`POST /api/questions/ocr-extract` accepts a screenshot or full-page scan,
runs it through `tesseract.js` (offline OCR, works fully self-hosted — no
external API key needed), and a **heuristic segmenter**
(`utils/ocrSegment.js`) splits the recognized text into one or more draft
questions by detecting numbering patterns (`1.`, `Q1)`, etc.) and option
patterns (`A)`, `(a)`, etc.).

In the `QuestionBuilder` UI, the preparer can:
- Paste (Ctrl/Cmd+V) or upload a screenshot → each detected question lands
  in a review queue, always editable before saving.
- Click "Add manual question" at any point to type one from scratch.
- Freely mix both in the same session — accept 15 questions from OCR and
  type the remaining 5 by hand, in any order.

This is a **pattern-based heuristic, not a trained model** — it will
mis-segment unusual layouts (multi-column pages, diagrams mixed with text,
non-standard numbering). Every extracted question is flagged
`needsReview: true` and routed through the same SME approval step as
manually typed ones, so OCR mistakes get caught before publishing, not
after. If you need materially higher accuracy, swap `ocr-extract`'s
internals for a vision-capable LLM API call — the route's request/response
contract is designed so nothing else in the app needs to change.

## 5. Security posture — what's real, what needs an operator

**Implemented:**
- Argon2id password hashing, JWT access/refresh tokens, optional TOTP MFA.
- Redis-backed brute-force lockout (per-account, not just per-IP).
- RBAC enforced server-side on every route (`requirePermission`), not just
  hidden in the UI.
- Exam papers never send the answer key to the client; the time window is
  re-checked server-side on *every* request, not just at login — a delayed
  or replayed request can't get in early or stay in late.
- AES-256-GCM field-level encryption for stored secrets (SMTP creds).
- Full audit trail: every mutating action, every role, exportable as CSV.
- Rate limiting (general API, auth endpoints, exam-attempt endpoints) +
  Helmet/CSP/HSTS + HPP.
- Self-healing scheduler with explicit manual-intervention log messages
  when something can't self-recover (see `jobs/scheduler.js`).
- Client-side integrity signals (tab-switch, window-blur, copy attempts)
  reported to the server for **post-hoc review**, not used to auto-block —
  a false positive shouldn't lock out an honest candidate mid-exam.

**Explicitly NOT implemented — do this before any real exam:**
- **Independent security review / penetration test.** No self-built system
  should be trusted with high-stakes exam content on claims alone.
- **WAF / DDoS protection** at the edge (Cloudflare, AWS Shield, etc.) —
  application-layer rate limiting alone won't survive a real attack.
- **Proctoring** (webcam/screen recording, browser lockdown app) — the
  in-browser integrity flags here are a signal, not a lockdown mechanism;
  a determined candidate can defeat them. For JEE/NEET-grade integrity you
  need either a native lockdown browser or in-person invigilation.
  distribution and question-paper printing chain (who prints, who
  transports, chain-of-custody logs) sits outside this codebase entirely
  — that's usually where real leaks happen, not the database.
- **Backups & disaster recovery** — set up automated Postgres backups
  and test restores before going live.
- **Secrets management** — `.env` files are fine for local dev; use a real
  secrets manager (AWS Secrets Manager, Vault, etc.) in production and
  never commit `.env` to version control.

## 6. Local development

```bash
# 1. Start Postgres + Redis (or use docker-compose, see §7)
# 2. Backend
cd backend
cp .env.example .env        # fill in secrets — see "generate secrets" below
npm install
npx prisma migrate dev      # creates tables
npm run seed                # baseline roles, permissions, 10 exams, Super Admin login
npm run dev                 # http://localhost:4000

# 3. Frontend
cd ../frontend
npm install
npm run dev                 # http://localhost:5173
```

Generate secrets:
```bash
openssl rand -hex 64      # JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PAPER_RELEASE_HMAC_SECRET
openssl rand -base64 32   # FIELD_ENCRYPTION_KEY
```

First login: `superadmin` / `ChangeMe@FirstLogin123` — **you'll be forced to
change this** (`mustResetPassword` is set true by the seed; wire up a
change-password screen before shipping, it's not in this scaffold's UI yet).

## 7. Deployment (Docker Compose)

```bash
cp .env.example .env   # fill in the same secrets as above, plus POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:4000
- Postgres/Redis data persist in named Docker volumes; uploaded
  logos/OCR sources persist in `qbank_uploads`.

**For a real production deployment**, put this behind a reverse proxy /
load balancer with TLS termination (nginx, Caddy, or a managed LB), move
file storage to S3/GCS (swap `config/upload.js`'s disk storage for an S3
multer adapter), point `DATABASE_URL` at a managed Postgres (RDS, Cloud
SQL) with automated backups, and run the backend as 2+ replicas behind the
LB — the scheduler job should only run on one replica (add a Redis-based
leader lock) once you scale past one instance.

## 8. What to build next (priority order)

1. Password reset / forced-reset flow (backend supports `mustResetPassword`; no UI yet).
2. PDF rendering of assembled papers using `BrandingProfile` templates.
3. Question paper viewer/print preview for Admin before submission.
4. Bulk candidate import (CSV) for exam registration, instead of one-by-one.
5. Results/scoring engine — grading logic (`isCorrect`/`marksAwarded` fields
   exist on `AttemptAnswer` but nothing populates them yet).
6. Analytics dashboards (weak-area practice, mistake notebook, etc. from
   the original spec) — these need attempt history to accumulate first.
7. Proper file storage (S3) and a CDN in front of uploaded logos.
8. Replace the OCR heuristic with a vision-LLM-backed extractor once
   budget/latency tradeoffs are decided.
