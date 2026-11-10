/* Formulaires Teleinfo (#6) : lit la page de réglage d'origine du module, la réaffiche en Material Design 3,
   et enregistre avec exactement les mêmes paramètres que le formulaire d'origine (aucun code C++ à toucher).
   Pages : /tic-cfg, /relay, /solar-cfg, /awtrix, /option. */
'use strict';
const PAGES_REGLAGE = { '/tic-cfg': 'Compteur et publication', '/relay': 'Relais virtuels', '/solar-cfg': 'Production solaire',
  '/awtrix': 'Afficheur Awtrix', '/option': 'Options' };
const SECRET_CHAMP = /pass|tokn|token|pwd/i;
let formulaire = null;          // { page, action, champs: [{ el, type, name, disabled }] }

const texteSans = (noeud, sauf) => {
  const c = noeud.cloneNode(true);
  c.querySelectorAll(sauf).forEach(x => x.remove());
  return c.textContent.replace(/\s+/g, ' ').trim();
};
const echap = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function construireLigne(p, zone, entetes) {
  const entrees = [...p.querySelectorAll('input, select, textarea')].filter(e => e.type !== 'hidden');
  const aide = p.getAttribute('title') || '';
  const libelle = p.querySelector('label')?.textContent.trim() || p.querySelector('.pri, .name, .hea')?.textContent.trim()
    || texteSans(p, 'input, select, textarea, script, .val, .unit');
  if (!entrees.length) return;
  const radios = entrees.filter(e => e.type === 'radio');
  const div = document.createElement('div');
  div.className = 'reglage';
  const bloc = p.closest('fieldset.config');
  if (bloc?.id) div.dataset.dans = bloc.id;
  // plusieurs boutons radio du même nom sur une ligne : choix segmenté (libellés de l'en-tête du tableau si présent)
  if (radios.length > 1 && radios.every(r => r.name === radios[0].name)) {
    div.innerHTML = `<span class="titre">${echap(libelle)}</span><div class="segments petits"></div>`;
    radios.forEach((r, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = entetes[k] || r.value; b.title = r.title || '';
      b.classList.toggle('actif', r.checked);
      b.onclick = () => { radios.forEach(x => { x.checked = x === r; }); div.querySelectorAll('button').forEach(x => x.classList.toggle('actif', x === b)); };
      div.lastElementChild.appendChild(b);
    });
    zone.appendChild(div);
    for (const e of entrees) formulaire.champs.push({ src: e, id: '' });
    return;
  }
  for (const e of entrees) {
    const id = 'r-' + e.name + '-' + (e.value || '');
    const sec = e.disabled ? ' disabled' : '';
    if (e.type === 'checkbox') {
      div.innerHTML += `<label class="interrupteur"><input type="checkbox" id="${echap(id)}"${e.checked ? ' checked' : ''}${sec}><span></span>`
        + `<b>${echap(libelle)}${aide ? `<small>${echap(aide)}</small>` : ''}</b></label>`;
    } else if (e.type === 'radio') {
      div.innerHTML += `<label class="radio"><input type="radio" name="f-${echap(e.name)}" id="${echap(id)}"${e.checked ? ' checked' : ''}${sec}><span></span>`
        + `<b>${echap(libelle)}${aide ? `<small>${echap(aide)}</small>` : ''}</b></label>`;
    } else if (e.tagName === 'SELECT') {
      div.innerHTML += `<label class="champ"><span>${echap(libelle)}</span><select id="${echap(id)}"${sec}>`
        + [...e.options].map(o => `<option value="${echap(o.value)}"${o.selected ? ' selected' : ''}>${echap(o.textContent)}</option>`).join('') + '</select></label>';
    } else {
      const type = SECRET_CHAMP.test(e.name) ? 'password' : e.type === 'number' ? 'text' : (e.type || 'text');
      const mode = e.type === 'number' ? ` inputmode="${(+e.step || 1) % 1 ? 'decimal' : 'numeric'}"` : '';
      const borne = e.type === 'number' && e.min !== '' ? `<small>${echap(e.min)} à ${echap(e.max)}</small>` : '';
      const unite = p.querySelector('.unit')?.textContent.trim() || '';
      // champ placé après un bouton radio sur la même ligne (ex. « Evolution de ± 100 ») : il en complète le libellé
      const nom = radios.length ? 'Valeur' : libelle;
      div.innerHTML += `<label class="saisie"><span>${echap(nom || e.name)}${borne}</span>`
        + `<input type="${type}" id="${echap(id)}" value="${type === 'password' ? '' : echap(e.value)}"${mode}${sec}`
        + `${type === 'password' ? ' placeholder="inchangé si vide" autocomplete="off"' : ''}>${unite ? `<i>${echap(unite)}</i>` : ''}</label>`;
    }
  }
  zone.appendChild(div);
  for (const e of entrees) formulaire.champs.push({ src: e, id: 'r-' + e.name + '-' + (e.value || '') });
}

