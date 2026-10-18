# InstaDash — Educational Instagram Analytics Clone

A learning-focused, mobile-first web application that recreates the look and feel of a social media analytics dashboard. Built as a **final-year cybersecurity student project** to study how modern full-stack applications handle authentication, data privacy, media handling, and secure client–server communication.

> ⚠️ **Educational use only.** This project is not affiliated with, endorsed by, or connected to Instagram or Meta. It exists purely to demonstrate and learn full-stack development and application security concepts in a controlled environment.

---

## 📚 Purpose & Learning Objectives

This project was created to gain hands-on experience with:

- **Application security fundamentals** — session handling, access keys, device fingerprinting, and abuse-resistant authentication flows.
- **Data protection** — row-level security (RLS) policies, least-privilege database grants, and safe client-side storage practices (quota management, cache eviction, preventing data leaks between users).
- **Secure media handling** — proxying third-party media, caching strategies, and avoiding direct exposure of user data.
- **Web performance engineering** — progressive loading, stale-while-revalidate caching, skeleton states, and service-worker-based PWA behaviour.
- **Threat modelling** — understanding how clone-style apps can be abused (unauthorized scraping, session hijacking) and how to defend against them.

---

## ✨ What the App Does

- **Analytics dashboard** — views, reach, engagement, follower growth, and audience demographics presented with interactive, editable charts.
- **Reel-level insights** — per-video metrics (views, likes, comments, shares, saves) with retention and watch-time graphs.
- **Profile & feed simulation** — media grid, stories, and detail views that mirror a real social app experience.
- **Offline-capable PWA** — installable, with local caching for fast repeat sessions.
- **Access-key based login** — a simple key + device-fingerprint system used to study session lifecycle, expiry, and revocation.

---

## 🛠️ Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Charts     | Recharts |
| Animation  | Framer Motion |
| Backend    | Lovable Cloud (Supabase: Postgres, Auth, Edge Functions, Storage) |
| PWA        | Service worker + web app manifest |
| Testing    | Vitest, Playwright |

---

## 🔐 Security Concepts Demonstrated

- **Row-Level Security (RLS)** on every table, with explicit grants instead of broad public access.
- **Roles stored in a dedicated table** (never on the profile table) with a `SECURITY DEFINER` role-check function to avoid recursive policy issues.
- **Device fingerprint + access key** pairing to study session binding, expiry windows, and remote logout.
- **Edge functions** for privileged operations (key validation, logging, webhook handling) so secrets never reach the browser.
- **Client storage hygiene** — compacting and pruning cached data to prevent quota exhaustion and stale-data bugs.

---

## 🚀 Getting Started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:8080`. A valid access key is required to sign in (managed via the backend).

---

## 📁 Project Structure (high level)

```
src/
├── components/   # Reusable UI components (cards, editors, modals)
├── screens/      # Main app screens (Home, Reels, Insights, Profile…)
├── lib/          # Storage, auth, media, and formatting utilities
├── integrations/ # Backend client (auto-generated)
└── data/         # Demo/seed data for the learning environment
supabase/
└── functions/    # Serverless functions (auth, logging, webhooks)
```

---

## 🎓 Author

Built by a **final-year Cybersecurity student** as a capstone-style learning project — combining full-stack development practice with an applied study of secure application design.

---

## 📄 Disclaimer

All trademarks, logos, and brand names belong to their respective owners. This project uses them solely for educational, non-commercial demonstration purposes. Do not use this code to access, scrape, or redistribute data from any service without proper authorization.
