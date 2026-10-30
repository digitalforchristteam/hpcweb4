// The Higher Place website: ONE file that contains the whole site (pages, forms, admin dashboard, backend).
// You never need to edit this file. All content is managed in the dashboard at /admin.
// Runs on a Cloudflare Worker with a D1 database (free plan, no credit card).

// ===== util.js =====
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Current London time as "YYYY-MM-DDTHH:MM" (used to decide which events are upcoming)
const londonNow = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', 'T');

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' });
const monFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const asDate = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s.slice(0, 10) + 'T12:00:00Z') : null);

const fmtDate = (s) => { const d = asDate(s); return d ? dateFmt.format(d) : ''; };
const fmtShort = (s) => { const d = asDate(s); return d ? shortFmt.format(d) : ''; };
const dayNum = (s) => { const d = asDate(s); return d ? dayFmt.format(d) : ''; };
const monName = (s) => { const d = asDate(s); return d ? monFmt.format(d) : ''; };
const fmtTime = (s) => {
  const m = /T(\d{2}):(\d{2})/.exec(s || ''); if (!m) return '';
  let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
};

const slugify = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const ytId = (u) => {
  const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(u || '');
  return m ? m[1] : '';
};

const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const xml = (t) => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
// Reads the channel's public video feed so new YouTube uploads appear on the site automatically.
async function ytFeed(channel) {
  if (!channel) return [];
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 3000);
    const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channel), { signal: ac.signal, cf: { cacheTtl: 1800, cacheEverything: true } });
    clearTimeout(t); if (!r.ok) return [];
    const x = await r.text();
    return [...x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 15).map((m) => {
      const g = (re) => (re.exec(m[1]) || [])[1] || '';
      return { id: g(/<yt:videoId>([^<]+)</), title: xml(g(/<title>([^<]*)</)), date: g(/<published>(\d{4}-\d{2}-\d{2})/) };
    }).filter((v) => v.id);
  } catch { return []; }
}


// ===== md.js =====

// A small, safe Markdown converter: paragraphs, ## headings, lists, > quotes, **bold**, *italic*, [links](url)
const okUrl = (u) => /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(u);
const inline = (t) =>
  esc(t)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, u) => {
      const raw = u.replace(/&amp;/g, '&');
      if (!okUrl(raw)) return a;
      const ext = /^https?:/i.test(raw) ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${u}"${ext}>${a}</a>`;
    });

