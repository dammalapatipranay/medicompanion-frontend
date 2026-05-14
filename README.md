# 💊 MediCompanion
### Medicine Reminders & AI Symptom Checker

> A Progressive Web App that helps people never miss a medicine dose — with AI-powered symptom checking, offline support, and real-time cross-device sync.

---

## 🩺 Problem Statement

Millions of people — especially elderly patients and those with chronic conditions — forget to take their medicines on time. Missing doses leads to treatment failure, complications, and preventable hospitalisations. At the same time, people often don't know whether a symptom is serious enough to see a doctor, leading to either panic or dangerous neglect.

**MediCompanion solves both problems in one simple app.**

---

## ✅ Solution

A clean, fast, offline-capable PWA that:
- Reminds users to take their medicines at the right time
- Sends a follow-up alert if a dose is missed
- Lets users search any symptom or disease — even without internet
- Uses AI to answer health questions for rare conditions
- Syncs data across all devices when signed in

---

## 🚀 Live Demo

| | URL |
|---|---|
| **App (Frontend)** | https://medicompanion-frontend.vercel.app |
| **API (Backend)** | https://medicompanion-backend.vercel.app/api/health |

---

## ✨ Features

### Medicine Reminders
- Add medicines with name, dose, time, frequency, and colour tag
- Browser/system notifications at the scheduled time
- **Missed pill alert** — if not marked taken within 10 minutes, a follow-up reminder fires automatically
- Snooze reminders for 10 minutes from the notification itself
- Daily timeline view — see taken / pending / missed / upcoming
- Mark doses with one tap; data persists across sessions

### AI Symptom Checker
- **80+ diseases in offline database** — works without internet
- **Fuzzy search** — finds correct results even with spelling mistakes (e.g. "dibeates" → Diabetes)
- **Smart similar suggestions** — shows related conditions as you type
- **AI search** for rare or complex conditions (powered by Google Gemini, key hidden server-side)
- Guided 5-question checker with low / medium / high urgency result
- Results include: description, symptoms, causes, home care, when to see a doctor

### Accounts & Sync
- Sign up / Sign in with email and password
- Medicines sync across all devices when logged in
- Offline-first — app works fully without internet
- Local storage fallback when not signed in

### PWA (Progressive Web App)
- Installable on Android, iOS, Windows — works like a native app
- Home screen icon, splash screen, standalone mode
- Offline caching via Service Worker
- Dark / Light theme toggle — remembered across sessions

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| HTML5, CSS3, Vanilla JS | Core app — no frameworks |
| Service Worker + Cache API | Offline support + notifications |
| Web Notifications API | Medicine reminders |
| IndexedDB | Offline pending actions |
| LocalStorage | Local data persistence |
| Google Fonts (DM Sans, Fraunces) | Typography |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Vercel Serverless | API server (free, no sleeping) |
| Supabase (PostgreSQL) | Database + Auth + Row Level Security |
| Google Gemini 2.0 Flash | AI symptom search proxy |
| JWT (via Supabase Auth) | Secure authentication |

### Deployment
| Service | What |
|---|---|
| Vercel | Frontend + Backend hosting (free) |
| Supabase | Database + Auth (free tier) |
| GitHub | Source code |

---

## 📁 Project Structure

```
medicompanion-frontend/
├── index.html          # Full app — onboarding, home, reminders, symptoms
├── style.css           # Dark/light theme, all UI components
├── script.js           # App logic — auth, medicines, search, notifications
├── diseases.js         # Offline database (80+ diseases)
├── sw.js               # Service worker — offline + notifications
├── manifest.json       # PWA manifest
└── icons/              # App icons

medicompanion-backend/
├── api/
│   ├── auth.js         # POST /signup, /login, /logout — GET /me
│   ├── medicines.js    # CRUD + taken logs
│   ├── search.js       # Gemini AI proxy (keys never exposed to browser)
│   └── health.js       # GET /health (deployment check)
├── lib/supabase.js     # Supabase client
├── middleware/auth.js  # JWT verification
├── vercel.json         # Routing config
└── supabase_schema.sql # Database schema + RLS policies
```

---

## 🗄 Database Schema (Supabase)

```sql
profiles      — user profile (id, name, email)
medicines     — user medicines (name, dose, time, freq, color)
taken_logs    — daily dose tracking (medicine_id, taken_date)
search_cache  — AI search result cache (query, result JSON)
```

Row Level Security ensures each user can only access their own data.

---

## 🔒 Security

- **API keys never in frontend** — Gemini keys stored only in Vercel environment variables
- **JWT on every protected route** — invalid tokens rejected immediately
- **Row Level Security** — Supabase enforces data isolation at database level
- **CORS** — configured to allow only the frontend domain
- **No sensitive data in source code** — `.env` is gitignored

---

## 🏃 How to Run Locally

### Frontend
```bash
# No build step needed — just open in browser
# Or serve with any static server:
npx serve medicompanion-frontend
# Open http://localhost:3000
```

### Backend
```bash
cd medicompanion-backend
npm install

# Copy and fill environment variables
cp .env.example .env
# Edit .env with your Supabase and Gemini keys

npm run dev
# API running at http://localhost:3000
# Test: http://localhost:3000/api/health
```

### Environment Variables (Backend)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
GEMINI_KEY_1=your-gemini-key
GEMINI_KEY_2=your-gemini-key-2
GEMINI_KEY_3=your-gemini-key-3
GEMINI_KEY_4=your-gemini-key-4
FRONTEND_URL=https://your-frontend.vercel.app
```

### Database Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase_schema.sql` in the SQL Editor
3. Copy your Project URL and `service_role` key into `.env`

---

## 📱 Installing as an App

1. Open `https://medicompanion-frontend.vercel.app` in Chrome (Android/Desktop) or Safari (iOS)
2. Tap the **Install** banner or browser menu → "Add to Home Screen"
3. App installs with icon, works offline, sends real notifications

---

## ⚠ Medical Disclaimer

MediCompanion provides general health information for awareness purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for medical decisions.