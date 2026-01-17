# Odd Wheels POS (Production Starter)

This is a **VS Code-ready** Next.js + TypeScript + Tailwind starter that matches the **Odd Wheels POS SRS**:
- Public browsing (no login required)
- Login required for cart & checkout
- Product identity + condition variants (sealed/unsealed/with issues) with different prices
- Buyer cannot see sold-out variants; product hides when all variants sold out
- Admin-managed Brand Tabs & Homepage Notice Board
- Shipping methods:
  - **LBC** (COP adds ₱20 fee, capacity-aware package selection)
  - **J&T** (capacity-aware, large pouch disabled)
  - **Lalamove** (+₱50 convenience fee + buyer availability table)
- Priority Shipping:
  - Admin-controlled availability
  - If approved: ships **next day after payment** (ignores schedule)
  - ₱50 fee
- Optional Shipping Insurance:
  - Unchecked by default
  - Suggested fee auto-calculated (₱5 per ₱500), shown muted, editable, applied only if checked
- Barcode-assisted inventory entry:
  - Barcode lookup via API (RapidAPI endpoint configurable)
  - Auto-fill brand/model/color-style
  - Auto-fetch images (admin confirms; stored locally in Supabase Storage; no hotlink)
  - Smarter fallback: if the API misses fields, the app tries to infer brand/model/color from the title
  - Manual image options: paste a URL or upload a file if the barcode API has no image

- Auth improvements:
  - Register collects: **Name, Username, Contact Number, Email, Password, Address (optional)**
  - Login accepts: **Email, Username, or Phone Number** (resolver uses server/service key)
  - Account Settings page to edit profile info and set a default shipping address

> ⚠️ This is a production starter. You must configure Supabase tables, RLS policies, and fill `.env.local`.

---

## 1) Setup (Local)

1. Install dependencies:
```bash
npm install
```

2. Copy env file:
```bash
cp .env.example .env.local
```
Fill in your Supabase URL + keys.

3. Create database schema:
- Open `/supabase/schema.sql` and run it in the Supabase SQL editor.

4. Run:
```bash
npm run dev
```

---

## 2) Supabase Notes (Important)

- Buyer visibility is enforced via **RLS**:
  - Buyers cannot select sold-out variants or sold-out products.
- Staff (admin/cashier) can view everything.
- Orders/inventory updates should use the `fn_process_paid_order(order_id)` RPC for atomic deduction.

### Making yourself Admin / Cashier

After you create your account and the profile row exists, run this in Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where id = '<YOUR_AUTH_UID_HERE>';
```

For cashier:

```sql
update public.profiles
set role = 'cashier'
where id = '<YOUR_AUTH_UID_HERE>';
```



## 3) Payments (GCash / BPI)

Payment routes are scaffolded:
- `POST /api/payments/checkout` (create payment intent/session - TODO)
- `POST /api/payments/webhook` (provider webhook - TODO)

You must:
- add provider credentials to `.env.local`
- implement signature verification
- call `fn_process_paid_order(order_id)` using the Supabase service role key

---

## 4) Barcode Lookup + Image Fetch

Barcode lookup is scaffolded:
- `GET /api/barcode/lookup?barcode=...`

You must configure:
- `RAPIDAPI_KEY`
- `RAPIDAPI_BARCODE_ENDPOINT`

Images are imported via:
- `POST /api/images/import` (downloads external URL then uploads to Supabase Storage)

Manual image upload is handled by:
- `POST /api/images/upload` (uploads a file directly to Supabase Storage)

Username/phone login resolution uses:
- `POST /api/auth/resolve-email` (requires `SUPABASE_SERVICE_ROLE_KEY`)

Google search lookup is available:
- `GET /api/google/lookup?q=...`
- Configure `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` for Google Custom Search JSON API.

---

## 5) Open in VS Code
Open the folder `odd-wheels-pos` in VS Code. Recommended extensions are included in `.vscode/extensions.json`.

---

## License
Internal / private project.