function md(src = '') {
  const out = [];
  for (const block of String(src).replace(/\r/g, '').split(/\n{2,}/)) {
    const t = block.trim(); if (!t) continue;
    const lines = t.split('\n'); let m;
    if (lines.length === 1 && (m = t.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.max(2, m[1].length); out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
    else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) out.push('<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') + '</ul>');
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push('<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>');
    else if (lines.every((l) => /^>\s?/.test(l))) out.push('<blockquote>' + lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>') + '</blockquote>');
    else out.push('<p>' + lines.map(inline).join('<br>') + '</p>');
  }
  return out.join('\n');
}
const plain = (src = '', n = 160) => String(src).replace(/[#*>\[\]()_`-]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);


// ===== forms.js =====
// One definition per form: used to draw the form AND to validate it on the server.
const AREAS = ['Multimedia', 'Host / Welcome', 'Welfare', 'Kids Ministry', 'Worship', 'Evangelism & Follow-Up', 'Prayer', 'Counselling'];
const GROUPS = ['Greenwich / Charlton', 'Dartford / Gravesend', 'East London', 'Young Adults', 'Young at Heart', 'Empowered Parents', 'Students', 'Online', 'Not sure yet'];
const CATEGORIES = ['General question', 'Giving and Gift Aid', 'Kids and families', 'Young adults', 'Students', 'Life Groups', 'Volunteering', 'Events and courses', 'Safeguarding', 'Something else'];

const FORMS = {
  visit: {
    title: 'Plan your visit', submit: 'Tell us you’re coming',
    ok: 'Thank you! Our team will look out for you this Sunday.',
    fields: [
      { n: 'name', l: 'First name', t: 'text', req: 1, max: 80, ac: 'given-name' },
      { n: 'email', l: 'Email address', t: 'email', req: 1, ac: 'email' },
      { n: 'phone', l: 'Telephone (optional)', t: 'tel', max: 30, ac: 'tel' },
      { n: 'party', l: 'Who is coming with you?', t: 'text', max: 200, ph: 'For example: my partner and two children' },
      { n: 'message', l: 'Questions or access needs (optional)', t: 'textarea', max: 1500 },
      { n: 'contact_pref', l: 'How should we reach you?', t: 'select', opts: ['Email', 'Phone or text', 'No need to contact me'] },
      { n: 'attending', l: 'I plan to come this Sunday', t: 'check' },
    ],
  },
  contact: {
    title: 'Contact us', submit: 'Send message',
    ok: 'Thank you, your message has been sent. We’ll get back to you soon.',
    fields: [
      { n: 'name', l: 'Your name', t: 'text', req: 1, max: 100, ac: 'name' },
      { n: 'email', l: 'Email address', t: 'email', req: 1, ac: 'email' },
      { n: 'category', l: 'What is it about?', t: 'select', opts: CATEGORIES, req: 1 },
      { n: 'message', l: 'Message', t: 'textarea', req: 1, max: 3000 },
    ],
  },
  prayer: {
    title: 'Prayer request', submit: 'Send prayer request',
    ok: 'Thank you for trusting us with this. Our prayer team will be praying with you.',
    fields: [
      { n: 'name', l: 'Your name (optional)', t: 'text', max: 100, ac: 'name' },
      { n: 'email', l: 'Email address (optional)', t: 'email', ac: 'email' },
      { n: 'message', l: 'Your prayer request', t: 'textarea', req: 1, max: 3000 },
      { n: 'followup', l: 'I’d like someone to follow up with me (please add your email)', t: 'check' },
    ],
  },
  lifegroup: {
    title: 'Join a Life Group', submit: 'Request a Life Group',
    ok: 'Thank you! Someone from our team will be in touch about a group near you.',
    fields: [
      { n: 'name', l: 'Your name', t: 'text', req: 1, max: 100, ac: 'name' },
      { n: 'email', l: 'Email address', t: 'email', req: 1, ac: 'email' },
      { n: 'group', l: 'Preferred group or area', t: 'select', opts: GROUPS, req: 1 },
      { n: 'message', l: 'Anything else? (optional)', t: 'textarea', max: 1500 },
    ],
  },
  volunteer: {
    title: 'Volunteer', submit: 'Offer to serve',
    ok: 'Thank you for offering to serve! Our team will be in touch.',
    fields: [
      { n: 'name', l: 'Your name', t: 'text', req: 1, max: 100, ac: 'name' },
      { n: 'email', l: 'Email address', t: 'email', req: 1, ac: 'email' },
      { n: 'areas', l: 'Where would you like to serve?', t: 'checks', opts: AREAS, req: 1 },
      { n: 'message', l: 'Anything else? (optional)', t: 'textarea', max: 1500 },
    ],
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(kind, input) {
  const form = FORMS[kind]; const errors = {}; const data = {};
  for (const f of form.fields) {
    let v = input[f.n];
    if (f.t === 'checks') {
      const arr = (Array.isArray(v) ? v : v ? [v] : []).map(String).filter((x) => f.opts.includes(x));
      if (f.req && !arr.length) errors[f.n] = 'Please choose at least one.';
      data[f.n] = arr; continue;
    }
    if (f.t === 'check') { data[f.n] = v === 'on' || v === 'true' || v === true; continue; }
    v = String(v ?? '').trim();
    if (f.req && !v) { errors[f.n] = 'This field is required.'; continue; }
    if (!v) { data[f.n] = ''; continue; }
    if (v.length > (f.max || 300)) { errors[f.n] = `Please keep this under ${f.max || 300} characters.`; continue; }
    if (f.t === 'email' && !EMAIL.test(v)) { errors[f.n] = 'Please enter a valid email address, like name@example.com.'; continue; }
    if (f.t === 'select' && !f.opts.includes(v)) { errors[f.n] = 'Please choose one of the options.'; continue; }
    data[f.n] = v;
  }
  if (kind === 'prayer' && data.followup && !data.email) errors.email = 'Please add your email so we can follow up.';
  return { errors, data };
}


// ===== auth.js =====
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
async function sha256(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function safeEqual(a, b) { return (await sha256(a)) === (await sha256(b)); }

const COOKIE = 'thp_admin';
async function makeSession(env) {
  const exp = Date.now() + 12 * 3600 * 1000;
  return `${exp}.${await hmac(env.SESSION_SECRET, 'session:' + exp)}`;
}
async function isAdmin(req, env) {
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD) return false;
  const m = /(?:^|;\s*)thp_admin=([^;]+)/.exec(req.headers.get('cookie') || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, 'session:' + exp));
}
const sessionCookie = (v, maxAge = 43200) => `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const clientHash = async (req, env, salt = '') => sha256((req.headers.get('cf-connecting-ip') || 'local') + (env.SESSION_SECRET || '') + salt);


// ===== seed.js =====
// Starting content, copied from the existing website (thehigherplaceuk.com) during the audit.
// It is loaded into the database automatically the first time the site runs.
// After that, ALL content is edited in the admin dashboard (/admin) - not here.

const SETTINGS = {
  site_name: 'The Higher Place',
  tagline: 'A Church for Every Nation and Generation',
  mission: 'The Higher Place exists so that ordinary people from every nation and generation can be transformed into passionate leaders for Jesus.',
  meta_description: 'We are a church who is passionate about loving God with all our heart, soul, strength and mind, and loving our neighbour as ourselves. We love God, we love people, and we love life!',
  logo_url: '',
  hero_image: '',
  announcement_on: '0',
  announcement_text: '',
  announcement_link: '',
  service_day: 'Sundays',
  service_time: '10:15 AM',
  venue_name: 'Greenwich Picturehouse',
  address: '180 Greenwich High Road, London SE10 8NN',
  map_url: 'https://www.google.com/maps/search/?api=1&query=Greenwich+Picturehouse+180+Greenwich+High+Road+London+SE10+8NN',
  parking_note: 'If you are driving, we have some allocated parking spaces nearby, please email us at love@thehigherplaceuk.com to reserve a space.',
  email: 'love@thehigherplaceuk.com',
  phone: '07424663805',
  prayer_email: 'prayer@thehigherplaceuk.com',
  safeguarding_name: 'Adewale Adesanya',
  safeguarding_email: 'ade@thehigherplaceuk.com',
  charity_no: '1173023',
  youtube_url: 'https://www.youtube.com/channel/UCQqjPVZjI85I6q8fEM-afMA',
  facebook_url: 'https://www.facebook.com/thehigherplaceuk',
  instagram_url: 'https://instagram.com/thehigherplaceuk',
  newsletter_url: 'https://thehigherplaceuk.us19.list-manage.com/subscribe?u=95e33a15956820985c7782336&id=c886c52480',
  digest_url: 'https://mailchi.mp/bebd4a3c09e3/weekly-devotionals-newsletters-and-more',
  next_step_url: 'https://thehigherplacechurch.churchsuite.com/-/forms/dgnvwdea',
  lifegroups_url: 'https://thehigherplacechurch.churchsuite.com/-/forms/rynjdkiz',
  give_paypal_url: 'https://www.paypal.com/donate/?cmd=_s-xclick&hosted_button_id=QNLN3DXB7R26G&source=url',
  give_link_url: 'https://bit.ly/49uy6nx',
  gift_aid_url: 'https://docs.google.com/forms/d/e/1FAIpQLSelEMf2rohtCKmCuTSTOZtN6w5SyYKZBkd2U0C1HES73OzzAw/viewform?usp=sharing&ouid=112626349758661393884',
  expansion_url: 'https://cafdonate.cafonline.org/21965',
  bank_name: 'The Higher Place',
  bank_sort: '601616',
  bank_account: '82152136',
  bank_note: 'NatWest',
  expansion_sort: '601616',
  expansion_account: '84952083',
  internship_apply_url: 'https://docs.google.com/forms/d/e/1FAIpQLSeXOGpwIiFmQFw-O46Qk30PhzEsSkJBJ0av5JbpI8uh1Zgx7g/viewform?usp=sharing',
  book_url: 'https://amzn.eu/d/0h6i4DNF',
  vision_pdf: '',
  youtube_channel_id: 'UCQqjPVZjI85I6q8fEM-afMA',
  _m2: '1'
};

const P = (slug, title, sort, data) => ({ type: 'page', slug, title, sort, published: 1, data });

const ITEMS = [
  // ---------- Editable pages ----------
  P('about', 'Our Mission', 1, {
    tone: 'cobalt', menu: 'about',
    intro: 'Be rejuvenated in our thriving community where our mission is ‘to see ordinary people from every nation and generation transformed into passionate leaders for Jesus.’',
    quote: 'Jesus replied, ‘You must love the LORD your God with all your heart, all your soul, and all your mind. This is the first and greatest commandment. A second is equally important: Love your neighbour as yourself’',
    quote_ref: 'Matthew 22:37-39',
    meta: 'Our mission and values at The Higher Place, a multicultural and multigenerational church in Greenwich, London.',
    body: `At the heart of our vision lies a three-fold objective:

- **Connecting people to Jesus**
- **Connecting people to life-giving relationships**
- **Connecting people to their God-given destinies.**

We are a community that influences in order to transform our world as together we first love God so that through His Spirit our hearts, souls and minds are enabled in loving our neighbours as ourselves. Above all else we are there for you as you wholeheartedly embrace the notion of truly forgiving yourself.

**As a thriving community, we are here to see ordinary people from every nation and generation transformed into passionate leaders for Jesus.** What we mean to say is that there are lots of people who have an ordinary dream, and yet we have people who make our place their home to find God's dream for their lives. And so we want to become people who passionately love Jesus and fearlessly commit to stepping out and doing what Jesus asks: *“To Change The World”*.`
  }),
  P('beliefs', 'Our Beliefs', 2, {
    tone: 'navy', menu: '',
    intro: 'What we believe, and the Scriptures that anchor it.',
    meta: 'What The Higher Place church in Greenwich believes about the Church, salvation, the Bible, the Trinity, the Holy Spirit and eternity.',
    body: ''
  }),
  P('ourstory', 'Our Story', 3, {
    tone: 'coral', menu: 'about',
    intro: 'Launched on 16 July 2016 in Greenwich, and still writing the story.',
    meta: 'The story of The Higher Place church: from Devonport House in 2016 to Greenwich Picturehouse today.',
    body: `The Higher Place was launched on the 16th of July, 2016 at Devonport House in Greenwich. We worshipped at Devonport House for about 6 months and we moved to one of the rooms at Charlton Athletic stadium. We spent 2 wonderful years there building deeper roots – some of the members from those days are still with us till today.

In 2019, God provided a way for us to move back to central Greenwich at Greenwich Students Union where we worshipped for 6 years before moving to Greenwich Picturehouse where we currently are.

Through prophecies and dreams from God, we’ve felt God saying that we were going to mobilise thousands under the banner of the local church for a move of God and that this would be a multicultural and multigenerational church.

We felt God anchoring our ministry with verses like Habakkuk 3:19 – where we got the name of the church from; Isaiah 2:2 which is where we got the multicultural and multigenerational dimension of the church from; Isaiah 41:10.

### We love being part of something much bigger than ourselves!

We are members of [Evangelical Alliance](http://www.eauk.org/) and the [Single Friendly Church Network](https://www.singlefriendlychurch.com/).`
  }),
  P('dreamteam', 'Our Team', 4, {
    tone: 'lilac', menu: '',
    intro: 'The people who serve and lead The Higher Place.',
    quote: 'It is our desire to help people feel at home as we serve our community and city. Because when it comes to building a foundation for life, there’s no better place to start than the local church! We are here to see ordinary people from every nation and generation transformed into passionate leaders for Jesus. Come and see!',
    quote_ref: 'Paul and Debi Ilo (Lead Pastors)',
    meta: 'Meet Pastors Paul and Debi Ilo and the team at The Higher Place church in Greenwich, London.',
    body: 'We also have Trustees who are responsible for the legal and financial aspects of the charity.'
  }),
  P('awareness', 'New here?', 5, {
    tone: 'cobalt', menu: '',
    intro: 'A Place to Belong and Become.',
    meta: 'New to The Higher Place? Plan your visit to our Sunday church service at Greenwich Picturehouse, see what to expect and find your next step.',
    body: 'If you’re in Greenwich or the surrounding areas and are looking for a church to call home, we’re excited to welcome you to The Higher Place Church. Our prayer is simple: that you feel seen, encouraged, and supported as you take your next steps.'
  }),
  P('help', 'FAQs', 6, {
    tone: 'amber', menu: '',
    intro: 'Frequently Asked Questions',
    meta: 'Answers about Sunday services, parking, livestreams, Life Groups, giving and volunteering at The Higher Place church in Greenwich.',
    body: ''
  }),
  P('calendar', 'What’s On', 7, {
    tone: 'coral', menu: '',
    intro: 'There’s always something happening—and you’re invited.',
    meta: 'Upcoming events, prayer meetings and regular gatherings at The Higher Place church in Greenwich, London.',
    body: 'If you’re exploring church for the first time, looking to build friendships, or wanting to grow in your faith, we’d love to welcome you to one of our upcoming events.'
  }),
  P('sermonslibrary', 'Sermon Library', 8, {
    tone: 'navy', menu: 'involved',
    intro: 'Catch up on messages, or watch live on YouTube.',
    meta: 'Watch recent messages and livestreams from The Higher Place church, Greenwich.',
    body: 'The latest message is available on our YouTube channel. We currently stream our services live at 10:00AM. The livestream remains available for a while to accommodate those who may miss the service, but it is removed after 4:00 PM on Sunday.'
  }),
  P('pastor-pauls-blog', 'Pastor Paul’s Blog', 9, {
    tone: 'lilac', menu: 'life',
    intro: 'Updates and encouragement from Pastor Paul Ilo.',
    meta: 'Church updates and encouragement from Pastor Paul Ilo of The Higher Place, Greenwich.',
    body: ''
  }),
  P('giving', 'Give', 10, {
    tone: 'amber', menu: '',
    intro: 'Thank you for your generous heart!',
    meta: 'Give to The Higher Place church: one-off or monthly giving, Gift Aid and our Expansion Fund.',
    body: `At our church, we believe that giving is one of the ways we worship God. We also believe that it is God who gives us our possessions, our talents, and even our finances, and that is why we honour Him by giving back joyfully and generously. **We give because He first gave to us!**

Join us as we worship God together with our finances! Your generosity means that we can reach more people, make a greater impact, and spread the love of Jesus in our local community and around the world.

You can give with cash on Sundays. However, we would encourage you to consider setting up a regular monthly donation to help automate your giving.`
  }),
  P('prayer', 'Prayer', 11, {
    tone: 'lilac', menu: '',
    intro: 'Passion for His Presence and Prayer are some strong pillars here at The Higher Place.',
    meta: 'Ask for prayer or join our prayer meetings at The Higher Place church in Greenwich.',
    body: `We believe that much of the blessing we’ve seen over the years is a result of our commitment to pray and seek God's face. The more we press forward in our journey of serving people from every nation and generation to become leaders for Jesus, the deeper our foundations in prayer need to be.`
  }),
  P('get-involved', 'Get involved', 12, {
    tone: 'coral', menu: '',
    intro: 'Church is more than Sundays. Join a Life Group or serve on a team.',
    meta: 'Join a Life Group or volunteer at The Higher Place church in Greenwich, London.',
    body: 'We believe church is beyond Sundays, and Life Groups are one of the ways we stay connected during the week. Here, you can build friendships, grow in faith, and find support.'
  }),
  P('contact', 'Contact us', 13, {
    tone: 'cobalt', menu: '',
    intro: 'We’d love to hear from you.',
    meta: 'Contact The Higher Place church in Greenwich, London by form, email or phone.',
    body: ''
  }),
  P('youngadults', 'Young Adults', 20, {
    tone: 'coral', menu: 'life', facts: 'Who | Ages 18 to 35\nSundays | 10:00 AM at Greenwich Picturehouse\nLife Group | Tuesdays 7:30–8:30 PM (bi-weekly)',
    intro: 'A place to belong and become all that God has called you to be! We welcome young people from every nation and tribe!',
    quote: 'In the last days, God says, I will pour out my Spirit on all people. Your sons and daughters will prophesy, your young men will see visions, your old men will dream dreams.',
    quote_ref: 'Acts 2:17 (NIV)',
    cta_label: 'Get involved', cta_url: '/get-involved',
    meta: 'Young adults church community (ages 18-35) in Greenwich, London: Sunday worship and a bi-weekly Life Group.',
    body: `We’re a generation that is hungry for a move of God in our city and nation. We’re convinced that revival isn’t just something we read about in history—it’s happening here and now, one youth at a time. So we are choosing to live on fire for God. We gather to worship, we grow in community and friendship, and live out our faith in practical ways as we carry God’s presence into every part of our lives.

If you’re between ages **18 and 35** and looking for a family to plug into, you’ve just found your place.

### Sunday experience

Join us on **Sunday morning (10:00 AM)** at Greenwich Picturehouse for church. We worship powerfully together as a church family and experience the move of God in our community. And, if you stick around just after the service, you’ll meet a lot of our young people, who enjoy serving, leading, and simply doing life together.

### Tuesday

On **Tuesday, 7:30–8:30 PM** (bi-weekly), we gather for our Young Adults Life Group with a mix of activities for young people to enjoy. We worship, dive deeper into God’s Word, play games, have fun, share a meal, and build connections. It’s the perfect space to bring your friends and make new ones! Email us at love@thehigherplaceuk.com if you’d like to connect with our life group.

There are many ways to serve and opportunities to use your gifts and talents in God’s house. The best way to start is to plug in, right away!`
  }),
  P('students', 'Students', 21, {
    tone: 'cobalt', menu: 'life', facts: 'Who | New and returning students\nCourse | Alpha for Students (see What’s On)',
    intro: 'We love students!',
    quote: 'Our heart is to see students thrive—growing in faith, becoming leaders, influencing the world, and shaping culture. If you are a new or returning student, you are so welcome! It is our desire to walk alongside you as you become all that God has called you to be, both on campus and beyond!',
    cta_label: 'Plan your visit', cta_url: '/awareness#plan',
    meta: 'A student community in Greenwich, London: friends, mentors and opportunities to serve and lead.',
    body: `Our student community is a vibrant community of young people growing in faith, friendship, and purpose plus learning to live boldly for Christ on campus and beyond.

We believe university can be more; a place to discover who you are, develop your gifts, and make an impact. Here, you’ll find friends who will encourage you, mentors who will guide you, and opportunities to serve, lead, and influence your world for Jesus.

### Life on campus is better when we do it together!`
  }),
  P('thp-kids', 'THP Kids', 22, {
    tone: 'amber', menu: 'life', facts: 'Ages | 1–4, 5–9 and 10–14\nCheck-in | From 9:45 AM for the 10 AM service\nSafety | All kids team members are fully DBS-checked',
    intro: 'The Future Starts Now',
    cta_label: 'Plan your visit', cta_url: '/awareness#plan',
    meta: 'THP Kids: Sunday children’s ministry for ages 1-14 at The Higher Place church in Greenwich, with a DBS-checked team.',
    body: `### Sunday

Our children’s ministry is a nurturing ground for children to encounter God’s love, grow in faith, and discover the joy of serving Him from an early age.

We have children’s ministry on Sundays across three different age groups. We create experiences tailored to each age group so children can grow in their understanding of God, their gifts, and themselves. You can check your children in from 9:45 AM for our 10 AM service.

**We welcome every child with open arms and we celebrate all abilities, backgrounds, and personalities.**

Our team will be ready to welcome your family and ensure your child feels right at home from the very first moment.

### Age 1-4

Our youngest group enjoys **learning about Jesus in creative and practical ways. Worship, dance, craft. We do it all.** They learn God’s Word through play, songs, stories, and activities that nurture faith and curiosity at their level.

### Age 5-9

At this stage, we encourage our kids to begin to explore the Bible more deeply, build friendships, and learn what it means to follow Jesus in everyday life. We encourage them to ask questions, grow in confidence, and enjoy discovering God’s truth.

### 10-14

Our 10-14s are **leaders today, not just tomorrow!**

So along with developing their personal walk with God and encountering Jesus every week, there are many opportunities for them to serve in the house of God, and develop practical skills such as musical instruments, media projection, photography, and hospitality.

This is a space where the **Holy Spirit is at work**! You’ll see young children praying boldly, sharing words of encouragement and seeing testimonies come to life.

### Our Kids Team

Your child’s safety is our highest priority. All our kids ministry teachers are **fully DBS-checked**, trained, and passionate about nurturing children’s faith in a safe, caring, and loving environment.

They are dedicated, creative, and full of the joy of serving God through children. They are here to guide your child, nurture their gifts, and walk alongside them in their faith journey.

The Higher Place takes safeguarding seriously. If you have a concern about a child or vulnerable adult, please see our [safeguarding page](/safeguarding) for the Designated Safeguarding Lead’s contact details.`
  }),
  P('young-at-heart', 'Young at Heart', 23, {
    tone: 'lilac', menu: 'life', facts: 'Who | Ages 50 and over',
    intro: 'A place to belong, build solid friendships, and continue becoming all that God has called you to be.',
    quote: 'They will still bear fruit in old age, they will stay fresh and green.', quote_ref: 'Psalm 92:14 (NIV)',
    cta_label: 'Join a Life Group', cta_url: '/get-involved',
    meta: 'Young at Heart: a community for people aged 50 and over at The Higher Place church in Greenwich.',
    body: `At The Higher Place, we believe that **every season of life has purpose**.

Young at Heart is a community for those aged **50 and over**, bringing together people who want to keep growing in their relationship with God, build solid friendships, and make a difference in the lives of others. We believe there is always more to discover, experience and give, no matter the season of life, and there’s something special about doing that together.

Through fellowship, laughter, prayer, worship and meaningful conversations, this is a place to **connect, belong and keep growing**.`
  }),
  P('internships', 'Internships', 24, {
    tone: 'coral', menu: 'involved', facts: 'Length | 3 to 6 months\nWho | Anyone aged 16 and above\nPay | Unpaid, expenses may be reimbursed',
    intro: 'Step in, make a difference, and grow into the leader God has called you to be.',
    cta_label: 'Apply today', cta_url: 'https://docs.google.com/forms/d/e/1FAIpQLSeXOGpwIiFmQFw-O46Qk30PhzEsSkJBJ0av5JbpI8uh1Zgx7g/viewform?usp=sharing',
    meta: 'Church internships in Greenwich, London: gain ministry and work experience at The Higher Place for 3 to 6 months.',
    body: `If you're considering a gap year before university, looking to gain valuable work experience, or simply want to explore ministry life while serving the community through the local church, The Higher Place Internship could be the perfect opportunity for you to step in, make a difference, and grow into the leader God has called you to be.

### Make a difference

One thing we always say is, **“Love is not just what we do—it’s who we are.”** This is reflected in how we serve, how we treat people, and how we create a space where everyone feels seen and valued. During your internship, you will meet people—whether it’s welcoming them to our loving church, or offering support through our community outreach. You never know who you’ll meet or how a simple act of kindness can change someone’s life forever.

### Grow your faith

We truly believe that faith isn’t meant to be stagnant—it’s meant to grow, stretch, and deepen. As an intern, you’ll have countless opportunities to build a strong spiritual foundation as we provide an excellent grounding in church life through weekly services; ministry and theology through our weekly Bible Study classes, Alpha Course, Take a Step Course, and missions through outreaches and evangelism.

### How we support you

Our interns are provided with mentorship and coaching, as well as practical ministry experience. During your internship, you’ll gain both soft and hard skills for ministry and workplace leadership. We can provide reference and recommendation letters after your internship if you need it. This is not a paid role but we are happy to reimburse expenses if necessary.`
  }),
  // ---------- Legal pages (DRAFTS: please review and approve) ----------
  P('privacy', 'Privacy policy', 90, { tone: 'navy', menu: '', intro: 'How we look after the information you share with us.', meta: 'Privacy policy for The Higher Place church website.', body: `This is a plain-English summary of how this website handles your information. The Higher Place is a registered charity in England and Wales (charity no. 1173023).

### What we collect

Only what you choose to send us through a form on this site: your name, email address, optional telephone number, and the message or prayer request you write. We ask for as little as possible.

### Who sees it

Submissions are stored securely and are only visible to authorised members of our church team through a password-protected dashboard. Prayer requests are never published on the website.

### Why we use it

To reply to you, pray with you, look out for you when you visit, or follow up about a group or volunteering role you asked about.

### How long we keep it

We keep submissions only as long as we need them to respond and to look after you well, and then delete them.

### Your rights

You can ask to see, correct or delete the information we hold about you by emailing love@thehigherplaceuk.com.

### Other services

Some links take you to other services (such as PayPal, ChurchSuite, Google Forms, Mailchimp, YouTube and Facebook), and the optional language bar uses Google Translate. They have their own privacy policies.` }),
  P('cookies', 'Cookie policy', 91, { tone: 'navy', menu: '', intro: 'This website uses very little browser storage.', meta: 'Cookie policy for The Higher Place church website.', body: `This website does not use advertising or analytics cookies.

- A sign-in cookie is used only when church staff log in to the admin dashboard.
- Your browser’s temporary session storage remembers that you closed the “Plan your visit” prompt, so we don’t show it again during your visit.
- If you choose French, Spanish or Chinese from the language bar, a small cookie (googtrans) remembers your choice and the page is translated by Google Translate, a Google service that loads only when you choose a language. Translations are automatic and may not be perfect.

Embedded YouTube videos and the Facebook feed load only when you press play or show. If we add analytics in future, we will ask for your consent first.` }),
  P('accessibility', 'Accessibility statement', 92, { tone: 'navy', menu: '', intro: 'Everyone should be able to use this website.', meta: 'Accessibility statement for The Higher Place church website.', body: `We aim to make this website work well for everyone, and we build to the WCAG 2.2 AA standard. That includes keyboard navigation, visible focus, readable colour contrast, labelled forms and respect for reduced-motion settings.

If something is hard to use, or you need information in a different format, please email love@thehigherplaceuk.com or call 07424663805 and we will help.` }),
  P('safeguarding', 'Safeguarding', 93, { tone: 'navy', menu: '', intro: 'The Higher Place takes safeguarding seriously.', meta: 'Safeguarding at The Higher Place church: our Designated Safeguarding Lead and how to raise a concern.', body: `Your child’s safety is our highest priority. All our kids ministry teachers are **fully DBS-checked**, trained, and passionate about nurturing children’s faith in a safe, caring, and loving environment.

If you have a concern about a child or vulnerable adult, please contact our Designated Safeguarding Lead using the details below.` }),

  // ---------- What to expect (New here page) ----------
  { type: 'expect', title: 'A Church for Every Nation and Generation', sort: 1, published: 1, data: { text: 'You’ll be welcomed as you are. No dress code required.', image: '' } },
  { type: 'expect', title: 'A Warm and Welcoming Service', sort: 2, published: 1, data: { text: 'With worship, encouragement, and a message of hope and transformation.', image: '' } },
  { type: 'expect', title: 'Kids & Family-Friendly Environment', sort: 3, published: 1, data: { text: 'Your children will learn about Jesus in a safe, fun, and engaging way.', image: '' } },

  // ---------- Regular gatherings ----------
  { type: 'gathering', title: 'Sunday service', sort: 1, published: 1, data: { day: 'Sundays', time: '10:15 AM', place: 'Greenwich Picturehouse, 180 Greenwich High Road, London SE10 8NN', note: 'Kids check-in from 9:45 AM. Also streamed live on YouTube.' } },
  { type: 'gathering', title: 'Prayer meeting', sort: 2, published: 1, data: { day: 'Fridays (bi-weekly)', time: '7:15 – 8:15 PM', place: 'Greenwich Students’ Union (GSU), Room 025', note: 'Check the calendar for the next date.' } },
  { type: 'gathering', title: 'Life Groups', sort: 3, published: 1, data: { day: 'During the week', time: '', place: 'Greenwich/Charlton, Dartford/Gravesend, East London and online', note: 'Specialised groups include Young Adults, Young at Heart, Empowered Parents and Students. Email love@thehigherplaceuk.com to join.' } },

  // ---------- Events (DRAFTS from the 2026 'forward look': confirm details, then publish) ----------
  { type: 'event', slug: 'christmas-service-2026', title: 'Christmas Service', sort: 1, published: 0, data: { start: '2026-12-13T10:15', end: '', location: '', category: 'Service', description: 'Listed in Pastor Paul’s 2026 forward look. Confirm time and venue before publishing.', image: '', link_url: '', link_label: '' } },
  { type: 'event', slug: 'new-years-eve-service-2026', title: 'New Year’s Eve Service', sort: 2, published: 0, data: { start: '2026-12-31T23:00', end: '', location: '', category: 'Service', description: 'Listed in Pastor Paul’s 2026 forward look. Confirm time and venue before publishing.', image: '', link_url: '', link_label: '' } },

  // ---------- Beliefs ----------
  ...[
    ['The Church', 'The church is a local community of baptised believers. It works in unity and love and shines God’s light, glory and love in their communities.', 'Matthew 16:18-19; 18:15-20; Acts 2:41-47; 5:11-14; 13:1-3; 14:23; 16:5; 20:28; 1 Corinthians 7:17; Ephesians 1:22-23; 2:19-22'],
    ['Salvation', 'Only the blood of Jesus shed on the cross provides salvation for man through the forgiveness of sin. Salvation is a gift from God and cannot be earned by works.', 'Isaiah 1:18; 53:5-6; 55:7; Matthew 1:21; 27:22-66, 28:1-6; John 1:12; 3:16, 36; 5:24; Acts 2:21; 4:12; 16:30-31; Romans 1:16-18; 1 Corinthians 1:18; 2 Corinthians 5:17-20'],
    ['The Bible', 'The Bible is God’s Word to everyone. It is not theoretical, it is practical and profitable for wisdom and revelation. It was written by men under the guidance of the Holy Spirit. It is the truth and there is no error in it. It is the final authority for God’s people.', 'Deuteronomy 4:1-2; Psalms 119:11, 89, 105; Isaiah 40:8; Matthew 22:29; John 5:39; 16:13-15; 17:17; Romans 15:4; 2 Timothy 3:15-17; Hebrews 1:1-2; 4:12; 1 Peter 1:25; 2 Peter 3:16'],
    ['Trinity', 'God exists as three persons in one: the FATHER, SON and the HOLY SPIRIT. Each member of the Trinity serves different functions, however each possess equal power and authority.', 'Deuteronomy 6:4; Isaiah 61:1; Matthew 28:19; Mark 1:9-11; Luke 1:35; John 5:21-23; 14:10, 16; Romans 8:9-11; 1 Corinthians 8:6; 2 Corinthians 13:14; Hebrews 1:8-10; James 2:19'],
    ['The Father', 'He is all powerful, ever present, all knowing, constant, completely worthy of our trust, and Holy.', 'John 3:16; 4:24; 5:26; 14:1; Acts 17:28; Romans 3:3-4'],
    ['The Son', 'Jesus Christ is the only plan for restoring man into a right relationship with God.', '1 Corinthians 8:6; 2 Corinthians 5:19-21; Gal 4:4-5; Philippians 2:5-11; Colossians 1:15; 2:9; 1 Timothy 2:5-6; 3:16'],
    ['The Holy Spirit', 'He guides believers into all truth and uplifts Christ. He convicts people of their sin, the truth, and the coming judgment.', 'Romans 8:9-11, 14-16, 26-27; 1 Corinthians 3:16; Ephesians 1:13-14; 2 Peter 1:21; Revelation 22:17'],
    ['Eternity', 'Man was made to last forever. However, this could be in heaven or in hell. Heaven is a place of eternal union with God and Hell is a place of eternal separation from God. Both places are real.', 'John 3:16, 36; Romans 6:23; 1 John 2:25; 5:11-13'],
    ['Non Essentials', 'We affirm that the doctrines of the Trinity, the deity of Christ, the bodily resurrection, the atoning work of Christ on the cross, and salvation by grace through faith make up the essential, distinctive nature of Christianity. In regards to these essential doctrines, there can be no conflicting opinions of those who call themselves true followers of Christ.\n\nHowever, we do acknowledge that there are peripheral or non-essential doctrines that are important, but not critical to the follower of Christ as it relates to our salvation. Some of these topics include the exact timing and nature of the rapture, the extent and use of certain spiritual gifts, and the relationship between election and free-will in salvation.\n\nWhile our church will be diligent to establish positions as it relates to these non-essentials, we will not allow these peripheral doctrines to cause division within the church. We will accept into our body those who have differing views on the non-essential doctrines, but will not allow those of a different opinion to fracture the church. While we celebrate diversity along all lines (racial and theological), we will ultimately pursue the unity of the church.', ''],
  ].map(([title, text, refs], i) => ({ type: 'belief', title, sort: i + 1, published: 1, data: { text, refs } })),

  // ---------- Values ----------
  ...[
    ['Think Bigger', 'Because souls matter, we’ll not insult God with small thinking and safe living.'],
    ['Connect Better', 'Love is not what we do but who we are.'],
    ['Embrace Difference', 'God created diversity, we love it and it serves His purpose.'],
    ['Lead with Excellence', 'Excellence honour God and inspire people.'],
    ['Practice Irrational Generosity', 'We truly believe it is more blessed to give than to receive.'],
    ['Have Fun', 'We will laugh, dance, and enjoy it all because we truly believe God’s house is not meant to be boring.'],
    ['Prioritise God’s House', 'We give up things we love to love God first.'],
  ].map(([title, text], i) => ({ type: 'value', title, sort: i + 1, published: 1, data: { text } })),

  // ---------- Team ----------
  { type: 'team', title: 'Paul and Debi Ilo', sort: 1, published: 1, data: { role: 'Founding and Lead Pastors', group: 'Pastors', image: '', bio: 'Paul and Debi Ilo are the founding and Lead Pastors of **The Higher Place**, a London-based church with a mission to see ordinary people from every nation and generation transformed into passionate leaders for Jesus.\n\nPaul holds a Master of Arts in International Relations and is the author of several books. Debi holds a Degree in Sociology and Communications.\n\nBeyond his ministry, Paul’s greatest passion—apart from supporting Arsenal Football Club—is his family. He is happily married to Debi, and together they are blessed with one son and two daughters.\n\nPaul also enjoys traveling, keeping fit, and has a habit of ending far too many sentences with the word, “Brilliant!”' } },

  // ---------- Testimonial (from the Internships page) ----------
  { type: 'testimonial', title: 'Isabella', sort: 1, published: 1, data: { role: 'Chief of Staff', category: 'internships', quote: 'There’s always something exciting happening at The Higher Place Church! Our mission is simple but powerful: “to see ordinary people from every nation and generation transformed into passionate leaders for Jesus.” We believe that leadership isn’t just about titles—it’s about serving, growing, and making a lasting impact. I have served here for 5 years as an Admin Officer and now, Chief of Staff. It’s been a remarkable and truly rewarding journey!' } },

  // ---------- Sermons (YouTube links found in Pastor Paul's blog) ----------
  { type: 'sermon', title: '10th anniversary message', sort: 1, published: 1, data: { date: '', youtube: 'https://youtu.be/qKHy1t-Qgwg', speaker: '', series: '', description: 'Our anniversary message, looking back on ten years of The Higher Place.' } },
  { type: 'sermon', title: 'Nations and generations', sort: 2, published: 1, data: { date: '', youtube: 'https://youtu.be/5eo2Aumq5TA', speaker: '', series: '', description: '' } },
  { type: 'sermon', title: 'Rumblings of Revival', sort: 3, published: 1, data: { date: '', youtube: 'https://youtu.be/ljffdOgj8rc', speaker: '', series: '', description: '' } },
  { type: 'sermon', title: 'Multiplication series: launch', sort: 4, published: 1, data: { date: '', youtube: 'https://youtu.be/WGeKxR4Sy3k', speaker: '', series: 'Multiplication', description: '' } },

  // ---------- FAQs ----------
  ...[
    ['What Should I Expect on a Sunday at The Higher Place?', `Our Sunday services and prayer meetings are the heartbeat of all that God does in us throughout the week. We gather on Sundays to deepen friendships and meet with God, and on Fridays to pray together as a Church. We welcome people from all walks of life - you’ll find people of every age (we are multi-generational) and race (we are multi-ethnic) in our meetings – most of them passionate about following Jesus, but many simply wanting to hear a little more. Come just as you are – there’s no dress code. We guarantee you a warm welcome, great refreshments, practical and passionate teaching from the Bible and an opportunity to meet with God for yourself.

We want to make sure that **kids and young people** are well served on Sundays, so we have a brilliant team who lead their dedicated activities in a beautiful environment.

Our Sunday experience starts from 10:00am at Greenwich Picturehouse, 180 Greenwich High Rd, London SE10 8NN and is typically between 75-90 minutes. If you want any help in planning your visit, please just [get in touch](/awareness#plan), we’d be pleased to help you out!`],
    ['Do You Meet on Other Days During the Week?', `Yes, we hold bi-weekly Prayer Meetings on Fridays at the Greenwich Students' Union building, Room 025.

In addition, we have several Life Groups meeting during the week across London and its environs. These include location-based Life Groups in Dartford/Gravesend, East London, and Greenwich/Charlton. We also have specialised Life Groups such as the Young Adults, Young at Heart, Empowered Parents, Students, and Online Life Groups.

To join any of these Life Groups, [use our Life Group form](/get-involved) or email our admin at love@thehigherplaceuk.com`],
    ['Is there parking?', 'If you are driving, we have some allocated parking spaces nearby, please email us at love@thehigherplaceuk.com to reserve a space for your next visit.'],
    ['What Other Programmes do you do as a Church?', 'We run the Alpha Course for those new to faith and seeking answers to their most pressing questions about Christianity. The Marriage and Pre-Marriage Course is designed for couples and those preparing for marriage; we typically run these twice a year based on interest. We also run various initiatives serving young people, men, and women. Additionally, we host Bible Studies, Prayer Meetings, and outreach programs. For more details, visit us on Sundays or check out our [calendar](/calendar).'],
    ['How do I find the Latest Message Video?', 'The latest message is available on our [YouTube Channel](https://www.youtube.com/channel/UCQqjPVZjI85I6q8fEM-afMA) and in our [sermon library](/sermonslibrary). In addition, you can subscribe to any of the media feeds we provide.'],
    ['Do you have Live Streaming of Services Available?', 'We currently stream our services live on our [YouTube Channel at 10:00AM](https://www.youtube.com/channel/UCQqjPVZjI85I6q8fEM-afMA). The livestream remains available for a while to accommodate those who may miss the service, but it is removed after 4:00 PM on Sunday.'],
    ['Do you have outreaches for the community?', "Yes, we serve families in the Greenwich area through our 'Family Fun Day' during Easter and we also partner with various community organisations such as Age UK, Oasis Counselling Services and Wellbeing Counselling Services. We reach out to the elderly and others all through the year. We have a dedicated team for our Social Welfare and Community Engagement projects."],
    ['How do I give donations online?', 'You can [give online here](/giving).'],
    ['Can I Volunteer?', `Yes, you can! In fact, we warmly welcome volunteers to serve with us all year round. At The Higher Place, our mission is to see ordinary people transformed into passionate leaders for Jesus. Volunteering is a key step in that journey. We have a variety of teams where you can serve, including Multimedia, Host/Welcome, Welfare, Kids Ministry, Worship, Evangelism & Follow-Up, Prayer, and Counselling. If you’re interested in joining any of these teams, please [fill in our volunteer form](/get-involved) or email our admin at love@thehigherplaceuk.com. We’d love to hear from you!

If you have additional questions not answered above, please email us at love@thehigherplaceuk.com.`],
  ].map(([title, answer], i) => ({ type: 'faq', title, sort: i + 1, published: 1, data: { answer, category: 'general' } })),
  ...[
    ['What roles are available?', `- **Admin Assistant** (Onsite or remote): As an Admin Assistant, you’ll help manage church records, schedule meetings, handle emails and correspondence, and support church planning systems. This role will give you valuable experience in administration while contributing to the smooth running of the church.
- **Operations Assistant** (Onsite only): In this role, you’ll assist with setting up church events, ensuring Sunday services and other weekly meetings flow seamlessly. You’ll help with resource management, logistics, and general church maintenance, working closely with different teams to support the church’s operations.
- **Kids Work Support Assistant** (Onsite only): Do you have a heart for children and love to make learning fun? As a *Kids Support Assistant*, you’ll help organise and run kids’ church activities, engage children in creative teaching, and provide support to families. You’ll play a key role in creating a safe and exciting environment where kids can grow in their faith.
- **Media & Communications Assistant** (Onsite only): If you’re creative, tech-savvy, and passionate about storytelling, this role is for you! You’ll help create engaging content for social media, design eye-catching visuals, and assist with video production. You’ll also support email communications and newsletters, ensuring that church updates and testimonies are shared in a meaningful way.
- **Ministry Assistant** (Onsite only): As a Ministry Assistant, you’ll get hands-on experience in outreach, follow-up, and supporting people on their faith journey. You’ll serve alongside our pastoral team, help lead small groups or prayer times, and play a vital role in helping people feel connected and spiritually supported in the church. If you are passionate about evangelism, discipleship, or front-line ministry, then this role is for you!`],
    ['What will I be doing as an intern?', 'As an intern, you will have the opportunity to serve in various roles within the church. Whether it’s helping with our Sunday services, supporting community outreach, assisting in media and communication, content creation, planning events, or getting involved in worship, kids work, and operations, you will gain valuable hands-on experience for ministry and the workplace.'],
    ['What will I learn?', 'There is a lot of growth opportunity in serving here at The Higher Place—and a lot to learn! But first, you will grow in your faith, develop practical ministry skills, and gain leadership experience. You’ll also learn valuable life skills such as team work, problem-solving, communication, and time management. There is more than enough room to learn and people to teach!'],
    ['Who can apply?', 'We welcome applications from anyone aged 16 and above who is passionate about growing in their faith, serving others, and gaining ministry or workplace experience. No previous experience is required—just passion and a desire to grow in faith!'],
    ['How do I apply?', 'Applying is simple! Use the “Apply today” button on this page to fill out our online application form and we will be in touch to arrange a meeting.'],
    ['Can I visit the church or talk to someone before applying?', 'Absolutely! We would love for you to visit our services, meet a team, and get a feel of who we are before you apply. If you’d like to chat with someone, feel free to reach out to us at love@thehigherplaceuk.com.'],
    ['How long is the internship?', 'A minimum of three (3) months and a maximum of six (6) month.'],
    ['Do I receive a salary for this position?', 'No, this is not a paid position but expenses might be reimbursed if required.'],
    ['Do you provide accommodation?', 'No, we don’t provide accommodation.'],
    ['Do you offer visa sponsorship?', 'No, we do not offer visa sponsorship for internship positions. We encourage anyone applying, especially for onsite roles, to have a valid UK work permit.'],
  ].map(([title, answer], i) => ({ type: 'faq', title, sort: 100 + i, published: 1, data: { answer, category: 'internships' } })),
];


// ===== seed_posts.js =====
// Pastor Paul's blog posts copied from the existing site. Edit or add posts in the admin dashboard.
const mkPost = (slug, title, date, legacy, excerpt, body) => ({ type: 'post', slug, title, sort: 0, published: 1, data: { date, legacy, excerpt, image: '', body } });

const POSTS = [
  mkPost('ten-years-of-the-higher-place', 'Ten years of The Higher Place', '2026-07-30',
    '/pastor-pauls-blog/2026/7/30/sfgoctcg78r34gbeexbj72preu2ke2',
    'Celebrating ten years of The Higher Place, a vision for a permanent base, and what is coming this summer.',
`Hello Church family,

It's been a little while since I last wrote to you!

Over the past few weeks, one of the greatest highlights for Debi and me has been **celebrating ten years of The Higher Place.** We've spent time reflecting on all God has done over the last decade, the journey we've shared as a church, and how we've celebrated this milestone together. Our hearts are incredibly full. July is always a special month for us because, alongside our church anniversary, we also celebrate our wedding anniversary. This year, Debi and I celebrated 12 years of marriage, making it an especially memorable month. We truly feel grateful for God's faithfulness.

Thank you to everyone who prayed, served, gave, planned, celebrated and honoured us throughout our anniversary celebrations. We were deeply encouraged by your kindness, generosity and love. It meant more to us than you know, and we're so grateful to be part of such an incredible church family.

One of my greatest joys over these ten years has been watching people discover God's purpose for their lives and then begin helping others do the same. Many of the leaders serving today first walked through our doors simply looking for a church to call home. Seeing them now faithfully leading teams, serving others and helping others grow in their relationship with Jesus brings me tremendous joy. That's one of the greatest privileges of pastoral ministry.

In many ways, ten years feels like a significant milestone. Yet at the same time, it feels like we're still in the early chapters of the story God is writing through The Higher Place Church. I’m filled with overwhelming gratitude when I look back, but looking ahead fills me with even greater faith and expectation. I believe the years ahead will bring more people to encounter Jesus, more leaders being equipped and released, more families strengthened, our communities impacted and many more lives transformed by the power of the Gospel. As a church, we're continuing to grow, mature and prepare ourselves for everything God has ahead. If you'd like to hear more about the journey so far, you can watch our anniversary message [here](https://youtu.be/qKHy1t-Qgwg).

One area I've been speaking about recently is our vision to purchase a permanent base for The Higher Place. As we continue to grow, we believe having a home of our own will create even more opportunities for discipleship, prayer, leadership development and serving our local community throughout the week. I'd encourage you to keep praying with us for this vision and, if you're able, continue giving towards it.

Alongside this vision, I've also recently released my new book, [Faith Mindsets](https://amzn.eu/d/0h6i4DNF). Writing this book has been a real joy, and my prayer is that it helps people develop a deeper confidence in God and a faith that remains steadfast in every season of life. If you haven't already picked up a copy, I'd love to encourage you to do so, and perhaps even gift a copy to a friend. Every penny from the book is being given towards the purchase of our future church base, so thank you to everyone who has already supported it.

### The Summer

Summer can sometimes be a season where it's easy to drift, especially with holidays and changing routines. My encouragement would simply be this: stay connected, keep gathering, keep praying, keep serving, keep giving, keep inviting people. God doesn't stop working during the summer, and neither should our expectation for what He wants to do.

I'm really looking forward to the start of our new teaching series, ***Wisdom from Heroes and Sheroes*** on the 9th of August, as together we learn timeless lessons from some of the remarkable men and women of Scripture. I also hope you'll join us for our **Presence Prayer gathering** this Friday, from 7:15 - 8:15 PM at GSU Room 025. In August, we'll have one prayer gathering—our **Summer Prayer Gathering** on 14 August—alongside **After Service Hangouts, Sports Day, Women's Weekend Away** and many other opportunities to build friendship and community.

You can find all our upcoming events and key dates on the [church calendar](/calendar), and I hope you'll make the most of everything happening over the summer.

As always, thank you. Thank you to our leaders. Thank you to every volunteer. Thank you for continuing to believe, pray, serve and give. Every one of you is part of the story God is writing at The Higher Place Church, and I'm excited to see all that He has in store for us in this next season.

As I always say, the best is yet to come!

Much love,

Paul`),

  mkPost('mission-month-super-sundays-and-the-road-to-ten', 'Mission Month, Super Sundays and the road to ten', '2026-04-23',
    '/pastor-pauls-blog/2026/4/23/sl2q4hjevn05yhfjnqom2o5ofhuvml',
    'Three months into full-time ministry: Mission Month, Super Sundays, and a forward look at the year.',
`Three months into full-time ministry, life has continued to be both busy—busier, in fact—and fruitful. I’ve found a renewed sense of focus and have become more single-minded in purpose. I’m now leading with fresh energy, stronger faith, and clearer direction for the team.

In the midst of all this, I had the privilege of attending and sharing the story of The Higher Place at an event for pastors and leaders in Germany. It was especially meaningful that four of our team members could join us. We were deeply encouraged by the prayers spoken over us and the sense of support from ministries from far and wide.

Since I last wrote, so much has happened in church life. Mission Month brought inspiring guest speakers who helped deepen our passion for mission. Our three Super Sundays, beginning on Easter Sunday, brought fresh faith and flexibility into the life of our church. We’ve heard many praise reports—the unchurched trying church for the first time, the dechurched returning after time away, and others giving their lives to Jesus. It’s been especially encouraging to see many of them now taking next steps in the church.

The “*Anxious for Nothing*” series has also been a real blessing. Many have shared how it deeply spoke into their current situations, and it’s been encouraging to hear ongoing conversations around what God is doing through it.

It’s been wonderful to welcome new members, see more people serving, and experience a growing sense of unity, faith, and togetherness.

I’ve also started a monthly write-up for our men titled *“Discipling Men: Growing Faith, Building Brotherhood.”* I’m looking forward to continuing that journey with them.

As we look ahead to May, I’m looking forward to training the next cohort of leaders through our Basic Leadership Training. We’ll also be hosting Men’s and Women’s evenings during our usual prayer times—similar in spirit to last year’s “Pray and Dine” meetings.

As I shared in my sermon titled *“God at Work”* during Mission Month, there is a growing desire to intentionally support and encourage the professionals and business people within our church community. I’m therefore really looking forward to our Professionals and Business Forum on 13th May, which will be a great opportunity to connect and be equipped.

I’ll also be setting aside time to prepare for our **upcoming 10th anniversary** series. I hope you’ve already saved the date for the anniversary. In the lead-up, we’ll be sharing **“10 Stories of Changed Lives from 10 Years”** starting mid-May, alongside other events including the **Greenwich Fun Day on 11th July, all building toward our grand celebration on 19th July.**

As always, I want to express my heartfelt gratitude to each of you—our leadership team, all the leaders and everyone who gives, serves, and believes in this vision. Thank you for being part of this journey—what God is building among us is truly special, and I’m expectant for all that’s ahead.

I hope to see some of you at the Life Group Weekend this weekend. Please remember that **due to London Marathon road closures, we’ll have an online-only service this Sunday 26th April at 10:15am.**

The Best is yet to come!

Much love,

Paul

### Forward look (as published in April 2026)

- Life Group Weekend – **25–26 April**
- Online Service Only – **26 April**
- Youth & Young Adults Service – **3 May**
- Alpha Course for Students Starts – **3 May**
- Women’s Evening – **8 May**
- Young at Heart Afternoon Tea with Pastors Paul & Debi – **10 May**
- Professionals & Business Forum – **13 May**
- Basic Leadership Training – **17, 20, 24 & 27 May**
- Men’s Evening – **22 May**
- Pentecost Sunday – **24 May**
- Young Adults Hangout with Pastors Paul & Debi – **31 May**
- Father’s Day – **21 June**
- Leaders Assembly – **27 June**
- Greenwich Fun Day – **11 July**
- 10th Anniversary Celebration – **19 July**
- Sports Day (After Service) – **16 August**
- Women’s Weekend Away (TBC) – **21–23 August**
- Mobilisation Sunday & Back to School Sunday – **30 August**
- Multigenerational Month – **September**
- Multicultural & Multigenerational Sunday – **27 September**
- Freedom Weekend – **2–4 October**
- Christmas Service – **13 December**
- New Year’s Eve Service – **31 December**`),

  mkPost('looking-back-on-january-2026', 'Looking back on January, and a forward look to February', '2026-01-29',
    '/pastor-pauls-blog/2026/1/29/4pbsadpe8xnc35r0thsq7fewiseu9k',
    'Reflections on the Crossover Service, the 21-day fast, Vision Sunday and Holy Habits, with a look ahead to February.',
`Hi Church,

It has been a while since I last wrote to you, so I wanted to share some reflections as we come to the end of January 2026.

### Looking back on January

I’ve found myself reflecting with gratitude on all that God has done in and across every **generation** and **nation** in our church family this month.

We began the year together with our **Crossover Service** at Greenwich Theatre, and it was such a powerful way to step into the new year. There was a real sense of God's presence in the room—a reminder that God was inviting us to please and partner with Him wholeheartedly this year.

One of the most encouraging parts of January for me was our **21-day fast.** It was really great to see people showing up daily—both online and in person—to pray and seek God together. I was especially blessed to see new leaders step up to lead prayers during the fast. Watching God stir courage, faith, and responsibility in people’s hearts, for me, was a beautiful picture of the body of Christ in action.

We also gathered for our **Team Assembly** this month, and I’m so thankful for that time together. We were able to set direction for the year as a team and agree what we need for the stage of our church. I’m always grateful for the commitment, humility, and heart with which our teams serve.

**Vision Sunday** was another key highlight in January. It was a great opportunity to share where God is leading us as a church this year. The key takeaway from Vision Sunday was this: God is not calling us to observe, He is calling us to participate.

Alongside this, our **Holy Habits** series all through January reminded us that lasting spiritual growth is often formed through faithful and daily obedience. It was a real privilege to welcome our dear friends, Pastor Mo and Nikki from Nashville, USA, who joined us to conclude the series this past Sunday. Their ministry was a blessing, and we’re thankful for the gift they brought to our church.

As I look back on this month, my heart is full of gratitude. None of this happens without faithful people—those who pray, serve, give, plan, and show up consistently. Thank you to every leader, volunteer, team member, and partner. Your support, commitment, and willingness to say yes make moments like these possible.

I truly believe that January has laid a strong foundation for what lies ahead.

### Forward look to February

I’m now looking forward to February, with our brand new series ***Relationship Rehab*** starting this Sunday, 1st February at Greenwich Picturehouse.

This is not your typical relationship series, this is what it says on the tin, it’s a relationship rehab. The word rehab means rehabilitate or restore.

It is a series that will help us with our relationship foundations so we can function in our relationships in the way God intends for us to function. This is a series for everybody—every generation and nation, so again another powerful opportunity to be on mission!

**Life Groups** will start on Sunday, 8th February, and I’ll be spending a lot of time in February with our Life Group leaders, as we want to make sure our people—and everyone God sends us—are well looked after.

Our bi-weekly **prayer meetings** start again on Friday 13th February and we also have **Freedom Weekend** starting Friday, 27th February to Sunday, 1st March. These are key dates in February, so please mark them in your calendar!

Finally, I’m grateful for the privilege of serving and partnering with you to advance the gospel to people from every nation and generation. My prayer is that we would continue to respond with faith and obedience—both individually and corporately.

The best is yet to come!

Mega blessings,

Paul Ilo.`),

  mkPost('what-a-start-to-the-new-term', 'What a start to the new term!', '2025-10-11',
    '/pastor-pauls-blog/2025/6/23/fyqj6lzr1ofyz3l7lgt9q5lvgaih12-raw3x',
    'Multigenerational Month, our move to a new venue, and the series ahead.',
`It’s been a while since I last wrote to you, so I’m excited to share my second blog update with you today!

It’s been a great start to this new term! We began with three powerful days of fasting and prayer, setting the stage for all that God has for us. September was our **Multigenerational Month**—what a joy to see every age group represented in all our services, culminating in a beautiful **Multicultural and Multigenerational Sunday**! So many of you have asked if we’ll do it again… and the answer is yes, we will!

We also moved into our new venue—**what a milestone that was!** Pastor Tope’s message truly prepared our hearts for this next phase of ministry. A lot has happened already, with Spirit-empowered strength carrying us and the team through it all. God’s hand is on our church, and it is evident that the Lord is in this place! There is a genuine move of God in our midst. This is the Lord’s doing, and it is marvellous in our eyes.

As all [nations and generations](https://youtu.be/5eo2Aumq5TA) continue to gather, let’s not get carried away or complacent. Let’s protect our unity, and let’s make sure we are growing, giving, and going into all the world. Let’s not forget to disciple them as they come.

If you haven’t already, this is a great time to plug into Life Groups, take the **Take a Step Course**, start serving, join the **Fresh Start** study, and continue attending our **Prayer Meetings**. These are all nets that God has prepared for the harvest!

God has increasingly taught me about the beauty of the body of Christ in this season—that each one plays a part, and when united in mission, heart, and mind, all things are possible. Our unity, like we see in the Book of Acts, serves as a testament of God's presence among us—and when there is unity, the Lord commands His blessing!

I’m now looking forward to our new two-part series, **“What Time Is It?”**, starting this Sunday. It will speak to how God expects us to respond in these times and in the day and age we live in—you don’t want to miss it! Starting this month of October, we’ll be having **Prayer Zoom** for men and women/ladies. We will share all the details very soon, but I strongly believe these times will strengthen our community even further as we seek God together. And as we journey through the rest of this term, we’ll build towards our **Crossover Service**, closing the year with gratitude and expectation for all that’s ahead.

May God continue to bless this church and strengthen us all. I pray God’s blessings over all our Life Group Leaders, team leaders, staff, and pastors—you are truly incredible! I love pastoring this church, and I love you all.

On a family front, Debi and I are doing very well, even in this full and stretching season of ministry. We’re so grateful for the accountability structures and support networks in our lives, and for how you all continue to encourage us. We remain thankful for God’s grace over our home.

**See you this Sunday—and don’t forget to bring a friend to our new home!**

**Mega blessings,**

*Paul Ilo*`),

  mkPost('leading-with-faith-june-2025', 'Leading with faith: a heartfelt update from your servant leader', '2025-06-26',
    '/pastor-pauls-blog/2025/6/23/fyqj6lzr1ofyz3l7lgt9q5lvgaih12',
    'Two services, a record Easter, the Multiplication series and our 9th anniversary.',
`It has been a very encouraging year at The Higher Place. The launch of the two services has enabled us to make more room to be on mission and see more leaders rise (we must never forget **why** we are doing this).

Easter weekend was remarkable, with more people attending our church than ever before, and I am excited to hear that this is a story being replicated across many United Kingdom (UK) churches. We are seeing [Rumblings of Revival](https://youtu.be/ljffdOgj8rc) and God is clearly on the move.

Last Sunday, I enjoyed kicking off our [Multiplication Series](https://youtu.be/WGeKxR4Sy3k) which is a word that God has spoken over us this year and beyond. It was wonderful to have you join us for the two services. We had fasted and prayed all through the month of June and studied the book of Acts over and over again in preparation and put a lot of thought into the content, so it was very encouraging to read the feedback and hear how God has used it so far.

I'm now looking forward to next month which is a significant month for us as we celebrate our 9th Anniversary on 13th July. We will be celebrating it with what we are calling "One Church Sunday" - where we will all come together in one service to celebrate all that God has done with anticipation for what is to come - we know there is so much more! There will also be baptisms on the day and lots of food! We will make preparations to welcome everyone.

Church - let's continue to steward these days and play our part to see ordinary people transformed into passionate leaders for Jesus. God is on the move in the UK. Let us continue to step into it together, serving Jesus, making a difference and making our church a home for Jesus and our community!

Finally, I would greatly value your prayers over the next few weeks. Debi and I will be celebrating our 11th year wedding anniversary next month and also looking to take some time to recharge. It means we will have the privilege of seeing many of our leaders rise up to continue to lead. We have a new series titled *Stories* in August replacing the *At the Movies* this year and we will continue to make space to reach more people as we stay on mission.

The best is yet to come!

Paul.`),
];


// ===== db.js =====

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, slug TEXT, title TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', published INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS idx_items_type ON items(type, published, sort)`,
  `CREATE INDEX IF NOT EXISTS idx_items_slug ON items(type, slug)`,
  `CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT, email TEXT, data TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, name TEXT, mime TEXT NOT NULL, b64 TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS throttle (k TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_throttle ON throttle(k, ts)`,
];

