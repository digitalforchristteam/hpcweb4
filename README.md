# The Higher Place website

Three files, no folders:

| File | What it is |
|---|---|
| `worker.js` | The whole website: pages, forms, admin dashboard and backend. You never edit it. |
| `wrangler.jsonc` | One small settings file. You paste your database ID into it once. |
| `README.md` | This guide (setup, content audit, picture list, launch checklist). |

It runs free on Cloudflare (a Worker plus a D1 database) with **no credit card**, deployed from GitHub. All content is managed in the dashboard at `/admin`.

---

## Set up (about 30 minutes)

### 1. GitHub
1. Make a free account at github.com → **New repository** → name it `thp-website` → choose **Private** → Create.
2. Click **Add file → Upload files**, drag in the three files (`worker.js`, `wrangler.jsonc`, `README.md`), click **Commit changes**.

### 2. Cloudflare account and database (do this BEFORE deploying)
1. Sign up free at dash.cloudflare.com (no card needed for the free plan).
2. **Storage & databases → D1 SQL database → Create database.** Name it `thp-church`.
3. Open the database and copy its **Database ID** (a long code with dashes).
4. Back on GitHub, open `wrangler.jsonc`, click the pencil (edit), replace `PASTE-YOUR-DATABASE-ID-HERE` with your ID (keep the quote marks), click **Commit changes**.

### 3. Deploy
1. In Cloudflare: **Workers & Pages → Create → Import a repository** (Workers). Connect GitHub and pick your repo.
2. Keep the defaults and click **Deploy**. Name the Worker `hpcweb4` (it must match the name in `wrangler.jsonc`).
3. When it finishes you get an address like `hpcweb4.yourname.workers.dev`.

### 4. Admin password
Worker → **Settings → Variables and secrets → Add** (type **Secret**), two of them:
* `ADMIN_PASSWORD`: a long password for you and your admin team.
* `SESSION_SECRET`: any random 40+ characters (mash the keyboard; you never type it again).

Save/deploy when asked.

### 5. First visit
Open your address. The first visit creates the database tables and loads all your existing church content automatically. Then open **`/admin`** and sign in.

### 6. Your own domain (optional)
Worker → **Settings → Domains & routes → Add → Custom domain**. For this, the domain must use Cloudflare's free DNS: add thehigherplaceuk.com to Cloudflare and change the nameservers at your domain provider as Cloudflare instructs. (The yearly domain fee goes to your registrar and isn't part of this setup; the free `workers.dev` address costs nothing.) Read the launch checklist below first.

## Updating from an earlier version (hpcweb3 → hpcweb4)
Keep using the **same database** (same Database ID in `wrangler.jsonc`) and all your content and messages carry over; the new version updates what it needs automatically. Create the Worker `hpcweb4` from the repo, add the two secrets again (`ADMIN_PASSWORD`, `SESSION_SECRET`) and open the new address.

