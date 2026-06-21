# Deploy Nouriva AI Landing Page to nouriva.tech

This is the production deployment guide. The whole page is **static** (single `index.html` + assets) — no build step, no framework, no server runtime.

**Total deploy size:** 2.3 MB (zip) / 2.5 MB (unzipped)

```
deploy-flat/
├── index.html             (~64 KB — all CSS inlined, JSON-LD, semantic tags)
├── favicon.png            (268 KB)
├── robots.txt             (crawl rules)
├── sitemap.xml            (1 URL with images, hreflang)
├── manifest.webmanifest   (PWA hints for mobile)
├── imgs/
│   ├── lab_report.jpg     (354 KB)
│   ├── phone_mockup.jpg   (166 KB)
│   ├── thali_hero.jpg     (884 KB)
│   └── og-cover.jpg       (104 KB — for social sharing)
└── videos/
    └── hero_loop.mp4      (624 KB)
```

---

## The fastest path: Cloudflare Pages (Direct Upload) + nameservers at Cloudflare

Why this path:
- **Free forever** (no credit card, no bandwidth limit on the free tier)
- **5 min** end-to-end once you have a Cloudflare account
- **CDN by default** — fast everywhere in the world
- **Free SSL** — auto-issues Let's Encrypt cert
- **Apex domain (nouriva.tech) works cleanly** because you move nameservers, which lets Cloudflare manage the DNS

You keep GoDaddy as the domain registrar (you still pay GoDaddy for the `.tech` registration, ~₹600/year). You only **move the nameservers** — GoDaddy remains the owner.

---

## Step 1 — Create a free Cloudflare account (if you don't have one)

Go to **https://dash.cloudflare.com/sign-up** and sign up with `yogesh@productverse.co.in` (or any email).

---

## Step 2 — Add `nouriva.tech` to Cloudflare and grab nameservers

1. In Cloudflare dashboard → click **+ Add a site** → type `nouriva.tech` → select **Free** plan → Continue.
2. Cloudflare will **scan your existing DNS records** from GoDaddy. It'll auto-discover your existing records. Click **Continue**.
3. Cloudflare gives you **two nameservers**. They'll look something like:
   ```
   aron.ns.cloudflare.com
   donna.ns.cloudflare.com
   ```
   **Copy these.** You'll need them in Step 3.

   ⚠️ Don't worry — these are different per domain. Cloudflare picks them randomly.

---

## Step 3 — Point GoDaddy's nameservers to Cloudflare

1. Go to **https://dcc.godaddy.com/domains** → click `nouriva.tech` → **DNS** tab (or **Nameservers** in older UIs).
2. Find the **Nameservers** section → click **Change**.
3. Select **Custom** → paste the two Cloudflare nameservers from Step 2.
4. Save. GoDaddy may show a confirmation modal — confirm.

**Propagation time:** 5 minutes to 48 hours, usually ~30 minutes. You'll get an email from Cloudflare when it propagates and your site is "active."

---

## Step 4 — Deploy the page on Cloudflare Pages

While you wait for nameserver propagation (you can do this in parallel — no harm):