const INSERT = `INSERT INTO items (type, slug, title, data, published, sort) VALUES (?, ?, ?, ?, ?, ?)`;
let ready;

// Creates the tables and loads the starting content the first time the site runs. No manual SQL needed.
function init(db) {
  ready ??= (async () => {
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    const row = await db.prepare('SELECT COUNT(*) AS c FROM settings').first();
    if (!row || !row.c) {
      // Settings are written LAST, so if anything is interrupted the next visit simply starts the seed again.
      await db.prepare('DELETE FROM items').run();
      const stmts = [...ITEMS, ...POSTS].map((it) => db.prepare(INSERT).bind(it.type, it.slug || null, it.title, JSON.stringify(it.data || {}), it.published ?? 1, it.sort || 0));
      for (const [k, v] of Object.entries(SETTINGS)) stmts.push(db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(k, v));
      for (let i = 0; i < stmts.length; i += 25) await db.batch(stmts.slice(i, i + 25));
    }
    // One-time update for sites created by an earlier version
    const m2 = await db.prepare("SELECT value FROM settings WHERE key = '_m2'").first();
    if (!m2) {
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('youtube_channel_id', ?)").bind(SETTINGS.youtube_channel_id),
        db.prepare("UPDATE items SET data = json_set(data, '$.body', ?) WHERE type = 'page' AND slug = 'cookies'").bind(ITEMS.find((i) => i.slug === 'cookies').data.body),
        db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('_m2', '1')"),
      ]);
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

const shape = (r) => {
  let d = {}; try { d = JSON.parse(r.data || '{}'); } catch { /* ignore bad JSON */ }
  return { ...d, id: r.id, type: r.type, slug: r.slug, title: r.title, published: r.published, sort: r.sort, updated_at: r.updated_at };
};

const ORDERS = {
  sort: 'sort ASC, id ASC',
  start: "json_extract(data,'$.start') ASC, id ASC",
  date_desc: "COALESCE(json_extract(data,'$.date'),'') DESC, id DESC",
  newest: 'id DESC',
};
async function listItems(db, type, { all = false, order = 'sort', limit = 500 } = {}) {
  const sql = `SELECT * FROM items WHERE type = ?${all ? '' : ' AND published = 1'} ORDER BY ${ORDERS[order] || ORDERS.sort} LIMIT ${+limit | 0}`;
  const { results } = await db.prepare(sql).bind(type).all();
  return results.map(shape);
}
async function getItem(db, type, slug, all = false) {
  const r = await db.prepare(`SELECT * FROM items WHERE type = ? AND slug = ?${all ? '' : ' AND published = 1'} LIMIT 1`).bind(type, slug).first();
  return r ? shape(r) : null;
}
async function getItemById(db, id) {
  const r = await db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
  return r ? shape(r) : null;
}
async function findByLegacy(db, type, path) {
  const r = await db.prepare(`SELECT * FROM items WHERE type = ? AND published = 1 AND json_extract(data,'$.legacy') = ? LIMIT 1`).bind(type, path).first();
  return r ? shape(r) : null;
}

async function throttleCount(db, key, windowSec) {
  const r = await db.prepare('SELECT COUNT(*) AS c FROM throttle WHERE k = ? AND ts > ?').bind(key, Date.now() - windowSec * 1000).first();
  return r ? r.c : 0;
}
async function throttleHit(db, key) {
  await db.prepare('INSERT INTO throttle (k, ts) VALUES (?, ?)').bind(key, Date.now()).run();
  if (Math.random() < 0.05) await db.prepare('DELETE FROM throttle WHERE ts < ?').bind(Date.now() - 86400000).run();
}

// Light list of pages (no bodies) used for the menu and homepage tiles
async function pageIndex(db) {
  const { results } = await db.prepare(`SELECT slug, title, sort, json_extract(data,'$.menu') AS menu, json_extract(data,'$.tone') AS tone, json_extract(data,'$.intro') AS intro FROM items WHERE type='page' AND published=1 ORDER BY sort, id`).all();
  return results;
}
async function allSlugs(db) {
  const { results } = await db.prepare(`SELECT type, slug, updated_at, json_extract(data,'$.start') AS start FROM items WHERE published=1 AND slug IS NOT NULL AND type IN ('page','event','post')`).all();
  return results;
}


// ===== layout.js =====

const logoSvg = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="18" r="12" fill="#2850F5"/><circle cx="31" cy="18" r="12" fill="#FF5C3E" fill-opacity=".92"/><circle cx="24" cy="31" r="12" fill="#FFB629" fill-opacity=".92"/></svg>`;

const isExt = (u) => /^https?:\/\//i.test(u || '');
const link = (href, text, cls = 'btn', extra = '') =>
  `<a class="${cls}" href="${esc(href)}"${isExt(href) ? ' target="_blank" rel="noopener"' : ''}${extra}>${text}</a>`;

// A designed, replaceable placeholder used wherever a photo has not been uploaded yet.
const ph = (cls = '', tone = 'cobalt') =>
  `<div class="ph ph-${tone} ${cls}" aria-hidden="true"><i></i><i></i><i></i></div>`;
const pic = (src, alt, cls = '', tone = 'cobalt', dims = '') =>
  src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${dims}>` : ph(cls, tone);

function navModel(s, pages) {
  const by = (m) => pages.filter((p) => p.menu === m).map((p) => [p.title, '/' + p.slug]);
  return [
    { t: 'Home', h: '/' },
    { t: 'New here?', h: '/awareness' },
    { t: 'About us', kids: [['Our mission', '/about'], ['Our beliefs', '/beliefs'], ['Our story', '/ourstory'], ['Our team', '/dreamteam'], ...(s.vision_pdf ? [['Vision 2030', s.vision_pdf]] : []), ['FAQs', '/help'], ...by('about').filter((x) => !['/about', '/ourstory'].includes(x[1]))] },
    { t: 'Church life', kids: [...by('life'), ['Pastor Paul’s blog', '/pastor-pauls-blog']] },
    { t: 'What’s on', h: '/calendar' },
    { t: 'Get involved', kids: [['Join a Life Group or serve', '/get-involved'], ['Sermon library', '/sermonslibrary'], ...by('involved').filter((x) => x[1] !== '/sermonslibrary'), ['Contact us', '/contact']] },
    { t: 'Prayer', h: '/prayer' },
    { t: 'Give', h: '/giving' },
  ];
}

const cur = (path, h) => (h === path || (h !== '/' && path.startsWith(h + '/')) ? ' aria-current="page"' : '');

function header(ctx) {
  const { s, path } = ctx;
  const nav = navModel(s, ctx.pages).map((n) => {
    if (!n.kids) return `<li><a href="${esc(n.h)}"${cur(path, n.h)}>${esc(n.t)}</a></li>`;
    const active = n.kids.some(([, h]) => cur(path, h)) ? ' class="on"' : '';
    return `<li class="has-sub"><button type="button" aria-expanded="false"${active}>${esc(n.t)}</button><ul>${n.kids.map(([t, h]) => `<li><a href="${esc(h)}"${isExt(h) ? ' target="_blank" rel="noopener"' : ''}${cur(path, h)}>${esc(t)}</a></li>`).join('')}</ul></li>`;
  }).join('');
  const brand = s.logo_url
    ? `<img src="${esc(s.logo_url)}" alt="${esc(s.site_name)}, home" height="52">`
    : `${logoSvg}<span translate="no">The Higher Place</span>`;
  return `<header class="hdr"><div class="wrap hdr-in">
<a class="brand" href="/" aria-label="${esc(s.site_name)}, home">${brand}</a>
<button class="burger" type="button" aria-expanded="false" aria-controls="nav"><span class="sr">Menu</span><b></b><b></b></button>
<nav id="nav" aria-label="Main"><ul>${nav}</ul>
<div class="nav-cta">${link('/awareness#plan', 'Plan your visit', 'btn btn-coral')}${s.youtube_url ? link(s.youtube_url, 'Watch online', 'btn btn-line') : ''}</div></nav>
</div></header>`;
}

function footer(ctx) {
  const { s } = ctx; const yr = new Date().getFullYear();
  const soc = [['Facebook', s.facebook_url], ['Instagram', s.instagram_url], ['YouTube', s.youtube_url], ['Weekly devotionals', s.digest_url]].filter((x) => x[1]).map(([t, u]) => `<li>${link(u, t, '')}</li>`).join('');
  return `<footer class="ftr"><div class="wrap">
<div class="ftr-top"><div class="ftr-brand">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="" height="44">` : `${logoSvg}<b>The Higher Place</b>`}<p>${esc(s.mission)}</p></div>
<div><h2>Join us</h2><p>${esc(s.service_day)}, ${esc(s.service_time)}<br>${esc(s.venue_name)}<br>${esc(s.address)}</p><p>${link(s.map_url, 'Get directions', 'tl')}</p></div>
<div><h2>Explore</h2><ul><li><a href="/awareness">New here?</a></li><li><a href="/about">About us</a></li><li><a href="/calendar">What’s on</a></li><li><a href="/sermonslibrary">Sermon library</a></li><li><a href="/pastor-pauls-blog">Pastor Paul’s blog</a></li><li><a href="/youngadults">Young adults</a></li><li><a href="/thp-kids">THP Kids</a></li><li><a href="/get-involved">Get involved</a></li></ul></div>
<div><h2>Get in touch</h2><ul><li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li><li><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a></li><li><a href="/prayer">Prayer: ${esc(s.prayer_email)}</a></li><li><a href="/giving">Give &amp; Gift Aid</a></li></ul><h2 class="mt">Follow</h2><ul>${soc}${s.newsletter_url ? `<li>${link(s.newsletter_url, 'Join our mailing list', '')}</li>` : ''}</ul></div></div>
<div class="ftr-bot"><p>The Higher Place is a registered charity in England and Wales (charity no. ${esc(s.charity_no)}). © ${yr} The Higher Place.</p><ul><li><a href="/privacy">Privacy</a></li><li><a href="/cookies">Cookies</a></li><li><a href="/accessibility">Accessibility</a></li><li><a href="/safeguarding">Safeguarding</a></li></ul></div></div></footer>`;
}

function formHtml(kind, { only, id = kind, preset = {}, extra = '', compact = false } = {}) {
  const f = FORMS[kind]; const t = Date.now();
  const fields = f.fields.filter((x) => !only || only.includes(x.n));
  const row = (x) => {
    const fid = `${id}-${x.n}`; const v = preset[x.n] ?? '';
    const req = x.req ? ' required' : ''; const err = `<span class="err" id="${fid}-e" role="alert"></span>`;
    const ac = x.ac ? ` autocomplete="${x.ac}"` : ''; const ph = x.ph ? ` placeholder="${esc(x.ph)}"` : '';
    if (x.t === 'textarea') return `<div class="fld"><label for="${fid}">${esc(x.l)}</label><textarea id="${fid}" name="${x.n}" rows="${compact ? 3 : 5}"${req}${ph} aria-describedby="${fid}-e">${esc(v)}</textarea>${err}</div>`;
    if (x.t === 'select') return `<div class="fld"><label for="${fid}">${esc(x.l)}</label><select id="${fid}" name="${x.n}"${req} aria-describedby="${fid}-e"><option value="">Choose…</option>${x.opts.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>${err}</div>`;
    if (x.t === 'check') return `<div class="fld chk"><label><input type="checkbox" name="${x.n}"> <span>${esc(x.l)}</span></label></div>`;
    if (x.t === 'checks') return `<fieldset class="fld"><legend>${esc(x.l)}</legend><div class="chips">${x.opts.map((o, i) => `<label class="chip"><input type="checkbox" name="${x.n}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div><span class="err" id="${fid}-e" role="alert"></span></fieldset>`;
    return `<div class="fld"><label for="${fid}">${esc(x.l)}</label><input id="${fid}" name="${x.n}" type="${x.t}" value="${esc(v)}"${req}${ac}${ph} aria-describedby="${fid}-e">${err}</div>`;
  };
  return `<form class="form" method="post" action="/api/forms/${kind}" data-form="${kind}" novalidate>
${fields.map(row).join('')}${extra}
<div class="hp" aria-hidden="true"><label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><input type="hidden" name="t" value="${t}">
<p class="fine">We only use what you send to reply and care for you. See our <a href="/privacy">privacy policy</a>.</p>
<button class="btn btn-coral" type="submit">${esc(f.submit)}</button><p class="status" role="status" aria-live="polite"></p></form>`;
}

function layout(ctx, o) {
  const { s, origin } = ctx;
  const title = o.path === '/' ? `${s.site_name}, Greenwich, London | ${s.tagline}` : `${o.title} | ${s.site_name}, Greenwich`;
  const desc = o.desc || s.meta_description;
  const canon = origin + (o.path === '/' ? '/' : o.path);
  const ogimg = o.image || s.hero_image || '';
  const ld = o.ld ? `<script type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, '\\u003c')}</script>` : '';
  const ann = s.announcement_on === '1' && s.announcement_text
    ? `<div class="ann" role="region" aria-label="Announcement"><div class="wrap">${s.announcement_link ? `<a href="${esc(s.announcement_link)}">${esc(s.announcement_text)}</a>` : `<span>${esc(s.announcement_text)}</span>`}</div></div>` : '';
  const popup = o.popup ? `<dialog id="visitpop" aria-labelledby="vp-t"><button class="x" type="button" data-close aria-label="Close">×</button>
<h2 id="vp-t">Thinking of visiting?</h2><p>Leave your details and our team will look out for you this Sunday. No pressure, no spam.</p>${formHtml('visit', { only: ['name', 'email', 'party'], id: 'vp', compact: true, preset: {} })}</dialog>` : '';
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(canon)}">
${o.noindex ? '<meta name="robots" content="noindex">' : ''}<meta name="theme-color" content="#0E1736">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(s.site_name)}"><meta property="og:title" content="${esc(o.title || s.site_name)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canon)}">${ogimg ? `<meta property="og:image" content="${esc(ogimg.startsWith('/') ? origin + ogimg : ogimg)}">` : ''}
<meta name="twitter:card" content="${ogimg ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap"><link rel="stylesheet" href="/assets/site.css?v=1">${ld}</head>
<body data-popup="${esc(o.popup || '')}"><a class="skip" href="#main">Skip to content</a>
<div class="langbar" translate="no"><div class="wrap"><div role="group" aria-label="Choose language"><button type="button" data-lang="en" lang="en" aria-pressed="true">English</button><button type="button" data-lang="fr" lang="fr" aria-pressed="false">Français</button><button type="button" data-lang="es" lang="es" aria-pressed="false">Español</button><button type="button" data-lang="zh-CN" lang="zh" aria-pressed="false">中文</button></div></div></div><div id="gt" translate="no"></div>${ann}${header(ctx)}
<main id="main">${o.body}</main>${footer(ctx)}
<div class="sticky" aria-label="Quick actions">${link('/awareness#plan', 'Plan your visit', 'btn btn-coral')}${s.youtube_url ? link(s.youtube_url, 'Watch online', 'btn btn-line') : link('/contact', 'Contact us', 'btn btn-line')}</div>${popup}
<script src="/assets/site.js?v=1" defer></script></body></html>`;
}

const pageHead = (title, intro, tone = 'cobalt', crumbs = '') =>
  `<section class="phead tone-${esc(tone)}"><div class="wrap"><i class="orb o1"></i><i class="orb o2"></i>${crumbs}<h1 class="rise">${esc(title)}</h1>${intro ? `<p class="lede rise" style="--d:.12s">${esc(intro)}</p>` : ''}</div></section>`;


// ===== pages.js =====

const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
const redirect = (to, code = 301) => new Response(null, { status: code, headers: { location: to } });
const tone = (p, d = 'cobalt') => p?.tone || d;
const wrap = (inner, cls = 'sec') => `<section class="${cls}"><div class="wrap">${inner}</div></section>`;
const crumbs = (...c) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${c.map(([t, h]) => ` / ${h ? `<a href="${h}">${esc(t)}</a>` : esc(t)}`).join('')}</nav>`;
const facts = (p) => (p.facts || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((a) => a.length > 1 && a[1]);
const factsHtml = (p) => (facts(p).length ? `<dl class="facts rv">${facts(p).map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>` : '');
const quoteHtml = (p) => (p.quote ? `<blockquote class="quote rv"><p>“${esc(p.quote)}”</p>${p.quote_ref ? `<cite>${esc(p.quote_ref)}</cite>` : ''}</blockquote>` : '');
const faqs = (list) => list.map((f) => `<details class="faq"><summary>${esc(f.title)}</summary><div class="ans prose">${md(f.answer)}</div></details>`).join('');
const eventRow = (e) => `<a class="ev rv" href="/events/${esc(e.slug)}"><div class="d" aria-hidden="true"><b>${dayNum(e.start)}</b><span>${monName(e.start)}</span></div><div><h3>${esc(e.title)}</h3><p>${fmtDate(e.start)}${fmtTime(e.start) ? ', ' + fmtTime(e.start) : ''}${e.location ? ' · ' + esc(e.location) : ''}</p></div><span class="btn btn-ink btn-sm">Details</span></a>`;
const upcoming = async (db, n = 50) => { const now = londonNow(); return (await listItems(db, 'event', { order: 'start' })).filter((e) => (e.start || '') >= now.slice(0, 10)).slice(0, n); };
const vidCard = (v) => { const id = ytId(v.youtube); return `<a class="vid rv" href="${esc(v.youtube)}" target="_blank" rel="noopener"${id ? ` data-yt="${id}"` : ''}><div class="th">${id ? `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360">` : ph()}<span class="play" aria-hidden="true"></span></div><h3>${esc(v.title)}</h3><p>${[v.date ? fmtShort(v.date) + ' ' + v.date.slice(0, 4) : '', v.speaker, v.series].filter(Boolean).map(esc).join(' · ')}</p></a>`; };
const svcDetail = (s) => `${esc(s.service_day)}, ${esc(s.service_time)}`;

// Manually added videos + the latest uploads from the YouTube channel (automatic), newest first
async function allVideos(c, n = 40) {
  const manual = (await listItems(c.db, 'sermon', { order: 'date_desc' })).map((m) => ({ ...m, id: ytId(m.youtube) }));
  const feed = await ytFeed(c.s.youtube_channel_id || 'UCQqjPVZjI85I6q8fEM-afMA');
  const by = new Map(manual.map((m) => [m.id, m]));
  for (const f of feed) { const m = by.get(f.id); if (m) { if (!m.date) m.date = f.date; } else manual.push({ title: f.title, youtube: 'https://www.youtube.com/watch?v=' + f.id, date: f.date, id: f.id, speaker: '', series: '' }); }
  return manual.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, n);
}

// ---------- Home ----------
async function home(c) {
  const { s, db } = c;
  const [evs, vids, team, testi, story] = await Promise.all([upcoming(db, 3), allVideos(c, 3), listItems(db, 'team', { limit: 1 }), listItems(db, 'testimonial'), getItem(db, 'page', 'ourstory')]);
  const lines = s.tagline.replace(/^(A Church for)\s+/i, '$1\n').replace(/\s+(and Generation)/i, '\n$1').split('\n');
  const tiles = ['thp-kids', 'students', 'youngadults', 'young-at-heart', 'prayer', 'get-involved'].map((sl, i) => c.pages.find((p) => p.slug === sl) && { ...c.pages.find((p) => p.slug === sl), wide: i === 0 || i === 5 }).filter(Boolean);
  const generalT = testi.filter((t) => t.category === 'general');
  const body = `
<section class="hero"><div class="wrap hero-in"><div><h1>${lines.map((l, i) => `<span><b style="--i:${i}">${esc(l)}</b></span>`).join('')}</h1><p class="rise" style="--d:.5s">A welcoming community centred on Jesus, faith, friendship and purpose, in the heart of Greenwich.</p>
<div class="acts rise" style="--d:.65s">${link('/awareness#plan', 'Plan your visit', 'btn btn-coral')}${s.youtube_url ? link(s.youtube_url, 'Watch online', 'btn btn-line') : ''}<a class="tl" style="align-self:center;margin-left:.4rem" href="/about">Discover The Higher Place</a></div></div>
<div class="orbit" aria-hidden="true"><i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>${s.hero_image ? `<div class="arch"><img src="${esc(s.hero_image)}" alt="" fetchpriority="high"></div>` : ''}</div></div></section>
<section class="svc"><div class="wrap"><div class="svc-card">
<div><h2>When</h2><p>${svcDetail(s)}</p><small>Kids check-in from 9:45 AM</small></div>
<div><h2>Where</h2><p>${esc(s.venue_name)}</p><small>${esc(s.address)}</small></div>
<div><h2>Driving?</h2><p>Reserved parking nearby</p><small>Email ${esc(s.email)} to reserve a space.</small></div>
<div>${link(s.map_url, 'Get directions', 'btn btn-ink btn-sm')}${link('/awareness#plan', 'Plan your visit', 'btn btn-coral btn-sm')}${s.youtube_url ? link(s.youtube_url, 'Watch online', 'btn btn-line btn-sm') : ''}${link('/contact', 'Contact us', 'btn btn-line btn-sm')}</div></div></div></section>
${wrap(`<div class="split"><div class="rv"><h2 class="big">Forget everything you’ve ever thought of when it comes to church.</h2></div><div class="prose rv"><p>Instead, picture a group of people who are striving together to discover God’s purpose and plan for their lives. Imagine a home for all who are looking for hope. This is The Higher Place.</p><p>We are a church that believes in Jesus and the power of God’s word in our lives.</p><p>It is our desire to help people feel at home as we serve our community and city. Because when it comes to building a foundation for life, there’s no better place to start than the local church! <em>Come and see!</em></p><p>${link('/beliefs', 'What we believe', 'tl')}</p></div></div>`)}
<section class="mission sec"><div class="wrap"><p class="rv">${esc(s.mission)}</p><div class="acts">${link('/about', 'Our mission and values', 'btn btn-coral')}${link('/ourstory', 'Our story', 'btn btn-line')}</div></div></section>
${wrap(`<h2 class="big rv">Find your community</h2><div class="grid">${tiles.map((t, i) => `<a class="tile tone-${esc(t.tone || 'cobalt')} rv${t.wide ? ' wide' : ''}" href="/${esc(t.slug)}"><div><h3>${esc(t.title)}</h3><p>${esc(plain(t.intro, 90))}</p></div><span class="go">Find out more</span></a>`).join('')}</div>`)}
${wrap(`<div class="split" style="align-items:start"><div><h2 class="big rv">Coming up</h2><p class="lede rv">There’s always something happening, and you’re invited.</p>${link('/calendar', 'See everything on', 'btn btn-ink')}</div><div>${evs.length ? evs.map(eventRow).join('') : `<div class="empty rv"><p><strong>Our next dates are on the way.</strong></p><p>We meet ${svcDetail(s)} at ${esc(s.venue_name)}. See <a href="/calendar" class="tl">what’s on</a> for regular gatherings.</p></div>`}</div></div>`, 'sec-tight')}
${vids.length ? wrap(`<div class="row-h" style="display:flex;justify-content:space-between;align-items:end;flex-wrap:wrap;gap:1rem"><h2 class="big rv" style="margin:0">Latest messages</h2>${link('/sermonslibrary', 'Open the sermon library', 'btn btn-ink btn-sm')}</div><div class="vgrid" style="margin-top:1.2rem">${vids.map(vidCard).join('')}</div>`) : ''}
${wrap(`<div class="split" style="align-items:start"><div class="rv"><h2 class="big">Follow along</h2><p class="lede">Photos, videos and updates from our church family.</p><p style="display:flex;flex-wrap:wrap;gap:.6rem">${s.facebook_url ? link(s.facebook_url, 'Facebook', 'btn btn-ink') : ''}${s.instagram_url ? link(s.instagram_url, 'Instagram', 'btn btn-ink') : ''}${s.youtube_url ? link(s.youtube_url, 'YouTube', 'btn btn-ink') : ''}</p></div><div class="panel rv"><div class="fbbox" data-fb="${esc(s.facebook_url || 'https://www.facebook.com/thehigherplaceuk')}"><button class="btn btn-coral" type="button">Show our Facebook feed</button><p class="fine">This loads content from Facebook only when you press the button.</p></div></div></div>`, 'sec-tight')}
${wrap(`<div class="split rev"><div class="split-a rv">${pic(team[0]?.image, 'Pastors Paul and Debi Ilo', 'img-r img-tall', 'lilac', ' width="600" height="800"')}</div><div class="prose rv"><h2 class="big">Our story and our pastors</h2>${md((story?.body || '').split('\n\n').slice(0, 2).join('\n\n'))}<p>Paul and Debi Ilo are the founding and Lead Pastors of The Higher Place.</p><p>${link('/ourstory', 'Read our story', 'btn btn-ink')} ${link('/dreamteam', 'Meet the team', 'tl')}</p></div></div>`)}
${generalT.length ? wrap(`<h2 class="big rv">Stories</h2><div class="grid">${generalT.map((t) => `<figure class="card rv" style="margin:0"><blockquote style="margin:0;font-weight:600">“${esc(t.quote)}”</blockquote><figcaption style="margin-top:.8rem;color:var(--ink2)">${esc(t.title)}${t.role ? ', ' + esc(t.role) : ''}</figcaption></figure>`).join('')}</div>`) : ''}
${wrap(`<div class="band rv"><div class="split"><div><h2 class="big">Need prayer or support?</h2><p class="lede">You’re not alone. Whatever season you’re in, someone is here to pray with you and support you.</p><p>${link('/prayer', 'Request prayer', 'btn btn-ink')}</p></div><div class="panel">${formHtml('prayer', { id: 'hp', only: ['message', 'name'] })}</div></div></div>`, 'sec-tight')}
${wrap(`<div class="two"><div class="card rv"><h3>Give</h3><p>We give because He first gave to us. Simple, secure giving, with Gift Aid.</p><p>${link('/giving', 'Giving and Gift Aid', 'btn btn-coral btn-sm')}</p></div><div class="card rv"><h3>Serve</h3><p>Volunteering is a key step in becoming a leader for Jesus. There’s a team for you.</p><p>${link('/get-involved', 'Join a team or a Life Group', 'btn btn-coral btn-sm')}</p></div></div>`, 'sec-tight')}`;
  const ld = { '@context': 'https://schema.org', '@type': 'Church', name: s.site_name, url: c.origin, description: s.meta_description, telephone: s.phone, email: s.email, slogan: s.tagline, location: { '@type': 'Place', name: s.venue_name, address: { '@type': 'PostalAddress', streetAddress: '180 Greenwich High Road', addressLocality: 'London', postalCode: 'SE10 8NN', addressCountry: 'GB' } }, sameAs: [s.facebook_url, s.instagram_url, s.youtube_url].filter(Boolean) };
  return html(layout(c, { path: '/', title: s.site_name, body, ld, popup: 'home' }));
}

// ---------- New here ----------
async function newHere(c) {
  const { s, db } = c; const p = await getItem(db, 'page', 'awareness') || {};
  const ex = await listItems(db, 'expect');
  const body = `${pageHead(p.title || 'New here?', p.intro, tone(p), crumbs(['New here?']))}
${wrap(`<div class="prose rv" style="max-width:60ch"><p class="lede">${esc(p.body)}</p></div>`, 'sec-tight')}
${wrap(`<h2 class="big rv">What to expect</h2><div class="grid">${ex.map((e, i) => `<div class="card rv">${pic(e.image, '', 'img-r', ['cobalt', 'coral', 'amber'][i % 3], ' width="480" height="360"')}<h3 style="margin-top:1rem">${esc(e.title)}</h3><p>${esc(e.text)}</p></div>`).join('')}</div>`)}
${wrap(`<div class="split" style="align-items:start" id="plan"><div class="rv"><h2 class="big">Plan your visit</h2><p class="lede">Leave us your details and our team will look out for you this Sunday.</p><dl class="facts" style="grid-template-columns:1fr"><div><dt>When</dt><dd>${svcDetail(s)}</dd></div><div><dt>Where</dt><dd>${esc(s.venue_name)}, ${esc(s.address)}</dd></div><div><dt>Parking</dt><dd>${esc(s.parking_note)}</dd></div></dl><p>${link(s.map_url, 'Get directions', 'btn btn-ink')} ${s.youtube_url ? link(s.youtube_url, 'Watch online first', 'btn btn-line') : ''}</p></div><div class="panel rv">${formHtml('visit', { id: 'plan-f' })}</div></div>`, 'sec')}
${wrap(`<h2 class="big rv">Your journey at The Higher Place</h2><p class="lede rv">Everyone’s journey looks a little different, and we’re here to walk with you at your pace. Whether you want to connect with others, grow in faith or join a team, we’ve created simple pathways to help you take your next steps when you’re ready.</p><div class="grid"><div class="card rv"><h3>Discover your next step</h3><p>Tell us where you are on your journey.</p>${s.next_step_url ? `<p>${link(s.next_step_url, 'Take a next step', 'btn btn-coral btn-sm')}</p>` : ''}</div><div class="card rv"><h3>Small groups</h3><p>Church is beyond Sundays. Life Groups are where you build friendships, grow in faith, and find support.</p><p>${link('/get-involved', 'Explore Life Groups', 'btn btn-coral btn-sm')}</p></div><div class="card rv"><h3>Need prayer or support?</h3><p>You’re not alone. Email us at <a href="mailto:${esc(s.prayer_email)}">${esc(s.prayer_email)}</a> or send a request.</p><p>${link('/prayer', 'Request prayer', 'btn btn-coral btn-sm')}</p></div></div>`, 'sec-tight')}
${wrap(`<div class="band rv" style="background:var(--amber)"><h2 class="big">Join us this Sunday at ${esc(s.service_time)}</h2><p class="lede">${esc(s.venue_name)}, ${esc(s.address)}</p><p>${s.youtube_url ? link(s.youtube_url, 'YouTube live', 'btn btn-ink') : ''} ${link('/help', 'Read the FAQs', 'btn btn-line')}</p></div>`, 'sec-tight')}`;
  return html(layout(c, { path: '/awareness', title: 'New here? Plan your visit', desc: p.meta, body }));
}

// ---------- Standard content pages ----------
async function about(c) {
  const p = await getItem(c.db, 'page', 'about') || {}; const vals = await listItems(c.db, 'value');
  const body = `${pageHead(p.title, p.intro, tone(p), crumbs(['Our mission']))}
${wrap(`${quoteHtml(p)}<div class="prose rv">${md(p.body)}</div>`)}
${vals.length ? wrap(`<h2 class="big rv">Our values</h2><div class="grid">${vals.map((v, i) => `<div class="tile tone-${['cobalt', 'coral', 'navy', 'lilac', 'amber'][i % 5]} rv" style="min-height:170px"><h3 style="font-size:1.35rem">${esc(v.title)}</h3><p>${esc(v.text)}</p></div>`).join('')}</div>`) : ''}`;
  return html(layout(c, { path: '/about', title: p.title, desc: p.meta, body }));
}
async function beliefs(c) {
  const p = await getItem(c.db, 'page', 'beliefs') || {}; const bs = await listItems(c.db, 'belief');
  const body = `${pageHead(p.title, p.intro, tone(p, 'navy'), crumbs(['Our beliefs']))}${wrap(`<ol style="list-style:none;padding:0;margin:0;display:grid;gap:1rem">${bs.map((b, i) => `<li class="card rv"><h2 style="font-size:1.5rem"><span style="color:var(--cobalt)">${i + 1}.</span> ${esc(b.title)}</h2><div class="prose">${md(b.text)}</div>${b.refs ? `<p style="color:var(--ink2);font-size:.92rem;margin-top:.8rem">${esc(b.refs)}</p>` : ''}</li>`).join('')}</ol>`)}`;
  return html(layout(c, { path: '/beliefs', title: p.title, desc: p.meta, body }));
}
async function team(c) {
  const p = await getItem(c.db, 'page', 'dreamteam') || {}; const t = await listItems(c.db, 'team');
  const body = `${pageHead(p.title, p.intro, tone(p, 'lilac'), crumbs(['Our team']))}${wrap(`${quoteHtml(p)}${t.map((m) => `<div class="split rv" style="margin-bottom:3rem;align-items:start"><div>${pic(m.image, m.title, 'img-r img-tall', 'lilac', ' width="600" height="800"')}</div><div class="prose"><h2>${esc(m.title)}</h2><p><strong>${esc(m.role)}</strong></p>${md(m.bio)}</div></div>`).join('')}<div class="prose rv">${md(p.body)}</div>`)}`;
  return html(layout(c, { path: '/dreamteam', title: p.title, desc: p.meta, body }));
}
async function help(c) {
  const p = await getItem(c.db, 'page', 'help') || {}; const f = (await listItems(c.db, 'faq')).filter((x) => x.category !== 'internships');
  const body = `${pageHead(p.title, p.intro, tone(p, 'amber'), crumbs(['FAQs']))}${wrap(`<div style="max-width:820px">${faqs(f)}</div><p style="margin-top:2rem">Still wondering? ${link('/contact', 'Ask us anything', 'btn btn-ink')}</p>`)}`;
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: f.map((q) => ({ '@type': 'Question', name: q.title, acceptedAnswer: { '@type': 'Answer', text: plain(q.answer, 600) } })) };
  return html(layout(c, { path: '/help', title: p.title, desc: p.meta, body, ld }));
}
async function generic(c, p) {
  const { s, db } = c; const ministry = p.menu === 'life';
  const [fq, ts] = p.slug === 'internships' ? await Promise.all([listItems(db, 'faq'), listItems(db, 'testimonial')]) : [[], []];
  const preset = { youngadults: 'Young adults', students: 'Students', 'thp-kids': 'Kids and families', 'young-at-heart': 'Life Groups' }[p.slug];
  const body = `${pageHead(p.title, p.intro, tone(p), crumbs(...(ministry ? [['Church life']] : []), [p.title]))}
${wrap(`${factsHtml(p)}${quoteHtml(p)}${ytId(p.video) ? `<div class="rv" style="max-width:820px;margin-bottom:1.6rem">${vidCard({ title: p.title, youtube: p.video })}</div>` : ''}<div class="split" style="align-items:start"><div class="prose rv">${md(p.body)}${p.cta_url ? `<p>${link(p.cta_url, esc(p.cta_label || 'Find out more'), 'btn btn-coral')}</p>` : ''}</div><div class="rv">${pic(p.image, p.title, 'img-r', tone(p))}</div></div>`)}
${p.slug === 'safeguarding' ? wrap(`<div class="card" style="max-width:640px"><h2>Designated Safeguarding Lead</h2><p><strong>${esc(s.safeguarding_name)}</strong></p><p><a href="mailto:${esc(s.safeguarding_email)}">${esc(s.safeguarding_email)}</a></p></div>`, 'sec-tight') : ''}
${ts.filter((t) => t.category === 'internships').map((t) => wrap(`<figure class="quote rv" style="margin:0"><p>“${esc(t.quote)}”</p><cite>${esc(t.title)}${t.role ? ' (' + esc(t.role) + ')' : ''}</cite></figure>`, 'sec-tight')).join('')}
${fq.length ? wrap(`<h2 class="big rv">Internship FAQs</h2><div style="max-width:820px">${faqs(fq.filter((x) => x.category === 'internships'))}</div>`) : ''}
${ministry ? wrap(`<div class="band rv"><div class="split"><div><h2 class="big">Questions about ${esc(p.title)}?</h2><p class="lede">Send us a message and the right person will get back to you.</p></div><div class="panel">${formHtml('contact', { id: 'mq', preset: { category: preset || 'General question' } })}</div></div></div>`, 'sec-tight') : ''}`;
  return html(layout(c, { path: '/' + p.slug, title: p.title, desc: p.meta || plain(p.intro), image: p.image, body, popup: ministry ? 'ministry' : '' }));
}

// ---------- What's on ----------
async function calendar(c) {
  const { s, db } = c; const p = await getItem(db, 'page', 'calendar') || {};
  const [evs, g] = await Promise.all([upcoming(db), listItems(db, 'gathering')]);
  const body = `${pageHead(p.title, p.intro, tone(p, 'coral'), crumbs(['What’s on']))}
${wrap(`<div class="prose rv"><p class="lede">${esc(p.body)}</p></div>`, 'sec-tight')}
${wrap(`<h2 class="big rv">Every week</h2><div class="grid">${g.map((x, i) => `<div class="card rv"><h3>${esc(x.title)}</h3><p><strong>${esc(x.day)}${x.time ? ', ' + esc(x.time) : ''}</strong></p><p>${esc(x.place)}</p>${x.note ? `<p style="color:var(--ink2)">${esc(x.note)}</p>` : ''}</div>`).join('')}</div>`, 'sec-tight')}
${wrap(`<h2 class="big rv">Upcoming events</h2>${evs.length ? evs.map(eventRow).join('') : `<div class="empty rv"><p><strong>No dates have been added yet.</strong></p><p>Join our mailing list or follow us to hear first.</p><p>${s.newsletter_url ? link(s.newsletter_url, 'Join our mailing list', 'btn btn-ink') : ''}</p></div>`}`)}
${wrap(`<div class="band rv"><h2 class="big">Visiting for the first time?</h2><p class="lede">We know visiting a new church can feel like a big step, but we’ll do everything we can to help you feel at home. Find out what to expect, where to find us and how to plan your visit.</p><p>${link('/awareness#plan', 'Plan your visit', 'btn btn-ink')} ${s.newsletter_url ? link(s.newsletter_url, 'Join our mailing list', 'btn btn-line') : ''}</p></div>`, 'sec-tight')}`;
  return html(layout(c, { path: '/calendar', title: 'What’s on', desc: p.meta, body }));
}
async function event(c, slug) {
  const e = await getItem(c.db, 'event', slug); if (!e) return null;
  const body = `${pageHead(e.title, `${fmtDate(e.start)}${fmtTime(e.start) ? ' at ' + fmtTime(e.start) : ''}`, 'coral', crumbs(['What’s on', '/calendar'], [e.title]))}
${wrap(`<div class="split" style="align-items:start"><div class="prose rv">${e.location ? `<p><strong>Where:</strong> ${esc(e.location)}</p>` : ''}${md(e.description)}${e.link_url ? `<p>${link(e.link_url, esc(e.link_label || 'Book or find out more'), 'btn btn-coral')}</p>` : ''}</div><div class="rv">${pic(e.image, e.title, 'img-r', 'coral')}</div></div>`)}
${wrap(`<div class="band rv"><div class="split"><div><h2 class="big">Ask about this event</h2></div><div class="panel">${formHtml('contact', { id: 'ev', preset: { category: 'Events and courses', message: `I’d like to know more about “${e.title}”.` } })}</div></div></div>`, 'sec-tight')}`;
  const ld = { '@context': 'https://schema.org', '@type': 'Event', name: e.title, startDate: e.start, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: { '@type': 'Place', name: e.location || c.s.venue_name }, organizer: { '@type': 'Organization', name: c.s.site_name, url: c.origin }, description: plain(e.description) };
  return html(layout(c, { path: '/events/' + slug, title: e.title, desc: plain(e.description) || `${e.title}, ${fmtDate(e.start)}`, image: e.image, body, ld }));
}

// ---------- Media & blog ----------
async function sermons(c) {
  const p = await getItem(c.db, 'page', 'sermonslibrary') || {}; const v = await allVideos(c);
  const body = `${pageHead(p.title, p.intro, tone(p, 'navy'), crumbs(['Sermon library']))}${wrap(`<div class="prose rv"><p>${esc(p.body)}</p><p>${c.s.youtube_url ? link(c.s.youtube_url, 'Watch live on YouTube', 'btn btn-coral') : ''}</p></div>`, 'sec-tight')}${wrap(v.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${v.map(vidCard).join('')}</div><p style="margin-top:1.5rem">${link(c.s.youtube_url || 'https://www.youtube.com', 'See every video on YouTube', 'btn btn-ink')}</p>` : `<div class="empty"><p>Messages will appear here soon. Meanwhile, find them all on YouTube.</p></div>`)}`;
  return html(layout(c, { path: '/sermonslibrary', title: p.title, desc: p.meta, body }));
}
async function blogList(c) {
  const p = await getItem(c.db, 'page', 'pastor-pauls-blog') || {}; const posts = await listItems(c.db, 'post', { order: 'date_desc' });
  const body = `${pageHead(p.title, p.intro, tone(p, 'lilac'), crumbs(['Pastor Paul’s blog']))}${wrap(`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${posts.map((x) => `<a class="card rv" style="text-decoration:none" href="/pastor-pauls-blog/${esc(x.slug)}">${x.image ? pic(x.image, '', 'img-r') : ''}<p style="color:var(--ink2);font-weight:700;margin-top:.8rem">${fmtDate(x.date)}</p><h2 style="font-size:1.4rem">${esc(x.title)}</h2><p>${esc(x.excerpt)}</p><span class="tl">Read more</span></a>`).join('')}</div>${c.s.digest_url ? `<p style="margin-top:2rem">${link(c.s.digest_url, 'Weekly devotionals and news', 'btn btn-ink')}</p>` : ''}`)}`;
  return html(layout(c, { path: '/pastor-pauls-blog', title: p.title, desc: p.meta, body }));
}
async function post(c, slug) {
  const x = await getItem(c.db, 'post', slug);
  if (!x) { const l = await findByLegacy(c.db, 'post', c.path); return l ? redirect('/pastor-pauls-blog/' + l.slug) : null; }
  const body = `${pageHead(x.title, fmtDate(x.date), 'lilac', crumbs(['Pastor Paul’s blog', '/pastor-pauls-blog'], [x.title]))}${wrap(`<article class="prose rv" style="margin-inline:auto">${md(x.body)}<p style="margin-top:2rem">${link('/pastor-pauls-blog', 'All posts', 'btn btn-ink')}</p></article>`)}`;
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: x.title, datePublished: x.date, author: { '@type': 'Person', name: 'Paul Ilo' }, publisher: { '@type': 'Organization', name: c.s.site_name } };
  return html(layout(c, { path: '/pastor-pauls-blog/' + slug, title: x.title, desc: x.excerpt, image: x.image, body, ld }));
}

// ---------- Act: give, pray, join, contact ----------
async function giving(c) {
  const { s, db } = c; const p = await getItem(db, 'page', 'giving') || {};
  const btn = (u, t, cls) => (u ? link(u, t, cls) : '');
  const body = `${pageHead(p.title, p.intro, tone(p, 'amber'), crumbs(['Give']))}