## What's new in this version
* Fixed the drop-down menus (they now open on hover/tap and close properly); tidier header.
* Smaller, 3-line home headline; section gaps reduced to about 2 cm on every page.
* Language bar at the top: English, Français, Español, 中文 (automatic Google Translate, loaded only when someone chooses a language; machine translation may be imperfect, so have a native speaker check key pages such as Beliefs).
* **Videos come from your YouTube channel automatically** (latest uploads appear in Home and the Sermon library; no copying needed). Any page can also show a YouTube video: edit the page and paste the link.
* "Follow along" on the home page: Facebook, Instagram and YouTube buttons plus an optional Facebook feed (loads only when pressed).
* Logo: upload it in Settings → Look and branding. Empty margins are trimmed automatically so the artwork fills the space.
* Facebook and Instagram **photos cannot be copied automatically** (they're protected and belong to the people in them). Download the ones you have permission to use and upload them in Pictures or on each page.

## Running costs
Everything uses Cloudflare's free plan at the time of writing: the Worker (100,000 requests/day) and D1 (5 GB storage, millions of reads/day). A church site stays far inside this. No card is asked for. You can confirm limits on Cloudflare's pricing pages.

## Using the dashboard (/admin)
* **Events:** add title, date, place. They show on Home and What's On, then disappear automatically after the date. Two December services are saved as hidden drafts; check them, then tick "Show on the website".
* **Settings:** service time, address, announcement bar, contacts, giving links, logo, home photo.
* **Messages:** every form arrives here, privately (prayer requests are never public). Download as a spreadsheet any time.
* **Pages:** edit wording of any page. Add new pages and choose which menu they appear in ("Church life" adds an automatic enquiry form and a visit prompt).
* **Sermons / Blog / FAQs / Team / Beliefs / Values / Stories:** add, edit, reorder, hide or delete.
* **Pictures:** upload photos (shrunk automatically). You can also upload inside each page, event or setting.
* Untick **Show on the website** to hide something without deleting it.

## Optional: email alerts (still free)
Free account at resend.com (no card) → create an API key → in Cloudflare add secrets `RESEND_API_KEY` and `NOTIFY_EMAIL` (your own email). You'll get a "new message arrived" alert; details stay in the dashboard for privacy.

## Honest limitations
* Pictures are stored in the database (card-free file storage isn't available), so each is limited to about 500 KB after automatic shrinking. Fine for web.
* No on-site search, no recurring-event engine (weekly gatherings are listed separately), no analytics (kept off for privacy and cost).
* The Vision 2030 PDF can't be stored here: upload it to Google Drive (or similar), copy the share link, and paste it in Settings → Links.
* On the free plan each request has a small processing limit. Pages measured about 1 ms in testing, far below it. If you ever see "Error 1102", tell me.
* I tested the single `worker.js` file with 80+ automated checks against a test database (all pages, forms, login, add/hide events, announcements, picture upload). I could not run it on a real Cloudflare account or view it in a real browser from here, so please click through every page after your first deploy and report anything odd.

---

## Content audit (old site → new site)

Old paths were kept wherever possible, so most links keep working.

| Old URL | New URL | Action |
|---|---|---|
| / | / | Rebuilt |
| /awareness (New Here?) | /awareness | Migrated + working form |
| /about | /about | Migrated |
| /beliefs | /beliefs | Migrated unchanged |
| /ourstory | /ourstory | Migrated |
| /dreamteam | /dreamteam | Migrated; other team names/photos needed |
| /s/Vision-2030-Multiplication.pdf | redirects to the link you set in Settings | **Add your link** |
| /help | /help | FAQs migrated |
| /youngadults, /youngpeople | /youngadults | Migrated; /youngpeople redirects |
| /students | /students | Migrated |
| /thp-kids | /thp-kids and /safeguarding | Migrated |
| /new-page-85 | /young-at-heart | Migrated; 301 redirect |
| /pastor-pauls-blog + 5 posts | /pastor-pauls-blog/… | Migrated in full; old post URLs redirect |
| /calendar | /calendar | Rebuilt; **events must be re-entered** (old calendar loads dynamically) |
| /sermonslibrary | /sermonslibrary | Not fully readable; 4 YouTube links from blog posts added; add the rest |
| /internships | /internships | Migrated (5 roles, 10 FAQs, quote) |
| /prayer | /prayer | Migrated + request form |
| /giving | /giving | Migrated; PayPal, bit.ly, CAF, Gift Aid links unchanged |
| (new) | /privacy /cookies /accessibility /safeguarding | **Drafts: need approval** |

Kept external services: PayPal, bit.ly giving link, CAF Donate, Gift Aid and internship Google Forms, ChurchSuite forms, Mailchimp, YouTube, Facebook, Instagram.

### Facts for the church to confirm
1. **Service time is inconsistent on the old site:** home and New Here say 10:15 AM; FAQs, Young Adults and Kids say 10:00 AM (kids check-in 9:45). The new home page uses 10:15 AM; FAQ wording is preserved as published. Confirm and edit in Settings and FAQs.
2. YouTube livestream at 10:00 AM, removed after 4 PM Sunday (from FAQs).
3. Friday prayer: no time on the FAQ; the July 2026 blog says 7:15–8:15 PM at GSU Room 025.
4. Young Adults Life Group (Tuesdays 7:30–8:30 PM, bi-weekly): the old page said "on break until early September"; that line was removed as out of date.
5. Christmas (13 Dec) and New Year's Eve (31 Dec) services come from an April 2026 forward look: saved as hidden drafts, venue/time unknown.
6. Titles, dates and speakers for the 4 seeded videos (titles taken from link text).
7. Bank details and charity number 1173023 were copied from the old site. Keep the GitHub repo **Private**.
8. Safeguarding lead (Adewale Adesanya, ade@thehigherplaceuk.com) from the Kids page.
9. Membership of Evangelical Alliance and Single Friendly Church Network.
10. Isabella's internship quote (Chief of Staff): confirm she agrees to its republication.
11. Only the pastors are named on the old team page; add other team members/trustees if wanted.
12. Privacy, cookie, accessibility and safeguarding pages are factual drafts of what this site does; please review (including how long you keep messages).
13. Old blog posts mention dated events; they're kept as history.

## Picture checklist
Until a photo is uploaded, a designed colour-circle placeholder shows, so nothing looks broken. Only upload photos you have permission to publish, especially of children.

| Where (dashboard location) | Shape / size | Subject |
|---|---|---|
| Logo (Settings → Look and branding) | Transparent PNG, ~600 px wide, must show on dark navy | Official logo (old one was white) |
| Home photo (Settings) | Portrait 900 × 1200 | Congregation / worship / welcome |
| Pastors (Team → Paul and Debi Ilo) | Portrait 600 × 800 | Pastors Paul and Debi |
| Each ministry page (Pages → Picture) | Landscape 1600 × 1200 | That group |
| What to expect cards (3) | Landscape 1600 × 1200 | Welcome, service, kids |
| Events | Landscape 1600 × 1000 | The event |

Videos: paste the YouTube link under Sermons. No background hero video is used, to keep the site fast on mobile.

## Launch checklist
Before going live
- [ ] Settings: service time, address, contacts and links confirmed
- [ ] Upload logo, home photo, pastors photo; add current events
- [ ] Work through the facts list above; approve the four legal pages
- [ ] Click every menu item, button and external link on phone and laptop
- [ ] Send a test message from each form; check it arrives in Messages
- [ ] Repo is Private; ADMIN_PASSWORD is long and unique

Going live
- [ ] Add the custom domain in Cloudflare; wait for it to turn active
- [ ] Open /sitemap.xml and /robots.txt
- [ ] Add the site to Google Search Console and submit /sitemap.xml
- [ ] Update Google Business Profile, YouTube, Facebook and Instagram links

After launch
- [ ] Check Search Console for errors in weeks 1–4; check Messages daily
- [ ] Monthly: Messages → Download CSV as a backup
