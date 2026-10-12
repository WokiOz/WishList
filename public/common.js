// Fonctions partagées entre la page publique et l'admin

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur serveur');
  return res.status === 204 ? null : res.json();
}

async function applySettings() {
  const s = await api('/api/settings');
  document.title = s.title;
  for (const key of ['title', 'subtitle']) {
    const el = document.getElementById(key);
    if (el) el.textContent = s[key];
  }
  document.body.style.backgroundImage = s.background ? `url("${s.background}")` : '';
  return s;
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// N'accepte que les liens http(s) pour éviter les "javascript:"
const safeUrl = (url) => (/^(https?:\/\/|\/uploads\/)/i.test(url || '') ? escapeHtml(url) : '');

// Génère quelques flocons de neige décoratifs
document.querySelectorAll('.snow').forEach((el) => {
  for (let i = 0; i < 40; i++) {
    const f = document.createElement('span');
    f.textContent = '❄';
    f.style.left = Math.random() * 100 + 'vw';
    f.style.animationDuration = 6 + Math.random() * 10 + 's';
    f.style.animationDelay = -Math.random() * 15 + 's';
    f.style.fontSize = 8 + Math.random() * 14 + 'px';
    el.appendChild(f);
  }
});