${wrap(`<div class="split" style="align-items:start"><div class="prose rv">${md(p.body)}</div><div class="panel rv"><h2>Simple and secure</h2><p>Give a single gift, or schedule recurring giving using your PayPal account, debit, or credit card.</p><p style="display:flex;flex-wrap:wrap;gap:.6rem">${btn(s.give_paypal_url, 'Give via PayPal', 'btn btn-coral')}${btn(s.give_link_url, 'Monthly or one-off gift', 'btn btn-ink')}${btn(s.gift_aid_url, 'Gift Aid your donation', 'btn btn-line')}</p></div></div>`)}
${wrap(`<div class="two"><div class="card rv"><h3>Give by bank transfer</h3><p>You can also make donations directly to our ${esc(s.bank_note || '')} bank account through your internet banking.</p><dl class="bank"><dt>Account name</dt><dd>${esc(s.bank_name)}</dd><dt>Sort code</dt><dd>${esc(s.bank_sort)}</dd><dt>Account number</dt><dd>${esc(s.bank_account)}</dd></dl></div><div class="card rv"><h3>Expansion Fund</h3><p>Our vision is to purchase a permanent base for The Higher Place. You can give to the Expansion Fund account:</p><dl class="bank"><dt>Account name</dt><dd>${esc(s.bank_name)}</dd><dt>Sort code</dt><dd>${esc(s.expansion_sort)}</dd><dt>Account number</dt><dd>${esc(s.expansion_account)}</dd></dl>${s.expansion_url ? `<p style="margin-top:1rem">${link(s.expansion_url, 'Give to the Expansion Fund online', 'btn btn-coral btn-sm')}</p>` : ''}</div></div>`, 'sec-tight')}
${wrap(`<div class="band rv" style="background:var(--sky)"><div class="split"><div><h2 class="big">Got questions?</h2><p class="lede">If you have further questions on giving at The Higher Place, send us a message.</p></div><div class="panel">${formHtml('contact', { id: 'gv', preset: { category: 'Giving and Gift Aid' } })}</div></div></div>`, 'sec-tight')}`;
  return html(layout(c, { path: '/giving', title: 'Give', desc: p.meta, body }));
}
async function prayer(c) {
  const { s, db } = c; const p = await getItem(db, 'page', 'prayer') || {}; const g = (await listItems(db, 'gathering')).find((x) => /prayer/i.test(x.title));
  const body = `${pageHead(p.title, p.intro, tone(p, 'lilac'), crumbs(['Prayer']))}