1. In Cloudflare dashboard → left sidebar → **Workers & Pages** → **Create**.
2. Select **Pages** tab → **Upload assets** (not "Connect to Git" — you don't need GitHub for this).
3. **Project name:** `nouriva-tech` (or any name — Cloudflare will give you `<project-name>.pages.dev`).
4. **Upload the `deploy-flat.zip` file** — drag it onto the upload zone, or click to browse.
5. Click **Deploy site**.
6. After ~30 seconds, you'll see a green ✓ and a URL like `https://nouriva-tech.pages.dev`.

**Test it:** open that `*.pages.dev` URL in your browser. The page should look exactly like the cloudflared tunnel preview.

---

## Step 5 — Connect your custom domain

Once nameservers have propagated (Cloudflare will email you):

1. In Cloudflare → **Workers & Pages** → click your `nouriva-tech` project → **Custom domains** tab.
2. Click **Set up a custom domain** → enter `nouriva.tech` → Continue.
3. Cloudflare will automatically add the required DNS record (a CNAME for `www` and an Apex alias for the root) and provision a Let's Encrypt SSL cert.
4. Wait 5–10 minutes for SSL provisioning. You'll see a green ✓ when ready.

**Also add `www.nouriva.tech`:** repeat the process for `www.nouriva.tech`. It should also be auto-configured to point at the same Pages project.

---

## Step 6 — Set up redirects (optional but recommended)

In Cloudflare dashboard → **Rules** → **Redirect Rules** → Create rule:

- **Rule name:** `Apex to www`
- **When:** `Hostname` equals `nouriva.tech`
- **Then:** `URL redirect` → Type: `301`, Source: `nouriva.tech/{path}`, Destination: `https://www.nouriva.tech/{path}`

This way visitors who type `nouriva.tech` end up at `www.nouriva.tech` (or vice versa, your call).

---

## What happens to your existing email / subdomains?

**If you have email on nouriva.tech (e.g., Google Workspace, Zoho, Outlook):** Cloudflare's DNS scan will pick up your MX records during Step 2. They'll move over automatically — your email keeps working without interruption.

**If you have other subdomains on nouriva.tech** (e.g., `app.nouriva.tech`): Cloudflare's scan will pull those records too. They'll all keep working.

---

## Deployment complete checklist

After all 6 steps, verify:

- [ ] `https://nouriva.tech` → loads the landing page (deep green hero, video bg)
- [ ] `https://www.nouriva.tech` → same page
- [ ] `http://nouriva.tech` (no `https`) → redirects to `https://`
- [ ] Both App Store and Google Play buttons work (open in new tab to the right URL)
- [ ] Hero video plays (autoplay muted loop)
- [ ] Page renders correctly on mobile (open in phone browser)
- [ ] No console errors in browser DevTools
- [ ] SSL padlock shows in browser address bar

---

## Making updates later

### Option A — GitHub auto-deploy (recommended)

Push changes to `main` and GitHub Actions deploys to Cloudflare Pages automatically.

**One-time setup**

1. **Commit the landing site** (if not already in git):
   ```bash
   cd /Users/yogs87/Downloads/FoodScannerApp
   git add nouriva-landing/ .github/workflows/deploy-nouriva-landing.yml
   git commit -m "Add nouriva.tech landing with Cloudflare Pages CI/CD"
   git push origin main
   ```

2. **Create a Cloudflare API token** (if you don't have one):
   - Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
   - Use template **Edit Cloudflare Workers** (includes Pages edit), or create custom with:
     - **Account** → **Cloudflare Pages** → **Edit**
     - **Account** → **Account Settings** → **Read**
   - Copy the token — you won't see it again.

3. **Get your Account ID**:
   - Cloudflare dashboard → any domain or Workers & Pages → right sidebar → **Account ID**

4. **Add GitHub secrets** at `https://github.com/yogsbags/nouriva/settings/secrets/actions`:
   - `CLOUDFLARE_API_TOKEN` — the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID` — from step 3

5. **Trigger a deploy**: push any change under `nouriva-landing/`, or run the workflow manually from **Actions → Deploy Nouriva Landing → Run workflow**.

**Day-to-day workflow**

1. Edit files in `nouriva-landing/`
2. `git push origin main`
3. Watch deploy at **GitHub → Actions** (usually ~30 seconds)

**Local manual deploy** (optional):

```bash
cd nouriva-landing
npm install
npx wrangler login          # first time only
npm run deploy
```

> **Note:** If you originally created the Pages project via **Direct Upload** (zip upload), GitHub Actions + Wrangler still works with the same project name (`nouriva-tech`). You cannot switch that project to Cloudflare's native "Connect to Git" UI — use this Actions workflow instead.

### Option B — Manual zip upload

1. Edit files in `nouriva-landing/`
2. Re-zip: `cd nouriva-landing && zip -r ../nouriva-tech-v2.zip . -x "*.DS_Store" -x "node_modules/*"`
3. Cloudflare dashboard → Workers & Pages → your project → **Create new deployment** → upload zip

### Option C — Cloudflare native Git integration (new projects only)

If you have **not** deployed via Direct Upload yet, you can connect GitHub in the Cloudflare dashboard instead:

1. Workers & Pages → **Create** → **Pages** → **Connect to Git**
2. Select repo `yogsbags/nouriva`, branch `main`
3. **Root directory:** `nouriva-landing`
4. **Build command:** leave blank (static site, no build)
5. **Build output directory:** `/` (the root directory itself)
6. Save and deploy

Custom domain `nouriva.tech` stays attached to the same Pages project either way.

---

## Alternate path: keep DNS at GoDaddy (no nameserver move)

If you'd rather not move nameservers (e.g., email on a different registrar, paranoid about DNS migration), you can connect the domain via CNAME only. This is more limited:

- `www.nouriva.tech` → works via CNAME
- `nouriva.tech` (apex) → requires GoDaddy's "URL Forwarding" feature (free, but limited to 100 redirects/year in some plans, and breaks SSL on the bare domain)

For a marketing landing page, the nameserver move is the better path. But if you must keep DNS at GoDaddy, here's the gist:

1. Deploy on Cloudflare Pages the same way (Step 4 above).
2. At GoDaddy DNS, add: `CNAME` record → Host: `www`, Value: `nouriva-tech.pages.dev`, TTL: 600
3. In Cloudflare Pages → Custom domains → add `www.nouriva.tech` (Cloudflare will verify the CNAME).
4. For the apex (`nouriva.tech`), set GoDaddy **URL Forwarding** to redirect `nouriva.tech` → `https://www.nouriva.tech` with 301 and SSL enabled.

---

## Files in this deployment

- `index.html` — single-page site, 52 KB, all CSS inlined
- `imgs/lab_report.jpg` — lab report editorial still, 354 KB
- `imgs/phone_mockup.jpg` — phone product mockup, 166 KB
- `imgs/thali_hero.jpg` — Indian thali hero still, 884 KB
- `videos/hero_loop.mp4` — hero background video, 624 KB, autoplay muted loop
- `favicon.png` — brand mark, 268 KB

**Backup:** original 4K-resolution PNG/JPG masters are at `../_originals_backup/` outside the deploy folder.

---

## Need to roll back?

Just deploy the previous zip from your local archive. Cloudflare keeps deployment history — you can roll back to any past deployment in 2 clicks from the Pages dashboard.

---

## Performance expectations

Cloudflare's free tier will serve your page from 300+ data centers worldwide. Expected page metrics:

- **First Contentful Paint:** < 0.5s
- **Largest Contentful Paint:** < 1.2s (hero image lazy-loads)
- **Total transfer (above the fold):** ~700 KB (video metadata + hero + critical CSS)
- **Total transfer (full page):** ~2.5 MB

All numbers should hit green in Lighthouse / PageSpeed Insights.

---

## Questions?

If anything in this guide breaks, Cloudflare's support docs are excellent:
- Adding a site: https://developers.cloudflare.com/fundamentals/setup/manage-domains/add-site/
- Pages direct upload: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Custom domains: https://developers.cloudflare.com/pages/configuration/custom-domains/

---

## SEO & ranking strategy

### What's already in the page (this deploy)

- ✅ **Title tag** (53 chars, keyword-rich: "Nutrition App That Reads Your Lab Report")
- ✅ **Meta description** (176 chars, click-worthy with primary + secondary keywords)
- ✅ **Single H1**, clean h2/h3 hierarchy (10 h2s, semantic sections)
- ✅ **Canonical URL** + `hreflang` for `en-IN` and `x-default`
- ✅ **Open Graph** + **Twitter Cards** with 1200×630 og-cover image
- ✅ **Apple Smart App Banner** (shows install button when iPhone users visit)
- ✅ **Android App Link** (deep links from web to app)
- ✅ **JSON-LD structured data** — 5 schemas:
  - `MobileApplication` (app name, price, rating, install URLs, screenshots, feature list)
  - `Organization` (Productverse, founder, address, contact)
  - `WebSite` (with `inLanguage: en-IN`)
  - `FAQPage` (matches the on-page FAQ; eligible for FAQ rich snippets in Google)
  - `BreadcrumbList` (helps with sitelinks)
- ✅ **robots.txt** (blocks AI training bots, points to sitemap)
- ✅ **sitemap.xml** with image sitemap extensions
- ✅ **PWA manifest** (mobile install hint)
- ✅ **Lazy-loaded images**, video `preload="metadata"` only
- ✅ **HTTPS** (Cloudflare auto-provisions Let's Encrypt)
- ✅ **Mobile responsive**, CLS-zero layout

### What this gets you in Google

Once indexed, you'll get:
- **App install button** in mobile SERPs (iOS + Android, via MobileApplication schema)
- **FAQ rich snippets** — your 6 FAQs show as expandable dropdowns in search results (huge CTR boost)
- **Knowledge Panel eligibility** for "Nouriva AI" branded searches (via Organization schema)
- **Rich star rating** in app-related searches (via AggregateRating)
- **Image results** for "Nouriva AI app" image searches

### What this does NOT get you (you need off-page work)

The on-page SEO is a strong foundation, but ranking on competitive terms needs more:

**Timeline estimates (with monthly effort):**

| Search term | Competition | Realistic ranking timeline |
|---|---|---|
| "nutrition app India" | High | 6–12 months |
| "best nutrition app" | Very high (MyFitnessPal etc.) | 12–18+ months |
| "diabetes meal planner" | High | 6–9 months |
| "PCOS diet app India" | Medium | 3–6 months |
| "thyroid diet app" | Medium-low | 3–6 months |
| **"lab report nutrition app"** | **Very low (you're first)** | **2–4 weeks** |
| **"lab-aware diet app"** | **Zero competition** | **2–4 weeks** |
| **"nutrition app that reads lab report"** | **Zero competition** | **1–2 weeks** |

### What to do AFTER deploying (the off-page part)

This is what actually moves rankings:

1. **Submit your sitemap to Google Search Console** (do this within 24h of deploy)
   - https://search.google.com/search-console/ → Add property → `https://nouriva.tech/`
   - Verify via DNS TXT record (Cloudflare DNS → Add `TXT` record with the value Google gives you)
   - Sitemaps → Submit `https://nouriva.tech/sitemap.xml`
   - URL Inspection → Request indexing for `https://nouriva.tech/`

2. **Submit to Bing Webmaster Tools** (Bing powers DuckDuckGo and most AI search)
   - https://www.bing.com/webmasters

3. **Get 5–10 backlinks in month 1** from:
   - ProductHunt launch (gives 100+ referrals + 1 strong DR80+ backlink)
   - Reddit r/IndianFood, r/PCOS, r/diabetes, r/india, r/SideProject
   - Your existing Productverse homepage link (already in footer)
   - AppSumo / BetaList submission
   - 2–3 guest posts on Indian health/lifestyle blogs
   - 1 round of HARO / Qwoted responses to journalist queries

4. **Build 3–5 long-form articles** (separate blog subdomain or subfolder):
   - `/blog/diabetes-meal-planning-india` (target keyword: "diabetes meal planner India")
   - `/blog/pcos-diet-india` (target keyword: "PCOS diet India")
   - `/blog/thyroid-diet-india` (target keyword: "thyroid diet Indian food")
   - `/blog/how-to-read-lab-report-india` (target keyword: "how to read lab report India")
   - `/blog/best-foods-for-vitamin-d-deficiency-india`
   
   Each article = 1500–2500 words, internally linked back to the home page, with FAQ schema of its own. This is the single highest-ROI SEO activity.

5. **App Store SEO** (often higher ROI than web SEO for an app product):
   - App Store title: include "Lab Report" + 2–3 conditions ("Nouriva AI — Lab Report & Diabetes, PCOS, Thyroid Nutrition")
   - Subtitle: "Personalised nutrition for your lab work and medical conditions"
   - Keywords field: `lab,report,diabetes,PCOS,thyroid,India,diet,clinical,nutrition,organ,vitamin`
   - First 3 reviews matter most — seed from friends/family who genuinely used it

6. **Brand mentions** (unlinked still help):
   - Twitter/X account @nourivaai posting weekly meal scans with clinical insight
   - LinkedIn founder posts on nutrition science from your domain
   - Quora answers linking back when relevant (low-quality but works)

### Quick SEO wins you can ship yourself

If you want me to add a `/blog` section to this same deployment, just say so. It's a couple of hours of work and the articles I listed above would each be 1500+ words. They'd give you ~10× more indexable content immediately.

### Analytics + measurement

After deploy, set up:
- **Cloudflare Web Analytics** (free, no cookie banner needed — uses Cloudflare's edge data)
- **Plausible** or **Umami** (privacy-friendly, no GDPR banner)
- **Google Analytics 4** (most powerful, but adds a cookie banner)
- **Google Search Console** (essential for monitoring rankings)

Want me to wire up Plausible or Cloudflare Web Analytics as the next pass? It's a 5-min add.

