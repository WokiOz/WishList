const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'change-moi') {
  console.error('ADMIN_PASSWORD doit être défini (et différent de "change-moi").');
  process.exit(1);
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- Stockage JSON ---------------------------------------------------------
const DEFAULT_DB = {
  settings: {
    title: 'La liste de Noël de Gabriel',
    subtitle: 'Pour son tout premier anniversaire 🎂🎄',
    background: '',
  },
  items: [],
};

const load = () => (fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : structuredClone(DEFAULT_DB));
const save = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
let db = load();

// --- Discord ---------------------------------------------------------------
async function notify(message) {
  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // allowed_mentions vide : aucun @everyone / @here / @role ne peut pinger
      body: JSON.stringify({ username: 'Wishlist de Gabriel', content: message, allowed_mentions: { parse: [] } }),
    });
  } catch (err) {
    console.error('Webhook Discord en échec :', err.message);
  }
}

// --- Validation ------------------------------------------------------------
// Texte libre : toujours une chaîne, tronquée
const str = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
// Lien / image externe : uniquement http(s)
const url = (value) => {
  const v = str(value, 2000);
  return /^https?:\/\//i.test(v) ? v : '';
};
// Nom de personne : lettres, espaces, tiret, apostrophe, point (pas de markdown/lien/mention Discord)
const personName = (value) => str(value, 50).replace(/[^\p{L}\p{M} '’.-]/gu, '').trim();

// --- Upload ----------------------------------------------------------------
// L'extension est déduite du type (liste blanche), jamais du nom envoyé : pas de .html / .svg
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (req, file, cb) =>
    IMAGE_TYPES[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Format accepté : JPG, PNG, GIF ou WebP'), { expose: true })),
});

const removeUpload = (url) => {
  if (url && url.startsWith('/uploads/')) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
};

// Image : fichier envoyé > URL saisie > valeur actuelle
const pickImage = (req, field, current = '') => {
  if (req.file) return `/uploads/${req.file.filename}`;
  return url(req.body[field]) || current;
};

// --- App -------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  });
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Anti-spam (et donc anti-flood Discord) : max `max` appels par clé sur `windowMs`
function limiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    return ++entry.count <= max;
  };
}

// Anti brute-force : après 10 mauvais mots de passe, l'admin est verrouillé 15 min (global, indépendant de l'IP)
const PASSWORD_HASH = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
const login = { failures: 0, reset: 0 };
const requireAdmin = (req, res, next) => {
  if (Date.now() > login.reset) Object.assign(login, { failures: 0, reset: Date.now() + 15 * 60 * 1000 });
  if (login.failures >= 10) return res.status(429).json({ error: 'Trop de tentatives, réessayez dans 15 minutes' });
  const given = crypto.createHash('sha256').update(req.get('x-admin-password') || '').digest();
  if (crypto.timingSafeEqual(given, PASSWORD_HASH)) return next();
  login.failures++;
  res.status(401).json({ error: 'Mot de passe incorrect' });
};

// 20 prises/libérations par minute et par IP
const actionLimit = limiter(20, 60 * 1000);
const limitActions = (req, res, next) =>
  actionLimit(req.ip) ? next() : res.status(429).json({ error: 'Trop de modifications, patientez une minute' });

const findItem = (req, res) => {
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) res.status(404).json({ error: 'Cadeau introuvable' });
  return item;
};

// Renvoie "Prénom Nom" ou répond 400 si incomplet
const getPerson = (req, res) => {
  const first = personName(req.body.firstName);
  const last = personName(req.body.lastName);
  if (first && last) return `${first} ${last}`;
  res.status(400).json({ error: 'Nom et prénom obligatoires' });
};

// Public
app.get('/api/settings', (req, res) => res.json(db.settings));
app.get('/api/items', (req, res) => res.json(db.items));

app.post('/api/items/:id/take', limitActions, (req, res) => {
  const item = findItem(req, res);
  if (!item) return;
  const name = getPerson(req, res);
  if (!name) return;
  if (item.takenBy) return res.status(409).json({ error: `Déjà pris par ${item.takenBy}` });

  item.takenBy = name;
  item.takenAt = new Date().toISOString();
  save(db);
  notify(`🎁 **${name}** a pris **${item.title}**`);
  res.json(item);
});

app.post('/api/items/:id/release', limitActions, (req, res) => {
  const item = findItem(req, res);
  if (!item) return;
  const name = getPerson(req, res);
  if (!name) return;
  if (!item.takenBy) return res.status(409).json({ error: "Ce cadeau n'est pas pris" });

  const previous = item.takenBy;
  item.takenBy = null;
  item.takenAt = null;
  save(db);
  notify(`↩️ **${name}** a libéré **${item.title}** (était pris par ${previous})`);
  res.json(item);
});

// Admin
app.post('/api/login', requireAdmin, (req, res) => res.json({ ok: true }));

app.post('/api/items', requireAdmin, upload.single('image'), (req, res) => {
  const title = str(req.body.title, 120);
  if (!title) return res.status(400).json({ error: 'Titre obligatoire' });

  const item = {
    id: crypto.randomUUID(),
    title,
    description: str(req.body.description, 1000),
    link: url(req.body.link),
    price: str(req.body.price, 30),
    image: pickImage(req, 'imageUrl'),
    takenBy: null,
    takenAt: null,
  };
  db.items.push(item);
  save(db);
  notify(`🆕 Nouveau cadeau ajouté : **${item.title}**`);
  res.status(201).json(item);
});

app.put('/api/items/:id', requireAdmin, upload.single('image'), (req, res) => {
  const item = findItem(req, res);
  if (!item) return;
  const newImage = pickImage(req, 'imageUrl', item.image);
  if (newImage !== item.image) removeUpload(item.image);

  item.title = str(req.body.title, 120) || item.title;
  item.description = str(req.body.description, 1000);
  item.link = url(req.body.link);
  item.price = str(req.body.price, 30);
  item.image = newImage;
  if (req.body.resetTaken === 'true') item.takenBy = item.takenAt = null;
  save(db);
  notify(`✏️ Cadeau modifié : **${item.title}**`);
  res.json(item);
});

app.delete('/api/items/:id', requireAdmin, (req, res) => {
  const item = findItem(req, res);
  if (!item) return;
  db.items = db.items.filter((i) => i !== item);
  removeUpload(item.image);
  save(db);
  notify(`🗑️ Cadeau supprimé : **${item.title}**`);
  res.status(204).end();
});

app.put('/api/settings', requireAdmin, upload.single('background'), (req, res) => {
  const { title, subtitle, removeBackground } = req.body;
  const s = db.settings;
  s.title = str(title, 120) || s.title;
  s.subtitle = str(subtitle, 200);

  const newBg = removeBackground === 'true' ? '' : pickImage(req, 'backgroundUrl', s.background);
  if (newBg !== s.background) removeUpload(s.background);
  s.background = newBg;
  save(db);
  res.json(s);
});

// Erreurs (upload refusé, JSON invalide…) : message JSON, jamais de trace
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image trop lourde (10 Mo max)' });
  const known = err.expose || err instanceof multer.MulterError;
  if (!known) console.error(err);
  res.status(known ? err.status || 400 : 500).json({ error: known ? err.message : 'Erreur serveur' });
});

app.listen(PORT, () => console.log(`Wishlist disponible sur le port ${PORT}`));