${wrap(`<div class="split" style="align-items:start"><div class="prose rv">${md(p.body)}${g ? `<div class="card"><h3>${esc(g.title)}</h3><p><strong>${esc(g.day)}${g.time ? ', ' + esc(g.time) : ''}</strong></p><p>${esc(g.place)}</p></div>` : ''}</div><div class="panel rv" id="request"><h2>Do you need prayer?</h2><p>Whatever is on your heart, we’d love to pray with you. Share your request and our prayer team will join you in bringing it before God. Your request is private: it goes only to our prayer team and is never published.</p>${formHtml('prayer', { id: 'pr' })}<p class="fine" style="margin-top:1rem">Prefer email? <a href="mailto:${esc(s.prayer_email)}">${esc(s.prayer_email)}</a></p></div></div>`)}`;
  return html(layout(c, { path: '/prayer', title: p.title, desc: p.meta, body, popup: '' }));
}
async function involved(c) {
  const { s, db } = c; const p = await getItem(db, 'page', 'get-involved') || {};
  const body = `${pageHead(p.title, p.intro, tone(p, 'coral'), crumbs(['Get involved']))}
${wrap(`<div class="split" style="align-items:start" id="lifegroups"><div class="rv"><h2 class="big">Life Groups</h2><div class="prose"><p>${esc(p.body)}</p><p>We have location-based groups in Greenwich/Charlton, Dartford/Gravesend and East London, plus Young Adults, Young at Heart, Empowered Parents, Students and Online groups.</p>${s.lifegroups_url ? `<p>${link(s.lifegroups_url, 'Explore Life Groups', 'btn btn-ink')}</p>` : ''}</div></div><div class="panel rv">${formHtml('lifegroup', { id: 'lg' })}</div></div>`)}
${wrap(`<div class="split" style="align-items:start" id="serve"><div class="rv"><h2 class="big">Serve on a team</h2><div class="prose"><p>We warmly welcome volunteers to serve with us all year round. Volunteering is a key step on the journey to becoming a leader for Jesus.</p><p>Some roles, especially those involving children or vulnerable adults, need further checks and our safeguarding procedures before you start. We’ll talk you through it.</p><p>${link('/internships', 'Looking for an internship?', 'tl')}</p></div></div><div class="panel rv">${formHtml('volunteer', { id: 'vo' })}</div></div>`)}`;
  return html(layout(c, { path: '/get-involved', title: p.title, desc: p.meta, body }));
}
async function contact(c) {
  const { s, db } = c; const p = await getItem(db, 'page', 'contact') || {};
  const q = c.url.searchParams.get('category');
  const body = `${pageHead(p.title, p.intro, tone(p), crumbs(['Contact']))}${wrap(`<div class="split" style="align-items:start"><div class="rv"><dl class="facts" style="grid-template-columns:1fr"><div><dt>Email</dt><dd><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></dd></div><div><dt>Telephone</dt><dd><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a></dd></div><div><dt>Sundays</dt><dd>${svcDetail(s)}, ${esc(s.venue_name)}, ${esc(s.address)}</dd></div><div><dt>Prayer</dt><dd><a href="mailto:${esc(s.prayer_email)}">${esc(s.prayer_email)}</a></dd></div></dl><p>${link(s.map_url, 'Get directions', 'btn btn-ink')}</p></div><div class="panel rv">${formHtml('contact', { id: 'ct', preset: { category: q || '' } })}</div></div>`)}`;
  return html(layout(c, { path: '/contact', title: p.title, desc: p.meta, body }));
}
const thanks = async (c) => html(layout(c, { path: '/thanks', title: 'Thank you', noindex: 1, body: `${pageHead(c.url.searchParams.get('err') ? 'Something went wrong' : 'Thank you', c.url.searchParams.get('err') ? 'Please go back and try again, or email us.' : 'We’ve received your message.', 'cobalt')}${wrap(`<p>${link('/', 'Back to the home page', 'btn btn-ink')}</p>`)}` }));

const notFound = (c) => html(layout(c, { path: c.path, title: 'Page not found', noindex: 1, body: `${pageHead('We can’t find that page', 'It may have moved. Here are some good places to start.', 'coral')}${wrap(`<p style="display:flex;flex-wrap:wrap;gap:.6rem">${link('/', 'Home', 'btn btn-ink')}${link('/awareness', 'New here?', 'btn btn-coral')}${link('/calendar', 'What’s on', 'btn btn-line')}${link('/contact', 'Contact us', 'btn btn-line')}</p>`)}` }), 404);

const REDIRECTS = { '/youngpeople': '/youngadults', '/new-page-85': '/young-at-heart', '/home': '/', '/new-here': '/awareness', '/events': '/calendar', '/blog': '/pastor-pauls-blog' };
const ROUTES = { '/': home, '/awareness': newHere, '/about': about, '/beliefs': beliefs, '/dreamteam': team, '/help': help, '/calendar': calendar, '/sermonslibrary': sermons, '/pastor-pauls-blog': blogList, '/giving': giving, '/prayer': prayer, '/get-involved': involved, '/contact': contact, '/thanks': thanks };

async function sitemap(c) {
  const rows = await allSlugs(c.db); const now = londonNow().slice(0, 10);
  const urls = [['/', ''], ['/sermonslibrary', ''], ['/beliefs', ''], ['/dreamteam', ''], ['/help', ''], ['/calendar', ''], ['/pastor-pauls-blog', ''], ['/giving', ''], ['/prayer', ''], ['/get-involved', ''], ['/contact', ''], ['/awareness', '']];
  for (const r of rows) {
    if (r.type === 'page') { if (!['about', 'ourstory', 'sermonslibrary', 'pastor-pauls-blog', 'giving', 'prayer', 'get-involved', 'contact', 'calendar', 'help', 'dreamteam', 'beliefs', 'awareness'].includes(r.slug) || ['about', 'ourstory'].includes(r.slug)) urls.push(['/' + r.slug, r.updated_at]); }
    else if (r.type === 'post') urls.push(['/pastor-pauls-blog/' + r.slug, r.updated_at]);
    else if (r.type === 'event' && (r.start || '') >= now) urls.push(['/events/' + r.slug, r.updated_at]);
  }
  const seen = new Set();
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.filter(([u]) => !seen.has(u) && seen.add(u)).map(([u, m]) => `<url><loc>${c.origin}${u}</loc>${m ? `<lastmod>${m.slice(0, 10)}</lastmod>` : ''}</url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}

