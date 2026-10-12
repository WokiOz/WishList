const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-moi';
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

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
      body: JSON.stringify({ username: 'Wishlist de Gabriel', content: message }),
    });
  } catch (err) {
    console.error('Webhook Discord en échec :', err.message);
  }
}

// --- Upload ----------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const removeUpload = (url) => {
  if (url && url.startsWith('/uploads/')) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
};

// Image : fichier envoyé > URL saisie > valeur actuelle
const pickImage = (req, field, current = '') => {
  if (req.file) return `/uploads/${req.file.filename}`;
  const url = (req.body[field] || '').trim();
  return url || current;
};

// --- App -------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const requireAdmin = (req, res, next) =>
  req.get('x-admin-password') === ADMIN_PASSWORD ? next() : res.status(401).json({ error: 'Mot de passe incorrect' });

const findItem = (req, res) => {
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) res.status(404).json({ error: 'Cadeau introuvable' });
  return item;
};

// Renvoie "Prénom Nom" ou répond 400 si incomplet
const getPerson = (req, res) => {
  const first = (req.body.firstName || '').trim();
  const last = (req.body.lastName || '').trim();
  if (first && last) return `${first} ${last}`;
  res.status(400).json({ error: 'Nom et prénom obligatoires' });
};

// Public
app.get('/api/settings', (req, res) => res.json(db.settings));
app.get('/api/items', (req, res) => res.json(db.items));

app.post('/api/items/:id/take', (req, res) => {
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

app.post('/api/items/:id/release', (req, res) => {
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
  const { title, description = '', link = '', price = '' } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Titre obligatoire' });

  const item = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: description.trim(),
    link: link.trim(),
    price: price.trim(),
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

  for (const key of ['title', 'description', 'link', 'price']) {
    if (req.body[key] !== undefined) item[key] = req.body[key].trim();
  }
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
  if (title !== undefined) s.title = title.trim();
  if (subtitle !== undefined) s.subtitle = subtitle.trim();

  const newBg = removeBackground === 'true' ? '' : pickImage(req, 'backgroundUrl', s.background);
  if (newBg !== s.background) removeUpload(s.background);
  s.background = newBg;
  save(db);
  res.json(s);
});

app.listen(PORT, () => console.log(`Wishlist disponible sur le port ${PORT}`));
