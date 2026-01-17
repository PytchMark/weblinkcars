# Carsales Platform

A multi-dealer car inventory and viewing-request platform built with:

- **Google Cloud Run** (Express API)
- **Airtable** (single source of truth database)
- **Cloudinary** (media hosting)
- **Static HTML apps** (storefront, dealer portal, admin)

This system installs a **sales process**, not just a website.

---

## Architecture Overview


- Browsers **never** talk to Airtable directly
- All secrets live in environment variables
- All dealer access is scoped by `Dealer ID`

---

## Apps

### `/apps/storefront`
Public, read-only dealer storefront.

- User enters a **Dealer ID** (or via URL param)
- Displays live inventory from Airtable
- Allows customers to:
  - Open WhatsApp chat
  - Request live video viewing
  - Book in-store viewing

No authentication required.

---

### `/apps/dealer`
Dealer management portal.

- Login with **Dealer ID + passcode**
- Manage vehicles and media
- Upload images/videos to Cloudinary
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
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
│
├── apps/
│ ├── storefront/index.html
│ ├── dealer/index.html
│ └── admin/index.html
│
├── services/
│ ├── airtable.js
│ ├── auth.js
│ ├── cloudinary.js
│ └── analytics.js
│
└── public/assets/

yaml
Copy code


---

## Environment Variables

Create a local `.env` file (not committed) based on `.env.example`.

In production:
- Use **Cloud Run environment variables** or **Google Secret Manager**
- Never commit real secrets to GitHub

---

## Data Rules (Important)

- **Dealer ID** is the partition key for all data
- Vehicles are **never deleted**, only archived
- Media is hosted on Cloudinary
- Airtable stores:
  - Cloudinary `secure_url`
  - Optional Cloudinary metadata
- Dropdowns / single-select fields are enforced to keep data clean

---

## Status Values

Vehicles:
- `Available`
- `Pending`
- `Sold`
- `Archived`

Requests:
- `New`
- `Contacted`
- `Booked`
- `Closed`
- `No Show`

---

## Footer Requirement

All apps must display:


---

## Development

Install dependencies:
```bash
npm install

---

## ✅ You are now fully scaffolded

At this point:
- Repo structure is correct
- Config files are production-safe
- Documentation is locked
- No refactors needed later

### Next logical step
Say **“Start with `services/airtable.js`”**  
and we’ll implement the Airtable client + field mapping cleanly and fast.

npm run dev
npm start