async function route(c) {
  const { path, db } = c;
  if (path === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${c.origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
  if (path === '/sitemap.xml') return sitemap(c);
  if (path === '/s/Vision-2030-Multiplication.pdf' && c.s.vision_pdf) return redirect(c.s.vision_pdf);
  if (REDIRECTS[path]) return redirect(REDIRECTS[path]);
  if (path.length > 1 && path.endsWith('/')) return redirect(path.slice(0, -1) + c.url.search);
  if (ROUTES[path]) return ROUTES[path](c);
  let m;
  if ((m = path.match(/^\/img\/([A-Za-z0-9_-]{6,40})$/))) {
    const r = await db.prepare('SELECT mime, b64 FROM images WHERE id = ?').bind(m[1]).first();
    if (!r) return notFound(c);
    const raw = atob(r.b64), bin = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    return new Response(bin, { headers: { 'content-type': r.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  if ((m = path.match(/^\/events\/([a-z0-9-]+)$/))) return (await event(c, m[1])) || notFound(c);
  if ((m = path.match(/^\/pastor-pauls-blog\/(.+)$/))) return (await post(c, m[1].split('/').pop())) || notFound(c);
  if ((m = path.match(/^\/([a-z0-9-]+)$/))) { const p = await getItem(db, 'page', m[1]); if (p) return generic(c, p); }
  return notFound(c);
}


// ===== website pages =====
// Serves every public page. Pages are built on the server from the D1 database,
// so Google sees real content and everything you change in /admin appears instantly.

const shell = (title, msg, status) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:18px/1.6 system-ui;max-width:640px;margin:4rem auto;padding:0 1.2rem"><h1>${title}</h1>${msg}</body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

async function pageHandler({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  if (!env.DB) return shell('Almost there: connect the database', '<p>The website is running, but it is not connected to its D1 database yet.</p><p>In Cloudflare: <b>Workers &amp; Pages → your project → Settings → Bindings → Add → D1 database</b>. Use the variable name <code>DB</code>, choose your database, save, then redeploy. The README walks through this step by step.</p>', 503);
  try {
    await init(env.DB);
    const url = new URL(request.url);
    const [s, pages] = await Promise.all([getSettings(env.DB), pageIndex(env.DB)]);
    let path = url.pathname; try { path = decodeURIComponent(path); } catch { /* keep raw */ }
    const res = await route({ db: env.DB, env, req: request, url, origin: url.origin, path, s, pages });
    return request.method === 'HEAD' ? new Response(null, res) : res;
  } catch (e) {
    console.error('Page error', e && e.stack || e);
    return shell('Something went wrong', '<p>Please try again in a moment. If it keeps happening, email love@thehigherplaceuk.com.</p>', 500);
  }
}


// ===== backend API =====
// Backend: public form endpoint + the admin API (password protected).

const TYPES = ['page', 'event', 'sermon', 'post', 'faq', 'belief', 'value', 'team', 'testimonial', 'gathering', 'expect'];
const SLUGGED = ['page', 'event', 'post'];
const RESERVED = ['admin', 'api', 'img', 'events', 'assets', 'files', 's', 'thanks', 'home', 'sitemap-xml', 'robots-txt'];
const MIMES = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'];

const wantsHtml = (req) => (req.headers.get('accept') || '').includes('text/html') && !(req.headers.get('accept') || '').includes('json');

async function notify(env, ctx, label) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return;
  ctx.waitUntil(fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: 'The Higher Place website <onboarding@resend.dev>', to: [env.NOTIFY_EMAIL], subject: `New ${label} on the website`, text: `You have a new ${label}. Log in to your dashboard to read it (details are not sent by email, to keep them private).` }) }).catch(() => {}));
}

async function submitForm(ctx, kind) {
  const { request, env, db } = ctx;
  const form = FORMS[kind]; if (!form) return json({ ok: false, message: 'Unknown form.' }, 404);
  const fail = (status, message, errors) => (wantsHtml(request) ? Response.redirect(new URL('/thanks?err=1', request.url), 303) : json({ ok: false, message, errors }, status));
  if (+(request.headers.get('content-length') || 0) > 30000) return fail(413, 'That message is too long.');
  let fd; try { fd = await request.formData(); } catch { return fail(400, 'We couldn’t read that form.'); }
  if (fd.get('website')) return json({ ok: true, message: form.ok }); // honeypot: pretend success
  const age = Date.now() - +fd.get('t'); if (!(age > 2500)) return fail(429, 'That was very quick! Please wait a moment and press send again.');
  const input = {}; for (const f of form.fields) input[f.n] = f.t === 'checks' ? fd.getAll(f.n) : fd.get(f.n);
  const { errors, data } = validate(kind, input);
  if (Object.keys(errors).length) return fail(422, 'Please check the highlighted fields.', errors);
  const ip = await clientHash(request, env, kind);
  if ((await throttleCount(db, 'f:' + ip, 600)) >= 5) return fail(429, 'You’ve sent a few messages already. Please try again in a little while, or email us.');
  await throttleHit(db, 'f:' + ip);
  await db.prepare('INSERT INTO submissions (kind, name, email, data) VALUES (?, ?, ?, ?)').bind(kind, data.name || '', data.email || '', JSON.stringify(data)).run();
  await notify(env, ctx, form.title.toLowerCase());
  return wantsHtml(request) ? Response.redirect(new URL('/thanks', request.url), 303) : json({ ok: true, message: form.ok });
}

const clean = (data) => {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!/^[a-z_]{1,30}$/.test(k) || ['id', 'type', 'slug', 'title', 'published', 'sort'].includes(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 60000) : typeof v === 'number' || typeof v === 'boolean' ? v : '';
  }
  return out;
};

async function uniqueSlug(db, type, wanted, title, exceptId = 0) {
  let base = slugify(wanted || title) || type; if (type === 'page' && RESERVED.includes(base)) base += '-page';
  let slug = base, n = 2;
  for (;;) { const r = await db.prepare('SELECT id FROM items WHERE type = ? AND slug = ? AND id != ?').bind(type, slug, exceptId).first(); if (!r) return slug; slug = `${base}-${n++}`; }
}

async function admin(ctx, segs) {
  const { request, env, db } = ctx; const m = request.method;
  if (segs[0] === 'login' && m === 'POST') {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ ok: false, message: 'Admin is not set up yet. Add ADMIN_PASSWORD and SESSION_SECRET in Cloudflare (see README step 6).' }, 503);
    const ip = await clientHash(request, env, 'login');
    if ((await throttleCount(db, 'l:' + ip, 900)) >= 8) return json({ ok: false, message: 'Too many attempts. Please wait 15 minutes and try again.' }, 429);
    const b = await request.json().catch(() => ({}));
    if (!(await safeEqual(String(b.password || ''), env.ADMIN_PASSWORD))) { await throttleHit(db, 'l:' + ip); return json({ ok: false, message: 'That password isn’t right.' }, 401); }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeSession(env)) });
  }
  if (segs[0] === 'logout') return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  if (!(await isAdmin(request, env))) return json({ ok: false, message: 'Please sign in.' }, 401);
  if (m !== 'GET' && request.headers.get('x-requested-with') !== 'fetch') return json({ ok: false, message: 'Bad request.' }, 400);

  if (segs[0] === 'me') return json({ ok: true });
  if (segs[0] === 'summary') {
    const rows = (await db.prepare('SELECT kind, SUM(is_read = 0) AS unread, COUNT(*) AS total FROM submissions GROUP BY kind').all()).results;
    const items = (await db.prepare('SELECT type, COUNT(*) AS n FROM items GROUP BY type').all()).results;
    return json({ ok: true, submissions: rows, items });
  }
  if (segs[0] === 'settings') {
    if (m === 'GET') return json({ ok: true, settings: await getSettings(db) });
    const b = await request.json().catch(() => ({})); const stmts = [];
    for (const [k, v] of Object.entries(b)) if (/^[a-z0-9_]{1,60}$/.test(k)) stmts.push(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v).slice(0, 3000)));
    if (stmts.length) await db.batch(stmts);
    return json({ ok: true });
  }
  if (segs[0] === 'items') {
    const type = new URL(request.url).searchParams.get('type');
    if (m === 'GET') {
      if (!TYPES.includes(type)) return json({ ok: false, message: 'Unknown type.' }, 400);
      return json({ ok: true, items: await listItems(db, type, { all: true, order: type === 'event' ? 'start' : type === 'post' || type === 'sermon' ? 'date_desc' : 'sort' }) });
    }
    const id = +segs[1] || 0;
    if (m === 'DELETE') { await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run(); return json({ ok: true }); }
    const b = await request.json().catch(() => ({}));
    if (!b.title || !String(b.title).trim()) return json({ ok: false, message: 'Please add a title.' }, 422);
    const published = b.published ? 1 : 0, sort = Math.max(-9999, Math.min(9999, +b.sort || 0)), data = JSON.stringify(clean(b.data));
    if (data.length > 200000) return json({ ok: false, message: 'That entry is too large.' }, 413);
    if (m === 'POST') {
      if (!TYPES.includes(b.type)) return json({ ok: false, message: 'Unknown type.' }, 400);
      const slug = SLUGGED.includes(b.type) ? await uniqueSlug(db, b.type, b.slug, b.title) : null;
      const r = await db.prepare('INSERT INTO items (type, slug, title, data, published, sort) VALUES (?, ?, ?, ?, ?, ?)').bind(b.type, slug, String(b.title).trim().slice(0, 300), data, published, sort).run();
      return json({ ok: true, id: r.meta.last_row_id, slug });
    }
    if (m === 'PUT') {
      const cur = await db.prepare('SELECT type, slug FROM items WHERE id = ?').bind(id).first(); if (!cur) return json({ ok: false, message: 'Not found.' }, 404);
      const slug = SLUGGED.includes(cur.type) ? await uniqueSlug(db, cur.type, b.slug || cur.slug, b.title, id) : null;
      await db.prepare("UPDATE items SET slug = ?, title = ?, data = ?, published = ?, sort = ?, updated_at = datetime('now') WHERE id = ?").bind(slug, String(b.title).trim().slice(0, 300), data, published, sort, id).run();
      return json({ ok: true, slug });
    }
  }
  if (segs[0] === 'submissions') {
    const id = +segs[1] || 0;
    if (m === 'GET') {
      const { results } = await db.prepare('SELECT * FROM submissions ORDER BY id DESC LIMIT 500').all();
      return json({ ok: true, submissions: results.map((r) => ({ ...r, data: JSON.parse(r.data || '{}') })) });
    }
    if (m === 'PUT') { const b = await request.json().catch(() => ({})); await db.prepare('UPDATE submissions SET is_read = ? WHERE id = ?').bind(b.is_read ? 1 : 0, id).run(); return json({ ok: true }); }
    if (m === 'DELETE') { await db.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run(); return json({ ok: true }); }
  }
  if (segs[0] === 'images') {
    if (m === 'GET') { const { results } = await db.prepare('SELECT id, name, mime, size, created_at FROM images ORDER BY created_at DESC LIMIT 300').all(); return json({ ok: true, images: results }); }
    if (m === 'DELETE') { await db.prepare('DELETE FROM images WHERE id = ?').bind(segs[1]).run(); return json({ ok: true }); }
    if (m === 'POST') {
      const mime = (request.headers.get('content-type') || '').split(';')[0];
      if (!MIMES.includes(mime)) return json({ ok: false, message: 'Please upload a JPG, PNG, WebP or GIF picture.' }, 415);
      const buf = new Uint8Array(await request.arrayBuffer());
      if (buf.length > 500000) return json({ ok: false, message: 'That picture is too big (limit about 500 KB). Try a smaller one.' }, 413);
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const id = Array.from(crypto.getRandomValues(new Uint8Array(9)), (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
      await db.prepare('INSERT INTO images (id, name, mime, b64, size) VALUES (?, ?, ?, ?, ?)').bind(id, decodeURIComponent(request.headers.get('x-filename') || 'image').slice(0, 120), mime, btoa(bin), buf.length).run();
      return json({ ok: true, url: '/img/' + id, id });
    }
  }
  return json({ ok: false, message: 'Not found.' }, 404);
}

async function apiHandler(ctx) {
  const { request, env } = ctx;
  if (!env.DB) return json({ ok: false, message: 'The database is not connected yet (see README step 5).' }, 503);
  try {
    await init(env.DB); ctx.db = env.DB;
    const segs = new URL(request.url).pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    if (segs[0] === 'forms' && request.method === 'POST') return await submitForm(ctx, segs[1]);
    if (segs[0] === 'admin') return await admin(ctx, segs.slice(1));
    return json({ ok: false, message: 'Not found.' }, 404);
  } catch (e) {
    console.error('API error', e && e.stack || e);
    return json({ ok: false, message: 'Something went wrong on our side. Please try again.' }, 500);
  }
}

// ===== static files (styles, scripts, dashboard) =====
const ASSETS = {"/assets/site.css":["text/css; charset=utf-8",":root{--ink:#0E1736;--ink2:#46507a;--cream:#FFF9F0;--paper:#fff;--sky:#E6EDFF;--cobalt:#2850F5;--coral:#FF5C3E;--amber:#FFB629;--lilac:#D3C7FF;--line:#e6dfd2;--r:22px;--w:1180px;--f:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}\n*,*::before,*::after{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}\nbody{margin:0;font:400 1.0625rem/1.65 var(--f);color:var(--ink);background:var(--cream);overflow-x:hidden}\nimg{max-width:100%;height:auto;display:block}a{color:inherit}h1,h2,h3,h4{line-height:1.08;letter-spacing:-.02em;margin:0 0 .5em;font-weight:800}\n.wrap{width:min(var(--w),100% - 2.5rem);margin-inline:auto}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}\n.skip{position:absolute;left:-999px;top:0;background:var(--amber);color:var(--ink);padding:.8rem 1.2rem;z-index:100;font-weight:700}.skip:focus{left:0}\n:focus-visible{outline:3px solid var(--amber);outline-offset:3px;border-radius:6px}\n.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.7rem 1.4rem;border-radius:999px;font-weight:700;text-decoration:none;border:2px solid transparent;cursor:pointer;font:700 1rem var(--f);transition:transform .15s,background .2s,color .2s;color:var(--ink);background:var(--paper)}\n.btn:hover{transform:translateY(-2px)}.btn:active{transform:translateY(0) scale(.98)}\n.btn-coral{background:var(--coral);color:var(--ink)}.btn-coral:hover{background:#ff7a60}.btn-ink{background:var(--ink);color:var(--cream)}.btn-line{background:transparent;border-color:currentColor}.btn-sm{min-height:40px;padding:.4rem 1rem;font-size:.95rem}\n.tl{text-decoration:none;font-weight:700;background:linear-gradient(currentColor,currentColor) 0 100%/100% 2px no-repeat;transition:background-size .25s}.tl:hover{background-size:0 2px}\n/* header */\n.langbar{background:#070d24;color:#c9d0ee}.langbar .wrap{display:flex;justify-content:flex-end;align-items:center;gap:.2rem;min-height:38px}\n.langbar button{background:none;border:0;color:inherit;font:600 .85rem var(--f);padding:.3rem .7rem;border-radius:8px;cursor:pointer;min-height:34px}.langbar button:hover{color:#fff}.langbar button[aria-pressed=true]{background:rgba(255,255,255,.16);color:#fff}\n.ann{background:var(--amber);color:var(--ink);text-align:center;font-weight:700;padding:.55rem 0;font-size:.95rem}.ann a{text-decoration:underline}\n.hdr{position:sticky;top:0;z-index:50;background:var(--ink);color:var(--cream);border-bottom:1px solid rgba(255,255,255,.08)}\n.hdr .wrap{width:min(1320px,100% - 2rem)}.hdr-in{display:flex;align-items:center;gap:1rem;min-height:72px}\n.brand{display:flex;align-items:center;gap:.6rem;text-decoration:none;font-weight:800;font-size:1.15rem;letter-spacing:-.02em;flex:none}.mark{width:42px;height:42px}.brand img{height:52px;width:auto;max-width:260px;object-fit:contain}\n#nav{display:flex;align-items:center;gap:.5rem;margin-left:auto}\n#nav ul{list-style:none;margin:0;padding:0;display:flex;gap:.1rem;align-items:center}\n#nav a,#nav button{color:inherit;text-decoration:none;font:600 .92rem var(--f);background:none;border:0;padding:.6rem .6rem;border-radius:10px;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;gap:.3rem;white-space:nowrap}\n#nav a:hover,#nav button:hover,#nav [aria-current],#nav .on{background:rgba(255,255,255,.1)}\n.has-sub{position:relative}.has-sub>button::after{content:\"\";width:.45em;height:.45em;border:solid currentColor;border-width:0 2px 2px 0;transform:rotate(45deg) translateY(-2px)}\n#nav .has-sub>ul{display:none;position:absolute;top:100%;left:0;min-width:240px;background:var(--paper);color:var(--ink);border-radius:16px;padding:.5rem;box-shadow:0 18px 40px rgba(14,23,54,.25);flex-direction:column;align-items:stretch;gap:0;z-index:60}\n#nav .has-sub:nth-last-child(-n+3)>ul{left:auto;right:0}\n#nav .has-sub>ul a{display:flex;border-radius:10px;white-space:normal}#nav .has-sub>ul a:hover{background:var(--sky)}\n#nav .has-sub.open>ul,#nav .has-sub:has(:focus-visible)>ul{display:flex}\n@media(hover:hover) and (min-width:1181px){#nav .has-sub:hover>ul{display:flex}}\n.nav-cta{display:flex;gap:.5rem;margin-left:.3rem}.nav-cta .btn{min-height:44px;padding:.5rem 1.1rem;font-size:.92rem}.nav-cta .btn-line{display:none}\n@media(min-width:1420px){.nav-cta .btn-line{display:inline-flex}}\n.burger{display:none;margin-left:auto;background:none;border:0;width:48px;height:48px;border-radius:12px;cursor:pointer;position:relative;color:inherit}\n.burger b{position:absolute;left:12px;right:12px;height:2.5px;background:currentColor;border-radius:2px;transition:transform .25s,top .25s}.burger b:nth-of-type(1){top:19px}.burger b:nth-of-type(2){top:27px}\n.burger[aria-expanded=true] b:nth-of-type(1){top:23px;transform:rotate(45deg)}.burger[aria-expanded=true] b:nth-of-type(2){top:23px;transform:rotate(-45deg)}\n@media(max-width:1180px){.burger{display:block}\n#nav{position:fixed;left:0;right:0;bottom:0;top:110px;background:var(--ink);padding:1rem 1.25rem 7rem;overflow-y:auto;display:none;margin:0;flex-direction:column;align-items:stretch}#nav.open{display:flex}\n#nav ul{flex-direction:column;align-items:stretch;gap:0}#nav a,#nav button{width:100%;font-size:1.2rem;padding:1rem .5rem;border-bottom:1px solid rgba(255,255,255,.1);border-radius:0}\n.has-sub>button{justify-content:space-between}#nav .has-sub>ul{position:static;background:transparent;color:inherit;box-shadow:none;padding:0 0 .5rem 1rem;min-width:0}#nav .has-sub>ul a:hover{background:rgba(255,255,255,.08)}#nav .has-sub>ul a{font-size:1.05rem;padding:.8rem .5rem}\n.nav-cta{flex-direction:column;margin:1.2rem 0 0}.nav-cta .btn,.nav-cta .btn-line{display:flex;width:100%}}\n/* sticky mobile actions */\n.sticky{display:none}@media(max-width:760px){.sticky{display:flex;gap:.5rem;position:fixed;left:0;right:0;bottom:0;z-index:40;padding:.6rem .8rem calc(.6rem + env(safe-area-inset-bottom));background:rgba(14,23,54,.96);color:var(--cream)}.sticky .btn{flex:1;min-height:46px;padding:.4rem .6rem;font-size:.95rem}body{padding-bottom:70px}}\n/* hero */\n.hero{background:var(--ink);color:var(--cream);position:relative;overflow:hidden;padding:clamp(1.8rem,4vw,3rem) 0 clamp(4.5rem,7vw,6rem)}\n.hero-in{display:grid;gap:2rem;grid-template-columns:1.3fr .9fr;align-items:center;position:relative}\n.hero h1{font-size:clamp(2rem,7.4vw,4.2rem);line-height:1;letter-spacing:-.035em;margin:0 0 1rem;white-space:nowrap}.hero h1 span{display:block;overflow:hidden}.hero h1 span b{display:block;font-weight:800;animation:up .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * .12s)}\n.hero p{font-size:clamp(1rem,1.6vw,1.15rem);max-width:40ch;color:#d9def5;margin:0}.hero .acts{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:1.6rem}\n.orbit{position:relative;aspect-ratio:1;width:min(100%,380px);justify-self:center}.orbit .c{position:absolute;border-radius:50%;mix-blend-mode:screen;animation:drift 14s ease-in-out infinite alternate}\n.c1{width:62%;height:62%;left:0;top:6%;background:var(--cobalt)}.c2{width:62%;height:62%;right:0;top:6%;background:var(--coral);animation-delay:-4s}.c3{width:62%;height:62%;left:19%;bottom:0;background:var(--amber);animation-delay:-8s}.c4{width:26%;height:26%;right:6%;bottom:8%;background:var(--lilac);animation-delay:-2s}\n.orbit .arch{position:absolute;inset:14% 22% 6%;border-radius:999px 999px 24px 24px;overflow:hidden;background:var(--ink);box-shadow:0 0 0 8px rgba(255,249,240,.9)}.orbit .arch img{width:100%;height:100%;object-fit:cover}\n@keyframes up{from{transform:translateY(105%)}to{transform:none}}@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(4%,-4%) scale(1.06)}}\n@media(max-width:860px){.hero-in{grid-template-columns:1fr}.orbit{width:min(70%,320px);order:-1;margin:0 auto -.5rem}.hero p{max-width:none}}\n/* service card */\n.svc{position:relative;margin-top:-3.2rem;z-index:2}.svc-card{background:var(--paper);border-radius:var(--r);padding:clamp(1.3rem,3vw,2.2rem);display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem;box-shadow:0 24px 60px rgba(14,23,54,.14)}\n.svc h2{font-size:.9rem;letter-spacing:0;color:var(--ink2);margin:0 0 .3rem;font-weight:700}.svc p{margin:0;font-weight:700;font-size:1.15rem;line-height:1.35}.svc small{display:block;font-weight:400;color:var(--ink2);font-size:.95rem;margin-top:.3rem}.svc .btn{margin:.15rem .3rem .15rem 0}\n@media(max-width:900px){.svc-card{grid-template-columns:1fr 1fr}}@media(max-width:560px){.svc-card{grid-template-columns:1fr}}\n/* sections */\n.sec,.sec-tight{padding:38px 0}h2.big{font-size:clamp(1.6rem,3.8vw,2.6rem);margin-bottom:.6em}\n.split{display:grid;grid-template-columns:1fr 1fr;gap:clamp(1.5rem,5vw,4.5rem);align-items:center}.split.rev .split-a{order:2}@media(max-width:860px){.split{grid-template-columns:1fr}.split.rev .split-a{order:0}}\n.prose{max-width:68ch}.prose h2{font-size:1.5rem;margin-top:1.4rem}.prose h3{font-size:1.3rem;margin-top:1.6rem}.prose h4{font-size:1.1rem}.prose a{color:var(--cobalt);font-weight:600}.prose ul,.prose ol{padding-left:1.2rem}.prose li{margin:.4rem 0}\n.prose blockquote{margin:1.5rem 0;padding:.4rem 0 .4rem 1.2rem;border-left:5px solid var(--coral);font-size:1.15rem}.lede{font-size:clamp(1.1rem,2.2vw,1.45rem);line-height:1.5;max-width:46ch}\n.mission{background:var(--cobalt);color:#fff;position:relative;overflow:hidden}.mission.sec{padding:48px 0}.mission p{font-size:clamp(1.4rem,3.6vw,2.6rem);line-height:1.12;font-weight:800;letter-spacing:-.03em;max-width:22ch;margin:0}.mission .acts{margin-top:2rem}\n.mission::before,.mission::after{content:\"\";position:absolute;border-radius:50%;opacity:.55;mix-blend-mode:screen}.mission::before{width:46vw;height:46vw;right:-12vw;top:-10vw;background:var(--coral)}.mission::after{width:30vw;height:30vw;right:14vw;bottom:-16vw;background:var(--amber)}.mission .wrap{position:relative;z-index:1}\n/* placeholders */\n.ph{position:relative;overflow:hidden;border-radius:var(--r);aspect-ratio:4/3;background:var(--sky)}.ph i{position:absolute;border-radius:50%;width:60%;aspect-ratio:1}\n.ph i:nth-child(1){left:-10%;top:-12%;background:var(--cobalt);opacity:.9}.ph i:nth-child(2){right:-12%;top:20%;background:var(--coral);opacity:.9}.ph i:nth-child(3){left:20%;bottom:-30%;background:var(--amber);opacity:.95}\n.ph-coral{background:#ffe3dc}.ph-amber{background:#fff0cc}.ph-lilac{background:#efeaff}.ph-navy{background:#dfe4f7}.ph-cobalt{background:var(--sky)}\n.img-r{border-radius:var(--r);aspect-ratio:4/3;object-fit:cover;width:100%}.img-tall{aspect-ratio:3/4}\n/* cards */\n.grid{display:grid;gap:1.1rem;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}\n.tile{display:flex;flex-direction:column;justify-content:space-between;min-height:220px;padding:1.5rem;border-radius:var(--r);text-decoration:none;position:relative;overflow:hidden;transition:transform .25s,box-shadow .25s}.tile:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(14,23,54,.16)}\n.tile h3{font-size:1.6rem;margin:0}.tile p{margin:.5rem 0 0;opacity:.9;font-size:1rem}.tile .go{font-weight:800;margin-top:1rem}.tile.wide{grid-column:span 2}@media(max-width:620px){.tile.wide{grid-column:auto}}\n.tone-cobalt{--bg:var(--cobalt);--fg:#fff}.tone-navy{--bg:var(--ink);--fg:var(--cream)}.tone-coral{--bg:var(--coral);--fg:var(--ink)}.tone-lilac{--bg:var(--lilac);--fg:var(--ink)}.tone-amber{--bg:var(--amber);--fg:var(--ink)}\n.tile{background:var(--bg);color:var(--fg)}\n.card{background:var(--paper);border-radius:var(--r);padding:1.5rem;border:1px solid var(--line)}.card h3{font-size:1.25rem}.card p{margin:.3rem 0}\n/* events */\n.ev{display:grid;grid-template-columns:84px 1fr auto;gap:1.2rem;align-items:center;padding:1.1rem 0;border-top:1.5px solid var(--ink);text-decoration:none}.ev:last-child{border-bottom:1.5px solid var(--ink)}\n.ev .d{background:var(--ink);color:var(--cream);border-radius:16px;text-align:center;padding:.6rem .2rem;line-height:1}.ev .d b{display:block;font-size:1.9rem;font-weight:800}.ev .d span{font-size:.85rem;font-weight:700}.ev h3{margin:0 0 .2rem;font-size:1.3rem}.ev p{margin:0;color:var(--ink2);font-size:.98rem}\n.ev:hover h3{text-decoration:underline}@media(max-width:560px){.ev{grid-template-columns:70px 1fr}.ev>.btn{grid-column:1/-1}}\n.empty{padding:2rem;border-radius:var(--r);background:var(--paper);border:2px dashed var(--line);text-align:center}\n/* media */\n.vid{display:block;text-decoration:none}.vid .th{position:relative;border-radius:var(--r);overflow:hidden;aspect-ratio:16/9;background:var(--ink)}.vid .th img{width:100%;height:100%;object-fit:cover;transition:transform .4s}.vid:hover .th img{transform:scale(1.04)}\n.vid .play{position:absolute;inset:0;margin:auto;width:64px;height:64px;border-radius:50%;background:var(--coral);display:grid;place-items:center}.vid .play::after{content:\"\";border-left:18px solid var(--ink);border-top:11px solid transparent;border-bottom:11px solid transparent;margin-left:5px}\n.vid h3{font-size:1.15rem;margin:.8rem 0 .1rem}.vid p{margin:0;color:var(--ink2);font-size:.95rem}\n.embed{aspect-ratio:16/9;border-radius:var(--r);overflow:hidden;background:var(--ink)}.embed iframe{width:100%;height:100%;border:0}\n/* page header */\n.phead{background:var(--bg);color:var(--fg);position:relative;overflow:hidden;padding:clamp(2rem,4vw,3rem) 0 clamp(1.6rem,3vw,2.4rem)}.phead .wrap{position:relative}.phead h1{font-size:clamp(2rem,5.2vw,3.7rem);letter-spacing:-.03em;max-width:20ch;margin-bottom:.3em;line-height:1.02}\n.orb{position:absolute;border-radius:50%;mix-blend-mode:soft-light;background:#fff;opacity:.35;animation:drift 16s ease-in-out infinite alternate}.o1{width:min(42vw,420px);aspect-ratio:1;right:-6%;top:-40%}.o2{width:min(22vw,220px);aspect-ratio:1;right:18%;bottom:-45%;animation-delay:-6s}\n.crumbs{font-size:.92rem;margin-bottom:1.2rem;opacity:.9}.crumbs a{text-decoration:underline}\n.rise{animation:fade .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0s)}@keyframes fade{from{opacity:0;transform:translateY(18px)}}\n.facts{display:grid;gap:.8rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:0 0 2.5rem}.facts div{background:var(--paper);border-radius:18px;padding:1rem 1.2rem;border:1px solid var(--line)}.facts dt{font-size:.88rem;color:var(--ink2);font-weight:700}.facts dd{margin:.15rem 0 0;font-weight:700}\n.quote{background:var(--paper);border-radius:var(--r);padding:clamp(1.5rem,4vw,2.5rem);border-left:8px solid var(--coral);margin:0 0 2.5rem}.quote p{font-size:clamp(1.15rem,2.4vw,1.6rem);font-weight:700;line-height:1.35;margin:0}.quote cite{display:block;margin-top:.8rem;font-style:normal;color:var(--ink2);font-weight:600}\n/* accordion */\ndetails.faq{border-top:1.5px solid var(--ink)}details.faq:last-of-type{border-bottom:1.5px solid var(--ink)}details.faq summary{list-style:none;cursor:pointer;padding:1.15rem 3rem 1.15rem 0;font-weight:800;font-size:1.15rem;position:relative}details.faq summary::-webkit-details-marker{display:none}\ndetails.faq summary::after{content:\"+\";position:absolute;right:.3rem;top:50%;translate:0 -50%;font-size:1.8rem;transition:rotate .25s}details.faq[open] summary::after{rotate:45deg}details.faq .ans{padding:0 0 1.3rem;animation:fade .35s both}\n/* forms */\n.form{display:grid;gap:1rem}.fld label,.fld legend{display:block;font-weight:700;margin-bottom:.35rem;font-size:.98rem}\ninput[type=text],input[type=email],input[type=tel],select,textarea{width:100%;font:inherit;padding:.8rem 1rem;border-radius:14px;border:2px solid #c9c2b4;background:#fff;color:var(--ink);min-height:50px}input:focus,select:focus,textarea:focus{border-color:var(--cobalt);outline:3px solid rgba(40,80,245,.25)}\n.err{display:block;color:#b3261e;font-weight:600;font-size:.92rem;margin-top:.25rem}.err:empty{display:none}[aria-invalid=true]{border-color:#b3261e!important}\n.chk label{display:flex;gap:.7rem;align-items:flex-start;font-weight:500}.chk input,.chip input{width:22px;height:22px;accent-color:var(--cobalt);flex:none;margin-top:.15rem}\nfieldset{border:0;margin:0;padding:0}.chips{display:flex;flex-wrap:wrap;gap:.5rem}.chip{position:relative}.chip input{position:absolute;opacity:0}.chip span{display:inline-block;padding:.55rem 1rem;border-radius:999px;border:2px solid #c9c2b4;background:#fff;font-weight:600;cursor:pointer}.chip input:checked+span{background:var(--ink);color:var(--cream);border-color:var(--ink)}.chip input:focus-visible+span{outline:3px solid var(--amber);outline-offset:2px}\n.hp{position:absolute;left:-9999px;height:0;overflow:hidden}.fine{font-size:.9rem;color:var(--ink2);margin:0}.status{margin:0;font-weight:700}.status.ok{color:#146c2e;background:#e4f6ea;padding:1rem;border-radius:14px}.status.bad{color:#b3261e}\n.panel{background:var(--paper);border-radius:var(--r);padding:clamp(1.3rem,3vw,2.2rem);border:1px solid var(--line)}\n.band{border-radius:var(--r);padding:clamp(1.8rem,5vw,3.5rem);background:var(--lilac)}.two{display:grid;gap:1.1rem;grid-template-columns:1fr 1fr}@media(max-width:760px){.two{grid-template-columns:1fr}}\n.bank{display:grid;grid-template-columns:auto 1fr;gap:.2rem 1rem;margin:.6rem 0 0}.bank dt{color:var(--ink2);font-weight:600}.bank dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}\n/* popup */\ndialog#visitpop{border:0;border-radius:var(--r);padding:clamp(1.4rem,4vw,2.2rem);width:min(480px,calc(100% - 2rem));background:var(--cream);color:var(--ink);box-shadow:0 30px 80px rgba(14,23,54,.4)}dialog::backdrop{background:rgba(14,23,54,.6)}dialog[open]{animation:fade .35s both}\ndialog h2{font-size:1.7rem}.x{position:absolute;right:.6rem;top:.6rem;width:44px;height:44px;border-radius:50%;border:0;background:var(--sky);font-size:1.6rem;cursor:pointer;color:var(--ink)}\n/* footer */\n.ftr{background:var(--ink);color:var(--cream);padding:48px 0 2rem;margin-top:0}.ftr a{text-decoration:none}.ftr a:hover{text-decoration:underline}.ftr h2{font-size:1rem;margin-bottom:.8rem;color:var(--amber)}.ftr h2.mt{margin-top:1.4rem}\n.ftr ul{list-style:none;padding:0;margin:0}.ftr li{margin:.3rem 0}.ftr p{margin:0 0 .8rem;color:#d9def5}.ftr-top{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.2fr;gap:2rem}.ftr-brand b{font-size:1.3rem;margin-left:.5rem;vertical-align:middle}.ftr-brand .mark{display:inline-block;vertical-align:middle}.ftr-brand p{margin-top:1rem;max-width:34ch}\n.ftr-bot{display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;border-top:1px solid rgba(255,255,255,.15);margin-top:2.5rem;padding-top:1.5rem;font-size:.92rem}.ftr-bot ul{display:flex;gap:1.2rem;flex-wrap:wrap}.ftr-bot p{margin:0}\n@media(max-width:900px){.ftr-top{grid-template-columns:1fr 1fr}}@media(max-width:560px){.ftr-top{grid-template-columns:1fr}}\n/* scroll reveal (progressive: content is visible without JS) */\n.js .rv{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1);transition-delay:var(--d,0s)}.js .rv.in{opacity:1;transform:none}\n@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.js .rv{opacity:1;transform:none}}\n\n/* v4: videos, social, translation */\n.vgrid{display:grid;gap:1.1rem;grid-template-columns:2fr 1fr}.vgrid .vid:first-child{grid-row:span 2}.vgrid .vid:first-child h3{font-size:1.4rem}\n@media(max-width:760px){.vgrid{grid-template-columns:1fr}.vgrid .vid:first-child{grid-row:auto}}\n.fbbox{min-height:120px;display:grid;place-items:center;text-align:center;gap:.5rem}.fbbox iframe{width:100%;height:560px;border:0;border-radius:14px;background:#fff}\n.goog-te-banner-frame,.skiptranslate>iframe,#goog-gt-tt,.goog-te-balloon-frame{display:none!important}body{top:0!important}#gt{position:absolute;left:-9999px}.goog-text-highlight{background:none!important;box-shadow:none!important}\n"],"/assets/site.js":["application/javascript; charset=utf-8","(() => {\n  const d = document, $ = (s, r = d) => r.querySelector(s), $$ = (s, r = d) => [...r.querySelectorAll(s)];\n  d.documentElement.classList.add('js');\n  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;\n\n  // Mobile menu + dropdowns (work with click, keyboard and touch)\n  const burger = $('.burger'), nav = $('#nav');\n  burger?.addEventListener('click', () => { const o = burger.getAttribute('aria-expanded') !== 'true'; burger.setAttribute('aria-expanded', o); if (o) nav.style.top = $('.hdr').getBoundingClientRect().bottom + 'px'; nav.classList.toggle('open', o); d.body.style.overflow = o && innerWidth <= 1180 ? 'hidden' : ''; });\n  addEventListener('resize', () => { if (innerWidth > 1180 && nav?.classList.contains('open')) burger.click(); });\n  const hoverUI = matchMedia('(hover:hover) and (min-width:1181px)');\n  $$('.has-sub > button').forEach((b) => b.addEventListener('click', () => {\n    if (hoverUI.matches) return; // desktop: hover and keyboard focus open the menu, moving away closes it\n    const li = b.parentElement, o = !li.classList.contains('open');\n    $$('.has-sub.open').forEach((x) => { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); });\n    li.classList.toggle('open', o); b.setAttribute('aria-expanded', o);\n  }));\n  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $$('.has-sub.open').forEach((x) => { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); }); if (nav?.classList.contains('open')) burger.click(); } });\n  d.addEventListener('click', (e) => { if (!e.target.closest('.has-sub')) $$('.has-sub.open').forEach((x) => { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); }); });\n\n  // Gentle scroll reveals\n  const rv = $$('.rv');\n  if ('IntersectionObserver' in window && !calm) {\n    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });\n    rv.forEach((el, i) => { el.style.setProperty('--d', (i % 4) * 0.07 + 's'); io.observe(el); });\n  } else rv.forEach((el) => el.classList.add('in'));\n\n  // YouTube: load the player only when someone presses play (the link still works without JavaScript)\n  $$('a[data-yt]').forEach((a) => a.addEventListener('click', (e) => {\n    if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault();\n    const th = $('.th', a), f = d.createElement('iframe');\n    f.src = 'https://www.youtube-nocookie.com/embed/' + a.dataset.yt + '?autoplay=1&rel=0'; f.title = $('h3', a).textContent; f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true;\n    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0'; th.replaceChildren(f);\n  }));\n\n  // Facebook feed: loads only when pressed (privacy and speed)\n  $$('.fbbox').forEach((b) => $('button', b)?.addEventListener('click', () => {\n    const f = d.createElement('iframe'); f.title = 'Facebook feed'; f.loading = 'lazy'; f.allow = 'encrypted-media';\n    f.src = 'https://www.facebook.com/plugins/page.php?href=' + encodeURIComponent(b.dataset.fb) + '&tabs=timeline&width=500&height=560&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false';\n    b.replaceChildren(f);\n  }));\n\n  // Language: English, French, Spanish, Chinese (Google Translate loads only if a language is chosen)\n  const cookie = () => (/(?:^|;\\s*)googtrans=\\/en\\/([\\w-]+)/.exec(d.cookie) || [])[1] || 'en';\n  const setLang = (code) => {\n    const v = code === 'en' ? '' : '/en/' + code, exp = code === 'en' ? ';expires=Thu, 01 Jan 1970 00:00:00 GMT' : '';\n    ['', ';domain=' + location.hostname].forEach((dm) => (d.cookie = `googtrans=${v}${exp};path=/${dm};SameSite=Lax`));\n    location.reload();\n  };\n  const cur = cookie();\n  $$('.langbar button').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.lang === cur); b.addEventListener('click', () => b.dataset.lang !== cur && setLang(b.dataset.lang)); });\n  if (cur !== 'en') {\n    d.documentElement.lang = cur === 'zh-CN' ? 'zh' : cur;\n    window.gtInit = () => new google.translate.TranslateElement({ pageLanguage: 'en', includedLanguages: 'fr,es,zh-CN', autoDisplay: false }, 'gt');\n    const sc = d.createElement('script'); sc.src = 'https://translate.google.com/translate_a/element.js?cb=gtInit'; d.head.appendChild(sc);\n  }\n\n  // Forms: validate with the server, show real errors, never fake a success\n  $$('form[data-form]').forEach((f) => f.addEventListener('submit', async (e) => {\n    e.preventDefault();\n    const st = $('.status', f), btn = $('button[type=submit]', f);\n    $$('[aria-invalid]', f).forEach((x) => x.removeAttribute('aria-invalid')); $$('.err', f).forEach((x) => (x.textContent = ''));\n    st.className = 'status'; st.textContent = 'Sending…'; btn.disabled = true;\n    try {\n      const r = await fetch(f.action, { method: 'POST', headers: { accept: 'application/json' }, body: new FormData(f) });\n      const j = await r.json().catch(() => ({}));\n      if (r.ok && j.ok) { f.reset(); st.className = 'status ok'; st.textContent = j.message; if (f.closest('dialog')) sessionStorage.setItem('popDone', '1'); }\n      else {\n        st.className = 'status bad'; st.textContent = j.message || 'Please check the highlighted fields and try again.';\n        for (const [k, m] of Object.entries(j.errors || {})) { const el = f.elements[k]; const first = el && (el.length ? el[0] : el); const box = $('#' + (first?.id || '') + '-e', f) || $(`[name=${k}]`, f)?.closest('.fld')?.querySelector('.err'); if (box) box.textContent = m; if (first && first.setAttribute) first.setAttribute('aria-invalid', 'true'); }\n        const bad = $('[aria-invalid]', f); bad?.focus();\n      }\n    } catch { st.className = 'status bad'; st.textContent = 'We couldn’t send that. Please check your connection and try again, or email us instead.'; }\n    btn.disabled = false;\n  }));\n\n  // One gentle \"plan your visit\" prompt per visit. Never on form pages, never while typing, never on arrival.\n  const pop = $('#visitpop');\n  if (pop && !sessionStorage.getItem('popDone') && !sessionStorage.getItem('popSeen')) {\n    let shown = false;\n    const busy = () => d.activeElement && /INPUT|TEXTAREA|SELECT/.test(d.activeElement.tagName) || nav?.classList.contains('open') || $('details[open]');\n    const show = () => { if (shown || busy()) return; shown = true; sessionStorage.setItem('popSeen', '1'); pop.showModal(); };\n    $('[data-close]', pop).addEventListener('click', () => pop.close());\n    pop.addEventListener('click', (e) => { if (e.target === pop) pop.close(); });\n    let t = setTimeout(function wait() { if (busy()) t = setTimeout(wait, 8000); else show(); }, 45000);\n    const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;\n    if (fine) d.addEventListener('mouseout', (e) => { if (!e.relatedTarget && e.clientY < 8 && scrollY > 600) show(); });\n  }\n})();\n"],"/favicon.svg":["image/svg+xml","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><rect width=\"48\" height=\"48\" rx=\"12\" fill=\"#0E1736\"/><circle cx=\"19\" cy=\"20\" r=\"10\" fill=\"#2850F5\"/><circle cx=\"30\" cy=\"20\" r=\"10\" fill=\"#FF5C3E\" fill-opacity=\".92\"/><circle cx=\"24.5\" cy=\"30\" r=\"10\" fill=\"#FFB629\" fill-opacity=\".92\"/></svg>\n"],"/admin/admin.css":["text/css; charset=utf-8",":root{--ink:#0E1736;--mut:#5b6486;--bg:#f4f2ee;--card:#fff;--line:#e2ddd2;--blue:#2850F5;--coral:#FF5C3E;--ok:#146c2e;--bad:#b3261e;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}\n*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-size:16px;line-height:1.5}\nh1{font-size:1.7rem;margin:0 0 .3rem}h2{font-size:1.15rem;margin:1.5rem 0 .5rem}p{margin:.3rem 0}a{color:var(--blue)}\nbutton,input,select,textarea{font:inherit}:focus-visible{outline:3px solid #FFB629;outline-offset:2px}\n.shell{display:grid;grid-template-columns:250px 1fr;min-height:100vh}\naside{background:var(--ink);color:#fff;padding:1rem;position:sticky;top:0;height:100vh;overflow:auto}aside .logo{font-weight:800;font-size:1.1rem;padding:.4rem .6rem 1rem}\naside a{display:flex;justify-content:space-between;align-items:center;color:#dfe4fa;text-decoration:none;padding:.65rem .8rem;border-radius:10px;min-height:44px}aside a:hover,aside a.on{background:rgba(255,255,255,.12);color:#fff}\naside small{display:block;padding:.9rem .8rem .2rem;color:#9aa4d6;font-weight:700;font-size:.8rem}.badge{background:var(--coral);color:var(--ink);font-weight:800;border-radius:999px;padding:0 .55rem;font-size:.85rem}\nmain{padding:1.5rem clamp(1rem,3vw,2.5rem) 4rem;max-width:980px;width:100%}\n.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.1rem 1.2rem;margin:.8rem 0}\n.btn{display:inline-flex;align-items:center;gap:.4rem;border:0;border-radius:10px;padding:.65rem 1.1rem;font-weight:700;cursor:pointer;background:var(--ink);color:#fff;text-decoration:none;min-height:44px}.btn.pri{background:var(--blue)}.btn.red{background:#fff;color:var(--bad);border:1.5px solid var(--bad)}.btn.sec{background:#fff;color:var(--ink);border:1.5px solid var(--line)}.btn.sm{min-height:36px;padding:.3rem .8rem;font-size:.92rem}\n.row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}.row.between{justify-content:space-between}\n.list .it{display:flex;gap:1rem;align-items:center;justify-content:space-between;padding:.8rem 0;border-top:1px solid var(--line)}.list .it:first-child{border-top:0}.it b{display:block}.it small{color:var(--mut)}\n.pill{font-size:.78rem;font-weight:800;padding:.1rem .6rem;border-radius:999px;background:#e4f6ea;color:var(--ok)}.pill.off{background:#eee;color:#666}\nlabel{display:block;font-weight:700;margin:1rem 0 .25rem}.help{color:var(--mut);font-size:.9rem;margin:.15rem 0 .35rem;font-weight:400}\ninput[type=text],input[type=url],input[type=email],input[type=number],input[type=date],input[type=datetime-local],input[type=password],select,textarea{width:100%;padding:.65rem .8rem;border:1.5px solid #c8c2b4;border-radius:10px;background:#fff;min-height:46px}textarea{min-height:110px;resize:vertical}textarea.md{min-height:260px}\n.chk{display:flex;gap:.6rem;align-items:center;font-weight:600;margin:1rem 0}.chk input{width:22px;height:22px}\n.imgf{display:flex;gap:1rem;align-items:center;flex-wrap:wrap}.imgf img{width:120px;height:80px;object-fit:cover;border-radius:10px;background:#ddd}\n.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.8rem}.grid .im{background:#fff;border:1px solid var(--line);border-radius:12px;padding:.5rem}.grid img{width:100%;height:110px;object-fit:cover;border-radius:8px}.grid small{display:block;word-break:break-all;color:var(--mut)}\n.login{max-width:380px;margin:12vh auto;padding:0 1rem}.err{color:var(--bad);font-weight:700}\n#toast{position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%) translateY(150%);background:var(--ink);color:#fff;padding:.8rem 1.3rem;border-radius:12px;font-weight:700;transition:transform .3s;z-index:9}#toast.show{transform:translateX(-50%)}#toast.bad{background:var(--bad)}\n.msg{border-top:1px solid var(--line);padding:.8rem 0}.msg.unread>summary{font-weight:800}.msg summary{cursor:pointer;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}.msg dl{display:grid;grid-template-columns:auto 1fr;gap:.2rem 1rem;margin:.8rem 0}.msg dt{color:var(--mut);font-weight:700}.msg dd{margin:0;white-space:pre-wrap;word-break:break-word}\n.dot{width:10px;height:10px;border-radius:50%;background:var(--coral);display:inline-block}.stat{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.8rem}.stat .card{margin:0}.stat b{font-size:1.9rem;display:block}\n@media(max-width:820px){.shell{grid-template-columns:1fr}aside{position:static;height:auto;display:flex;flex-wrap:wrap;gap:.2rem}aside small{width:100%}aside .logo{width:100%;padding-bottom:.2rem}}\n"],"/admin/admin.js":["application/javascript; charset=utf-8","(() => {\n  const $ = (s, r = document) => r.querySelector(s), app = $('#app');\n  const esc = (s) => String(s ?? '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\n  const toast = (m, bad) => { const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3200); };\n  const api = async (path, o = {}) => {\n    const r = await fetch('/api/admin/' + path, { credentials: 'same-origin', ...o, headers: { 'x-requested-with': 'fetch', 'content-type': 'application/json', ...(o.headers || {}) } });\n    let j = {}; try { j = await r.json(); } catch { /* */ }\n    if (r.status === 401 && path !== 'login') { login(); throw new Error('Please sign in.'); }\n    if (!j.ok) throw new Error(j.message || 'Something went wrong.');\n    return j;\n  };\n  const TONES = [['cobalt', 'Blue'], ['navy', 'Dark navy'], ['coral', 'Coral'], ['lilac', 'Lilac'], ['amber', 'Amber']];\n  const MD = 'Formatting: leave a blank line between paragraphs. **bold**, *italic*, ## Heading, - list item, [link text](https://address).';\n  const T = {\n    page: { label: 'Pages', one: 'page', slug: 1, order: 1, view: (i) => '/' + i.slug, sub: (i) => '/' + i.slug, fields: [\n      { k: 'slug', l: 'Web address', t: 'slug', help: 'The last part of the page’s address, e.g. students. Changing it breaks old links to this page.' },\n      { k: 'intro', l: 'Introduction line (large text under the title)', t: 'textarea' },\n      { k: 'body', l: 'Main text', t: 'md' }, { k: 'quote', l: 'Highlighted quote or Bible verse (optional)', t: 'textarea' }, { k: 'quote_ref', l: 'Quote source (optional)', t: 'text' },\n      { k: 'facts', l: 'Quick facts (optional), one per line like:  Who | Ages 18 to 35', t: 'textarea' },\n      { k: 'image', l: 'Picture (best: landscape, 1600 × 1200)', t: 'image' }, { k: 'video', l: 'YouTube video for this page (optional): paste the link', t: 'text' }, { k: 'cta_label', l: 'Button text (optional)', t: 'text' }, { k: 'cta_url', l: 'Button link', t: 'text' },\n      { k: 'tone', l: 'Header colour', t: 'select', opts: TONES }, { k: 'menu', l: 'Show in menu', t: 'select', opts: [['', 'Nowhere'], ['about', 'About us'], ['life', 'Church life (adds a question form)'], ['involved', 'Get involved']] },\n      { k: 'meta', l: 'Description shown on Google (about 150 characters)', t: 'textarea' }] },\n    event: { label: 'Events', one: 'event', slug: 1, view: (i) => '/events/' + i.slug, sub: (i) => (i.start || 'No date').replace('T', ' at '), fields: [\n      { k: 'start', l: 'Starts', t: 'datetime-local', req: 1, help: 'Events disappear from the website automatically after their date.' }, { k: 'location', l: 'Where', t: 'text' }, { k: 'category', l: 'Type (e.g. Service, Course, Community)', t: 'text' },\n      { k: 'description', l: 'Description', t: 'md' }, { k: 'image', l: 'Picture (landscape, 1600 × 1000)', t: 'image' }, { k: 'link_url', l: 'Booking or info link (optional)', t: 'text' }, { k: 'link_label', l: 'Link button text', t: 'text' }] },\n    gathering: { label: 'Weekly gatherings', one: 'gathering', order: 1, sub: (i) => `${i.day || ''} ${i.time || ''}`, fields: [{ k: 'day', l: 'Day', t: 'text' }, { k: 'time', l: 'Time', t: 'text' }, { k: 'place', l: 'Place', t: 'text' }, { k: 'note', l: 'Note', t: 'textarea' }] },\n    sermon: { label: 'Sermons & videos', one: 'message', sub: (i) => i.date || '', fields: [\n      { k: 'youtube', l: 'YouTube link', t: 'text', req: 1, help: 'Paste the video address, e.g. https://youtu.be/abc123xyz00. The picture is found automatically.' }, { k: 'date', l: 'Date', t: 'date' }, { k: 'speaker', l: 'Speaker', t: 'text' }, { k: 'series', l: 'Series', t: 'text' }, { k: 'description', l: 'Description', t: 'textarea' }] },\n    post: { label: 'Blog posts', one: 'blog post', slug: 1, view: (i) => '/pastor-pauls-blog/' + i.slug, sub: (i) => i.date || '', fields: [\n      { k: 'date', l: 'Date', t: 'date', req: 1 }, { k: 'excerpt', l: 'Short summary (shown in the list)', t: 'textarea' }, { k: 'body', l: 'Post', t: 'md' }, { k: 'image', l: 'Picture (optional)', t: 'image' }] },\n    faq: { label: 'FAQs', one: 'question', order: 1, sub: (i) => (i.category === 'internships' ? 'Internships' : 'General'), fields: [\n      { k: 'answer', l: 'Answer', t: 'md' }, { k: 'category', l: 'Shown on', t: 'select', opts: [['general', 'FAQs page'], ['internships', 'Internships page']] }] },\n    expect: { label: 'What to expect', one: 'card', order: 1, sub: (i) => i.text || '', fields: [{ k: 'text', l: 'Text', t: 'textarea' }, { k: 'image', l: 'Picture (optional)', t: 'image' }] },\n    belief: { label: 'Beliefs', one: 'belief', order: 1, sub: () => '', fields: [{ k: 'text', l: 'Statement', t: 'md' }, { k: 'refs', l: 'Bible references', t: 'textarea' }] },\n    value: { label: 'Values', one: 'value', order: 1, sub: (i) => i.text || '', fields: [{ k: 'text', l: 'Description', t: 'textarea' }] },\n    team: { label: 'Team', one: 'team member', order: 1, sub: (i) => i.role || '', fields: [{ k: 'role', l: 'Role', t: 'text' }, { k: 'bio', l: 'About them', t: 'md' }, { k: 'image', l: 'Photo (portrait, 600 × 800)', t: 'image' }] },\n    testimonial: { label: 'Stories & testimonies', one: 'story', order: 1, sub: (i) => i.category || '', fields: [\n      { k: 'role', l: 'Role (optional)', t: 'text' }, { k: 'quote', l: 'Their words (only add what the person has approved)', t: 'textarea' }, { k: 'category', l: 'Shown on', t: 'select', opts: [['general', 'Home page'], ['internships', 'Internships page']] }] },\n  };\n  const S = [\n    ['Service and venue', [['service_day', 'Service day'], ['service_time', 'Service time'], ['venue_name', 'Venue name'], ['address', 'Address'], ['map_url', 'Directions link (Google Maps)'], ['parking_note', 'Parking note', 'textarea']]],\n    ['Announcement bar', [['announcement_on', 'Show the announcement bar', 'check'], ['announcement_text', 'Message'], ['announcement_link', 'Link (optional)']]],\n    ['Contact and charity', [['email', 'Church email'], ['phone', 'Telephone'], ['prayer_email', 'Prayer email'], ['safeguarding_name', 'Safeguarding lead name'], ['safeguarding_email', 'Safeguarding lead email'], ['charity_no', 'Charity number']]],\n    ['Look and branding', [['site_name', 'Church name'], ['tagline', 'Tagline (home page headline)'], ['mission', 'Mission statement', 'textarea'], ['meta_description', 'Default Google description', 'textarea'], ['logo_url', 'Logo (use a transparent PNG that shows on dark blue)', 'image'], ['hero_image', 'Home page photo (portrait works best, 900 × 1200)', 'image']]],\n    ['Giving', [['give_paypal_url', 'PayPal link'], ['give_link_url', 'Monthly / one-off giving link'], ['gift_aid_url', 'Gift Aid form link'], ['expansion_url', 'Expansion Fund online link'], ['bank_note', 'Bank name'], ['bank_name', 'Account name'], ['bank_sort', 'Sort code'], ['bank_account', 'Account number'], ['expansion_sort', 'Expansion Fund sort code'], ['expansion_account', 'Expansion Fund account number']]],\n    ['Links', [['youtube_url', 'YouTube channel'], ['youtube_channel_id', 'YouTube channel ID (latest videos load automatically)'], ['facebook_url', 'Facebook'], ['instagram_url', 'Instagram'], ['newsletter_url', 'Mailing list sign-up'], ['digest_url', 'Weekly devotionals'], ['next_step_url', 'ChurchSuite: next step form'], ['lifegroups_url', 'ChurchSuite: Life Groups form'], ['internship_apply_url', 'Internship application form'], ['book_url', 'Book link'], ['vision_pdf', 'Vision 2030 PDF address (e.g. /files/Vision-2030.pdf)']]],\n  ];\n  let counts = {};\n\n  function shell(active, inner) {\n    const unread = (counts.submissions || []).reduce((a, r) => a + (r.unread || 0), 0);\n    const nav = (h, t, b = '') => `<a href=\"#${h}\" class=\"${active === h ? 'on' : ''}\">${t}${b}</a>`;\n    app.innerHTML = `<div class=\"shell\"><aside><div class=\"logo\">The Higher Place</div>${nav('/', 'Dashboard')}${nav('/messages', 'Messages', unread ? `<span class=\"badge\">${unread}</span>` : '')}\n<small>Content</small>${['event', 'gathering', 'sermon', 'post', 'page', 'faq'].map((k) => nav('/' + k, T[k].label)).join('')}\n<small>More content</small>${['expect', 'belief', 'value', 'team', 'testimonial'].map((k) => nav('/' + k, T[k].label)).join('')}\n<small>Site</small>${nav('/settings', 'Settings')}${nav('/images', 'Pictures')}<a href=\"/\" target=\"_blank\" rel=\"noopener\">View website ↗</a><a href=\"#\" data-out>Sign out</a></aside><main>${inner}</main></div>`;\n    $('[data-out]').onclick = async (e) => { e.preventDefault(); await fetch('/api/admin/logout', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }); login(); };\n  }\n\n  function login(msg = '') {\n    app.innerHTML = `<form class=\"login card\" id=\"lf\"><h1>Website dashboard</h1><p class=\"help\">Sign in to manage The Higher Place website.</p><label for=\"pw\">Password</label><input id=\"pw\" type=\"password\" autocomplete=\"current-password\" required><p class=\"err\" role=\"alert\">${esc(msg)}</p><button class=\"btn pri\" style=\"margin-top:1rem\">Sign in</button></form>`;\n    $('#pw').focus();\n    $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await api('login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) }); start(); } catch (x) { login(x.message); } };\n  }\n\n  // ----- form fields -----\n  function fieldHtml(f, v) {\n    const id = 'f_' + f.k, val = v ?? '';\n    if (f.t === 'textarea') return `<label for=\"${id}\">${esc(f.l)}</label>${f.help ? `<p class=\"help\">${esc(f.help)}</p>` : ''}<textarea id=\"${id}\" name=\"${f.k}\">${esc(val)}</textarea>`;\n    if (f.t === 'md') return `<label for=\"${id}\">${esc(f.l)}</label><p class=\"help\">${MD}</p><textarea class=\"md\" id=\"${id}\" name=\"${f.k}\">${esc(val)}</textarea>`;\n    if (f.t === 'select') return `<label for=\"${id}\">${esc(f.l)}</label><select id=\"${id}\" name=\"${f.k}\">${f.opts.map((o) => { const [a, b] = Array.isArray(o) ? o : [o, o]; return `<option value=\"${esc(a)}\"${a === val ? ' selected' : ''}>${esc(b)}</option>`; }).join('')}</select>`;\n    if (f.t === 'check') return `<label class=\"chk\"><input type=\"checkbox\" name=\"${f.k}\"${val === true || val === '1' ? ' checked' : ''}> ${esc(f.l)}</label>`;\n    if (f.t === 'image') return `<label for=\"${id}\">${esc(f.l)}</label><div class=\"imgf\" data-img><img alt=\"\" src=\"${esc(val)}\" ${val ? '' : 'hidden'}><div><input type=\"text\" id=\"${id}\" name=\"${f.k}\" value=\"${esc(val)}\" placeholder=\"No picture yet\"><div class=\"row\" style=\"margin-top:.4rem\"><label class=\"btn sec sm\" style=\"margin:0\">Upload picture<input type=\"file\" accept=\"image/*\" hidden></label><button type=\"button\" class=\"btn sec sm\" data-clear>Remove</button></div></div></div>`;\n    return `<label for=\"${id}\">${esc(f.l)}</label>${f.help ? `<p class=\"help\">${esc(f.help)}</p>` : ''}<input id=\"${id}\" name=\"${f.k}\" type=\"${f.t === 'slug' ? 'text' : f.t}\" value=\"${esc(val)}\"${f.req ? ' required' : ''}>`;\n  }\n  async function trimmed(file) {\n    // Crops empty/transparent margins so the logo graphics fill the space\n    const src = await createImageBitmap(file), c = document.createElement('canvas'); c.width = src.width; c.height = src.height;\n    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0); const W = c.width, H = c.height, d = x.getImageData(0, 0, W, H).data;\n    const bg = d[3] > 200 ? [d[0], d[1], d[2]] : null; let x0 = W, y0 = H, x1 = 0, y1 = 0;\n    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const i = (y * W + xx) * 4; if (d[i + 3] < 14) continue; if (bg && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < 40) continue; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }\n    if (x1 <= x0 || y1 <= y0) return src; const pad = Math.round(Math.max(W, H) * 0.01); x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);\n    return createImageBitmap(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1);\n  }\n  async function shrink(file, trim) {\n    const bmp = trim ? await trimmed(file) : await createImageBitmap(file); let w = bmp.width, h = bmp.height; const max = 1400;\n    if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }\n    for (let q = 0.85, tries = 0; tries < 6; tries++, q -= 0.1, w = Math.round(w * (tries > 2 ? 0.85 : 1)), h = Math.round(h * (tries > 2 ? 0.85 : 1))) {\n      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);\n      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));\n      if (blob && blob.size < 450000) return blob;\n    }\n    throw new Error('That picture is too large. Try a smaller one.');\n  }\n  async function upload(file, trim) {\n    const blob = file.type === 'image/gif' && file.size < 450000 && !trim ? file : await shrink(file, trim);\n    const r = await fetch('/api/admin/images', { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': 'fetch', 'content-type': blob.type, 'x-filename': encodeURIComponent(file.name) }, body: blob });\n    const j = await r.json(); if (!j.ok) throw new Error(j.message); return j.url;\n  }\n  function wireImages(root) {\n    root.querySelectorAll('[data-img]').forEach((box) => {\n      const txt = $('input[type=text]', box), img = $('img', box), show = () => { img.src = txt.value; img.hidden = !txt.value; };\n      txt.oninput = show; $('[data-clear]', box).onclick = () => { txt.value = ''; show(); };\n      $('input[type=file]', box).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; toast('Uploading…'); try { txt.value = await upload(f, txt.name === 'logo_url'); show(); toast('Picture added. Remember to save.'); } catch (x) { toast(x.message, 1); } };\n    });\n  }\n  const gather = (form, fields) => { const d = {}; for (const f of fields) { const el = form.elements[f.k]; if (!el) continue; d[f.k] = f.t === 'check' ? (el.checked ? '1' : '0') : el.value; } return d; };\n\n  // ----- views -----\n  async function dashboard() {\n    counts = await api('summary'); const n = (t) => (counts.items.find((x) => x.type === t) || {}).n || 0; const unread = counts.submissions.reduce((a, r) => a + (r.unread || 0), 0);\n    shell('/', `<h1>Welcome</h1><p class=\"help\">Everything you change here appears on the website straight away.</p>\n<div class=\"stat\" style=\"margin-top:1rem\"><a class=\"card\" href=\"#/messages\" style=\"text-decoration:none;color:inherit\"><b>${unread}</b>new messages</a><a class=\"card\" href=\"#/event\" style=\"text-decoration:none;color:inherit\"><b>${n('event')}</b>events</a><a class=\"card\" href=\"#/post\" style=\"text-decoration:none;color:inherit\"><b>${n('post')}</b>blog posts</a><a class=\"card\" href=\"#/sermon\" style=\"text-decoration:none;color:inherit\"><b>${n('sermon')}</b>videos</a></div>\n<h2>Quick jobs</h2><div class=\"row\"><a class=\"btn pri\" href=\"#/event/new\">Add an event</a><a class=\"btn pri\" href=\"#/post/new\">Write a blog post</a><a class=\"btn pri\" href=\"#/sermon/new\">Add a sermon video</a><a class=\"btn sec\" href=\"#/settings\">Change service time or announcement</a><a class=\"btn sec\" href=\"#/images\">Upload pictures</a></div>\n<div class=\"card\"><b>First time here?</b><p>1) Open <a href=\"#/settings\">Settings</a> and check the service time, address and contact details. 2) Upload your logo and a home page photo. 3) Check each draft event, then switch “Show on website” on.</p></div>`);\n  }\n  async function list(type) {\n    const c = T[type]; const { items } = await api('items?type=' + type); counts = counts.items ? counts : await api('summary');\n    shell('/' + type, `<div class=\"row between\"><h1>${c.label}</h1><a class=\"btn pri\" href=\"#/${type}/new\">+ Add ${c.one}</a></div><div class=\"card list\">${items.length ? items.map((i) => `<div class=\"it\"><div><b>${esc(i.title)}</b><small>${esc(c.sub(i))}</small></div><div class=\"row\"><span class=\"pill ${i.published ? '' : 'off'}\">${i.published ? 'Live' : 'Hidden'}</span>${c.view && i.published ? `<a class=\"btn sec sm\" href=\"${esc(c.view(i))}\" target=\"_blank\" rel=\"noopener\">View</a>` : ''}<a class=\"btn sm\" href=\"#/${type}/${i.id}\">Edit</a></div></div>`).join('') : '<p>Nothing here yet.</p>'}</div>`);\n  }\n  async function edit(type, id) {\n    const c = T[type]; let it = { published: 1, sort: 0 };\n    if (id !== 'new') { const { items } = await api('items?type=' + type); it = items.find((x) => x.id === +id); if (!it) return location.hash = '#/' + type; }\n    shell('/' + type, `<p><a href=\"#/${type}\">← Back to ${c.label.toLowerCase()}</a></p><h1>${id === 'new' ? 'Add' : 'Edit'} ${c.one}</h1><form class=\"card\" id=\"ef\"><label for=\"f_title\">${type === 'faq' ? 'Question' : 'Title'}</label><input id=\"f_title\" name=\"title\" type=\"text\" value=\"${esc(it.title || '')}\" required>\n${c.fields.map((f) => fieldHtml(f, it[f.k])).join('')}\n<label class=\"chk\"><input type=\"checkbox\" name=\"published\"${it.published ? ' checked' : ''}> Show on the website</label>${c.order ? `<label for=\"f_sort\">Order (smallest number first)</label><input id=\"f_sort\" name=\"sort\" type=\"number\" value=\"${it.sort ?? 0}\">` : ''}\n<div class=\"row\" style=\"margin-top:1.4rem\"><button class=\"btn pri\">Save</button><a class=\"btn sec\" href=\"#/${type}\">Cancel</a>${id !== 'new' ? '<button type=\"button\" class=\"btn red\" data-del style=\"margin-left:auto\">Delete</button>' : ''}</div></form>`);\n    const form = $('#ef'); wireImages(form);\n    form.onsubmit = async (e) => {\n      e.preventDefault(); const f = form.elements; const data = gather(form, c.fields.filter((x) => x.k !== 'slug'));\n      const body = { type, title: f.title.value, published: f.published.checked, sort: f.sort ? +f.sort.value : it.sort || 0, slug: f.slug ? f.slug.value : undefined, data };\n      try { await api(id === 'new' ? 'items' : 'items/' + id, { method: id === 'new' ? 'POST' : 'PUT', body: JSON.stringify(body) }); toast('Saved'); location.hash = '#/' + type; } catch (x) { toast(x.message, 1); }\n    };\n    const del = $('[data-del]'); if (del) del.onclick = async () => { if (!confirm('Delete this permanently? You can’t undo this. (Tip: untick “Show on the website” to hide it instead.)')) return; try { await api('items/' + id, { method: 'DELETE' }); toast('Deleted'); location.hash = '#/' + type; } catch (x) { toast(x.message, 1); } };\n  }\n  async function settings() {\n    const { settings: s } = await api('settings');\n    shell('/settings', `<h1>Settings</h1><p class=\"help\">Changes appear on the website straight away.</p><form id=\"sf\">${S.map(([g, fs]) => `<div class=\"card\"><h2 style=\"margin-top:0\">${g}</h2>${fs.map(([k, l, t]) => fieldHtml({ k, l, t: t || 'text' }, s[k])).join('')}</div>`).join('')}<button class=\"btn pri\">Save settings</button></form>`);\n    const form = $('#sf'); wireImages(form);\n    form.onsubmit = async (e) => { e.preventDefault(); const d = {}; S.flat().forEach(() => 0); for (const [, fs] of S) for (const [k, , t] of fs) { const el = form.elements[k]; if (el) d[k] = t === 'check' ? (el.checked ? '1' : '0') : el.value.trim(); } try { await api('settings', { method: 'PUT', body: JSON.stringify(d) }); toast('Settings saved'); } catch (x) { toast(x.message, 1); } };\n  }\n  const KINDS = { visit: 'Plan your visit', contact: 'Contact', prayer: 'Prayer request', lifegroup: 'Life Group', volunteer: 'Volunteer' };\n  async function messages() {\n    const { submissions: all } = await api('submissions'); counts = await api('summary'); const kind = new URLSearchParams(location.hash.split('?')[1] || '').get('k') || '';\n    const subs = kind ? all.filter((s) => s.kind === kind) : all;\n    shell('/messages', `<div class=\"row between\"><h1>Messages</h1><button class=\"btn sec\" id=\"csv\">Download spreadsheet (CSV)</button></div><p class=\"help\">Messages are private. Prayer requests are never shown on the website.</p>\n<div class=\"row\"><a class=\"btn sm ${kind ? 'sec' : ''}\" href=\"#/messages\">All</a>${Object.entries(KINDS).map(([k, v]) => `<a class=\"btn sm ${kind === k ? '' : 'sec'}\" href=\"#/messages?k=${k}\">${v}</a>`).join('')}</div>\n<div class=\"card\">${subs.length ? subs.map((s) => `<details class=\"msg ${s.is_read ? '' : 'unread'}\" data-id=\"${s.id}\"><summary>${s.is_read ? '' : '<span class=\"dot\" title=\"New\"></span>'}<span class=\"pill off\">${esc(KINDS[s.kind] || s.kind)}</span><span>${esc(s.name || 'Anonymous')}</span><small style=\"color:var(--mut)\">${esc(s.created_at)} UTC</small></summary><dl>${Object.entries(s.data).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v)}</dd>`).join('')}</dl><div class=\"row\">${s.email ? `<a class=\"btn sm\" href=\"mailto:${esc(s.email)}\">Reply by email</a>` : ''}<button class=\"btn sec sm\" data-read=\"${s.is_read ? 0 : 1}\">Mark as ${s.is_read ? 'unread' : 'read'}</button><button class=\"btn red sm\" data-del>Delete</button></div></details>`).join('') : '<p>No messages yet.</p>'}</div>`);\n    document.querySelectorAll('.msg').forEach((d) => {\n      const id = d.dataset.id; d.addEventListener('toggle', async () => { if (d.open && d.classList.contains('unread')) { await api('submissions/' + id, { method: 'PUT', body: JSON.stringify({ is_read: 1 }) }); d.classList.remove('unread'); $('.dot', d)?.remove(); } });\n      $('[data-read]', d).onclick = async (e) => { await api('submissions/' + id, { method: 'PUT', body: JSON.stringify({ is_read: +e.target.dataset.read }) }); messages(); };\n      $('[data-del]', d).onclick = async () => { if (confirm('Delete this message permanently?')) { await api('submissions/' + id, { method: 'DELETE' }); messages(); } };\n    });\n    $('#csv').onclick = () => { const q = (v) => '\"' + String(v ?? '').replace(/\"/g, '\"\"') + '\"'; const rows = [['Date', 'Type', 'Name', 'Email', 'Details'], ...subs.map((s) => [s.created_at, s.kind, s.name, s.email, Object.entries(s.data).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('/') : v}`).join(' | ')])]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\\n')], { type: 'text/csv' })); a.download = 'messages.csv'; a.click(); };\n  }\n  async function images() {\n    const { images: im } = await api('images');\n    shell('/images', `<h1>Pictures</h1><p class=\"help\">Pictures are shrunk automatically so the website stays fast. To use one, copy its address into any picture box, or upload straight from the page or setting you’re editing.</p><label class=\"btn pri\" style=\"margin:.5rem 0\">Upload pictures<input type=\"file\" id=\"up\" accept=\"image/*\" multiple hidden></label><div class=\"grid\">${im.map((i) => `<div class=\"im\"><img src=\"/img/${i.id}\" alt=\"\" loading=\"lazy\"><small>${esc(i.name)}</small><small>/img/${i.id}</small><div class=\"row\"><button class=\"btn sec sm\" data-copy=\"/img/${i.id}\">Copy address</button><button class=\"btn red sm\" data-del=\"${i.id}\">Delete</button></div></div>`).join('') || '<p>No pictures yet.</p>'}</div>`);\n    $('#up').onchange = async (e) => { for (const f of e.target.files) { try { toast('Uploading ' + f.name + '…'); await upload(f); } catch (x) { toast(x.message, 1); return; } } toast('Uploaded'); images(); };\n    document.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); toast('Address copied'); }));\n    document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this picture? Any page using it will show a placeholder.')) { await api('images/' + b.dataset.del, { method: 'DELETE' }); images(); } }));\n  }\n\n  async function routeNow() {\n    const [p, q] = location.hash.slice(1).split('?'); const seg = p.split('/').filter(Boolean);\n    try {\n      if (!seg.length) return await dashboard();\n      if (seg[0] === 'settings') return await settings(); if (seg[0] === 'messages') return await messages(); if (seg[0] === 'images') return await images();\n      if (T[seg[0]]) return seg[1] ? await edit(seg[0], seg[1]) : await list(seg[0]);\n      location.hash = '#/';\n    } catch (x) { if (x.message !== 'Please sign in.') toast(x.message, 1); }\n  }\n  async function start() { try { await api('me'); counts = await api('summary'); window.onhashchange = routeNow; routeNow(); } catch { login(); } }\n  start();\n})();\n"],"/admin/":["text/html; charset=utf-8","<!doctype html>\n<html lang=\"en-GB\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"robots\" content=\"noindex,nofollow\"><title>Website dashboard | The Higher Place</title>\n<link rel=\"icon\" href=\"/favicon.svg\"><link rel=\"stylesheet\" href=\"/admin/admin.css\"></head>\n<body><div id=\"app\"><p style=\"padding:2rem\">Loading…</p></div><div id=\"toast\" role=\"status\" aria-live=\"polite\"></div><script src=\"/admin/admin.js\"></script></body></html>\n"]};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let p = url.pathname;
    if (p === '/admin') return Response.redirect(url.origin + '/admin/', 301);
    const a = ASSETS[p];
    if (a && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(a[1], { headers: { 'content-type': a[0], 'cache-control': p.startsWith('/admin/') ? 'no-cache' : 'public, max-age=3600', ...(p === '/admin/' ? { 'x-robots-tag': 'noindex' } : {}) } });
    }
    if (p.startsWith('/api/')) return apiHandler({ request, env, waitUntil: (x) => ctx.waitUntil(x) });
    if (p.startsWith('/img/') && request.method === 'GET') {
      const cache = caches.default, hit = await cache.match(request); if (hit) return hit;
      const res = await pageHandler({ request, env });
      if (res.status === 200) ctx.waitUntil(cache.put(request, res.clone()));
      return res;
    }
    return pageHandler({ request, env });
  },
};
