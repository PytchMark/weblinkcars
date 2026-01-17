# Carsales Platform

A multi-dealer car inventory and viewing-request platform built with:

- **Netlify** (static hosting + Functions API)
- **Supabase** (Postgres + Auth + Storage)
- **Static HTML apps** (storefront, dealer portal, admin)

This system installs a **sales process**, not just a website.

---

## Architecture Overview


- Browsers **never** talk to Supabase directly for protected data
- All secrets live in environment variables
- All dealer access is scoped by `Dealer ID`

---

## Apps

### `/apps/storefront`
Public, read-only dealer storefront.

- User enters **1–3 dealer IDs** (comma-separated or via URL param)
- Displays live inventory from Supabase
- Allows customers to:
  - Open WhatsApp chat
  - Request live video viewing
  - Book in-store viewing

No authentication required.

---

### `/apps/dealer`
Dealer management portal.

- Login with **Supabase Auth (email + password)**
- Manage vehicles and media
- Upload images/videos to Supabase Storage
- Update vehicle status:
  - Available
  - Pending
  - Sold
  - Archived (no deletes)

Dealers can only access their own data.

---

### `/apps/admin`
Internal admin dashboard.

- View all dealers
- View all vehicles
- View all requests
- Sales + performance analytics
- Filter by Dealer ID

---

## Repository Structure

/
├── netlify.toml
├── netlify/functions/
├── services/supabase.js
├── supabase/schema.sql
├── apps/
│ ├── storefront/index.html
│ ├── dealer/index.html
│ └── admin/index.html
---

## Environment Variables

Create a local `.env` file (not committed) based on `.env.example`.

In production:
- Use **Netlify environment variables**
- Never commit real secrets to GitHub

Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Data Rules (Important)

- **Dealer ID** is the partition key for all data
- Vehicles are **never deleted**, only archived
- Media is hosted on Supabase Storage
- Dropdowns / single-select fields are enforced to keep data clean

---

## Status Values

Vehicles:
- `available`
- `pending`
- `sold`
- `archived`

Requests:
- `New`
- `Booked`
- `Closed`

---

## Footer Requirement

All apps must display:


---

## Development

Install dependencies:
```bash
npm install
npm run dev
npm start
```
