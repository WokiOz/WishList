let password = sessionStorage.getItem('adminPassword') || '';
let items = [];

const $ = (id) => document.getElementById(id);
const auth = () => ({ 'x-admin-password': password });

async function login(pwd) {
  await api('/api/login', { method: 'POST', headers: { 'x-admin-password': pwd } });
  password = pwd;
  sessionStorage.setItem('adminPassword', pwd);
  $('login').hidden = true;
  $('admin').hidden = false;
  const s = await applySettings();
  $('settings').title.value = s.title;
  $('settings').subtitle.value = s.subtitle;
  loadItems();
}

async function loadItems() {
  items = await api('/api/items');
  $('list').innerHTML = items
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.title)}</td>
        <td>${i.takenBy ? `✅ ${escapeHtml(i.takenBy)}` : '—'}</td>
        <td class="actions">
          <button data-edit="${i.id}" class="secondary">Modifier</button>
          <button data-delete="${i.id}" class="danger">Supprimer</button>
        </td>
      </tr>`
    )
    .join('');
}

function resetForm() {
  const f = $('itemForm');
  f.reset();
  f.itemId.value = '';
  $('formTitle').textContent = '🎁 Ajouter un cadeau';
  $('cancel').hidden = $('resetWrap').hidden = true;
}

$('login').onsubmit = (e) => {
  e.preventDefault();
  login(e.target.password.value).catch((err) => alert(err.message));
};

$('settings').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/api/settings', { method: 'PUT', headers: auth(), body: new FormData(e.target) });
    e.target.background.value = e.target.backgroundUrl.value = '';
    e.target.removeBackground.checked = false;
    await applySettings();
    alert('Apparence enregistrée ✨');
  } catch (err) {
    alert(err.message);
  }
};

$('itemForm').onsubmit = async (e) => {
  e.preventDefault();
  const id = e.target.itemId.value;
  try {
    await api(id ? `/api/items/${id}` : '/api/items', { method: id ? 'PUT' : 'POST', headers: auth(), body: new FormData(e.target) });
    resetForm();
    loadItems();
  } catch (err) {
    alert(err.message);
  }
};

$('cancel').onclick = resetForm;

$('list').onclick = async (e) => {
  const { edit, delete: del } = e.target.dataset;
  if (edit) {
    const item = items.find((i) => i.id === edit);
    const f = $('itemForm');
    f.itemId.value = item.id;
    for (const key of ['title', 'description', 'price', 'link']) f[key].value = item[key] || '';
    f.imageUrl.value = item.image.startsWith('http') ? item.image : '';
    $('formTitle').textContent = `✏️ Modifier « ${item.title} »`;
    $('cancel').hidden = false;
    $('resetWrap').hidden = !item.takenBy;
    f.scrollIntoView({ behavior: 'smooth' });
  }
  if (del && confirm('Supprimer ce cadeau ?')) {
    await api(`/api/items/${del}`, { method: 'DELETE', headers: auth() }).catch((err) => alert(err.message));
    loadItems();
  }
};

applySettings();
if (password) login(password).catch(() => sessionStorage.removeItem('adminPassword'));