async function majReglage(page) {
  const zone = $('r-champs');
  $('titre').textContent = PAGES_REGLAGE[page] || page;
  $('r-origine').href = MODULE + page;
  $('r-etat').textContent = '';
  zone.innerHTML = '<p class="note">Lecture des réglages…</p>';
  try {
    const doc = new DOMParser().parseFromString(await lire(page), 'text/html');
    const form = [...doc.querySelectorAll('form')].find(f => f.querySelector('button[name=save], input[name], select[name]') && !/^\/?cn$/.test(f.getAttribute('action') || ''));
    if (!form) throw new Error('formulaire introuvable');
    derniereLecture = Date.now();
    formulaire = { page, action: '/' + (form.getAttribute('action') || page).replace(/^\//, ''), champs: [], doc: form };
    zone.textContent = '';
    for (const fs of form.querySelectorAll(':scope > fieldset, :scope > div > fieldset')) {
      const carte = document.createElement('article');
      carte.className = 'carte';
      carte.innerHTML = `<h2>${echap(fs.querySelector('legend')?.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim() || '')}</h2>`;
      const entetes = [...fs.querySelectorAll('p.header .cb')].map(s => s.textContent.trim() === '❌' ? 'Aucun' : s.textContent.trim());
      for (const p of fs.querySelectorAll('p')) if (!p.classList.contains('header')) construireLigne(p, carte, entetes);
      if (carte.children.length > 1) zone.appendChild(carte);
    }
    // sous-réglages affichés selon une case (ex. Domoticz, InfluxDB, IP fixe) : relus dans le script de la page d'origine
    const scripts = [...doc.querySelectorAll('script')].map(x => x.textContent).join('\n');
    for (const [, bloc, caseId, siCoche] of scripts.matchAll(/getElementById\('([^']+)'\)\.style\.display\s*=\s*document\.getElementById\('([^']+)'\)\.checked\s*\?\s*'(\w+)'/g)) {
      const src = form.querySelector('#' + CSS.escape(caseId));
      const ici = src && document.getElementById('r-' + src.name + '-' + (src.value || ''));
      if (!ici) continue;
      const maj = () => zone.querySelectorAll(`[data-dans="${CSS.escape(bloc)}"]`).forEach(d => { d.hidden = ici.checked !== (siCoche === 'block'); });
      ici.addEventListener('change', maj); maj();
    }
  } catch (e) { zone.innerHTML = `<p class="alerte">Réglages illisibles : ${echap(e.message)}</p>`; }
  etat();
}

function requeteReglage() {
  const q = new URLSearchParams();
  for (const { src, id } of formulaire.champs) {
    const ici = document.getElementById(id);
    if (src.disabled || !src.name) continue;
    if (src.type === 'checkbox') { if (ici?.checked) q.append(src.name, 'on'); }
    else if (src.type === 'radio') { if (ici ? ici.checked : src.checked) q.append(src.name, src.value); }
    else if (src.type === 'hidden') q.append(src.name, src.value);
    else if (SECRET_CHAMP.test(src.name) && !ici.value) continue;     // mot de passe laissé vide : on n'y touche pas
    else q.append(src.name, ici ? ici.value : src.value);
  }
  formulaire.doc.querySelectorAll('input[type=hidden][name]').forEach(h => { if (!q.has(h.name)) q.append(h.name, h.value); });
  q.append('save', '');
  return formulaire.action + '?' + q.toString();
}

$('r-enregistrer').addEventListener('click', async () => {
  if (!formulaire) return;
  const e = $('r-etat');
  try {
    const r = await fetch(requeteReglage(), { cache: 'no-store' });
    if (r.status === 403) { e.textContent = 'Enregistrement désactivé dans le prototype (lecture seule).'; return; }
    if (!r.ok) throw new Error(r.status);
    e.textContent = 'Réglages enregistrés.';
    majReglage(formulaire.page);
  } catch (err) { e.textContent = 'Échec de l\'enregistrement : ' + err.message; }
});

if (vue === 'reglage') majReglage(pageReglage);
