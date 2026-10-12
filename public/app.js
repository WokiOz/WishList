const first = document.getElementById('firstName');
const last = document.getElementById('lastName');

// On mémorise le nom du visiteur dans le navigateur
first.value = localStorage.getItem('firstName') || '';
last.value = localStorage.getItem('lastName') || '';
first.oninput = () => localStorage.setItem('firstName', first.value);
last.oninput = () => localStorage.setItem('lastName', last.value);

function renderItem(item) {
  const img = safeUrl(item.image);
  const link = safeUrl(item.link);
  return `
    <article class="card item ${item.takenBy ? 'taken' : ''}">
      ${img ? `<img src="${img}" alt="${escapeHtml(item.title)}">` : '<div class="placeholder">🎁</div>'}
      <div class="body">
        <h3>${escapeHtml(item.title)}</h3>
        ${item.price ? `<p class="price">${escapeHtml(item.price)}</p>` : ''}
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
        ${link ? `<a href="${link}" target="_blank" rel="noopener">Voir le cadeau ↗</a>` : ''}
        ${item.takenBy ? `<p class="badge">✅ Pris par ${escapeHtml(item.takenBy)}</p>` : ''}
        <label class="check">
          <input type="checkbox" data-id="${item.id}" ${item.takenBy ? 'checked' : ''}>
          ${item.takenBy ? 'Pris' : 'Je le prends'}
        </label>
      </div>
    </article>`;
}

async function loadItems() {
  const items = await api('/api/items');
  document.getElementById('items').innerHTML = items.map(renderItem).join('');
  document.getElementById('empty').hidden = items.length > 0;
}

document.getElementById('items').addEventListener('change', async (e) => {
  const box = e.target;
  if (!box.matches('input[type=checkbox]')) return;

  if (!first.value.trim() || !last.value.trim()) {
    box.checked = !box.checked;
    alert('Merci de renseigner votre prénom et votre nom en haut de la page 🎅');
    return first.focus();
  }
  if (!box.checked && !confirm('Libérer ce cadeau ?')) return (box.checked = true);

  try {
    await api(`/api/items/${box.dataset.id}/${box.checked ? 'take' : 'release'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: first.value, lastName: last.value }),
    });
  } catch (err) {
    alert(err.message);
  }
  loadItems();
});

applySettings();
loadItems();
