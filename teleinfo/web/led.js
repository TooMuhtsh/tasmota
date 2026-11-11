/* Écran LED du module : couleur selon les heures pleines / creuses, la couleur du jour (Tempo) ou des règles.
   Le pilotage tourne sur le module (berry/mobile.be, route /m-led) : le téléphone ne fait que lire et enregistrer. */
'use strict';
const LED_MODES = [
  ['origine', 'Comme le firmware', 'clignote selon la réception, couleur Tempo'],
  ['hphc', 'Heures pleines / creuses', 'une couleur pour chaque'],
  ['jour', 'Couleur du jour', 'bleu, blanc ou rouge (Tempo)'],
  ['perso', 'Personnalisée', 'vos règles, la première qui s\'applique gagne'],
  ['eteinte', 'Éteinte', ''],
];
const LED_CONDITIONS = { hc: 'Heures creuses', hp: 'Heures pleines', bleu: 'Jour bleu', blanc: 'Jour blanc', rouge: 'Jour rouge',
  demain_blanc: 'Demain blanc', demain_rouge: 'Demain rouge', puissance: 'Puissance ≥', toujours: 'Toujours' };
let led = null;   // { cfg, contrat, puissance, cible }

const hex = c => '#' + String(c || '000000').replace('#', '').slice(0, 6);
const sansDiese = c => c.replace('#', '').toUpperCase();
const ledEchap = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function couleurChamp(cle, libelle) {
  return `<label class="saisie"><span>${libelle}</span><input type="color" data-cle="${cle}" value="${hex(led.cfg[cle])}"></label>`;
}
function interrupteur(cle, libelle, aide = '') {
  return `<label class="interrupteur"><input type="checkbox" data-cle="${cle}"${led.cfg[cle] ? ' checked' : ''}><span></span>`
    + `<b>${libelle}${aide ? `<small>${aide}</small>` : ''}</b></label>`;
}

function regleLigne(r, k) {
  const options = Object.entries(LED_CONDITIONS)
    .map(([v, t]) => `<option value="${v}"${r.si === v ? ' selected' : ''}>${t}</option>`).join('');
  return `<div class="regle" data-k="${k}">
    <div class="haut"><select data-r="si" aria-label="Condition">${options}</select>
    <input data-r="seuil" inputmode="numeric" aria-label="Seuil en W" value="${ledEchap(r.seuil ?? 6000)}"${r.si === 'puissance' ? '' : ' hidden'}><i class="w"${r.si === 'puissance' ? '' : ' hidden'}>W</i></div>
    <div class="bas"><input type="color" data-r="rgb" aria-label="Couleur" value="${hex(r.rgb)}">
    <label class="mini" title="Clignote"><input type="checkbox" data-r="cli"${r.cli ? ' checked' : ''}>clignote</label>
    <button type="button" class="bouton texte" data-suppr aria-label="Supprimer la règle">✕</button></div>
  </div>`;
}

function dessinerLed() {
  const c = led.cfg, m = c.mode;
  $('l-modes').innerHTML = LED_MODES.map(([v, t, aide]) => `<label class="radio"><input type="radio" name="l-mode" value="${v}"${m === v ? ' checked' : ''}><span></span>`
    + `<b>${t}${aide ? `<small>${aide}</small>` : ''}</b></label>`).join('');
  const zone = $('l-couleurs');
  zone.hidden = !['hphc', 'jour', 'perso'].includes(m);
  if (m === 'hphc') zone.innerHTML = '<h2>Couleurs</h2>' + couleurChamp('hp', 'Heures pleines') + couleurChamp('hc', 'Heures creuses');
  if (m === 'jour') zone.innerHTML = '<h2>Couleurs</h2>' + couleurChamp('bleu', 'Jour bleu') + couleurChamp('blanc', 'Jour blanc') + couleurChamp('rouge', 'Jour rouge')
    + '<label class="champ"><span>Clignote en</span><select data-cle="cli_jour">'
    + [['non', 'jamais'], ['hc', 'heures creuses'], ['hp', 'heures pleines']].map(([v, l]) => `<option value="${v}"${c.cli_jour === v ? ' selected' : ''}>${l}</option>`).join('')
    + '</select></label>'
    + interrupteur('hc_doux', 'Plus douce en heures creuses', 'luminosité divisée par trois')
    + interrupteur('alerte_demain', 'Clignote vite la veille d\'un jour rouge', 'dès que le compteur annonce le lendemain');
  if (m === 'perso') zone.innerHTML = '<h2>Règles</h2><p class="note">Lues dans l\'ordre : la première vraie donne la couleur.</p>'
    + `<div id="l-regles">${c.regles.map(regleLigne).join('')}</div>`
    + '<button type="button" class="bouton texte" id="l-ajouter">+ Ajouter une règle</button>'
    + '<label class="interrupteur"><input type="checkbox" id="l-autre-on"' + (c.autre !== '000000' ? ' checked' : '') + '><span></span><b>Sinon, une couleur<small>sinon la LED reste éteinte</small></b></label>'
    + `<label class="saisie" id="l-autre-champ"${c.autre === '000000' ? ' hidden' : ''}><span>Couleur par défaut</span><input type="color" data-cle="autre" value="${hex(c.autre === '000000' ? 'FFFFFF' : c.autre)}"></label>`;
  $('l-commun').hidden = ['origine', 'eteinte'].includes(m);
  $('l-bri').value = c.bri; $('l-bri-val').textContent = c.bri + ' %';
  $('l-nuit').checked = !!c.nuit; $('l-nuit-heures').hidden = !c.nuit;
  const heures = sel => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${+sel === h ? ' selected' : ''}>${h} h</option>`).join('');
  $('l-nuit-de').innerHTML = heures(c.nuit_de); $('l-nuit-a').innerHTML = heures(c.nuit_a);
  dessinerMaintenant();
}

function dessinerMaintenant() {
  const k = led.contrat || {}, ci = led.cible;
  const p = $('l-pastille');
  p.style.background = p.style.color = ci ? hex(ci[0]) : 'transparent';
  p.style.opacity = ci ? Math.max(.6, ci[1] / 100) : 1;
  p.classList.toggle('cli', ci?.[2] === 1);
  p.classList.toggle('cli-vite', ci?.[2] === 2);
  const morceaux = [];
  if (k.hour) morceaux.push(k.hour === 'Creuse' ? 'heures creuses' : 'heures pleines');
  if (k.color && k.color !== 'Inconnu') morceaux.push('jour ' + k.color.toLowerCase());
  if (k.tmrw && k.tmrw !== 'Inconnu') morceaux.push('demain ' + k.tmrw.toLowerCase());
  const etatLed = led.cfg.mode === 'origine' ? 'géré par le firmware' : ci ? 'allumée' : 'éteinte';
  $('l-maintenant').textContent = `LED ${etatLed}` + (morceaux.length ? ' · ' + morceaux.join(', ') : ' · en attente du compteur');
}

// relit l'écran pour reconstruire la configuration à enregistrer
function lireLed() {
  const c = led.cfg;
  c.mode = document.querySelector('input[name="l-mode"]:checked')?.value || c.mode;
  document.querySelectorAll('#v-led [data-cle]').forEach(e => { c[e.dataset.cle] = e.type === 'checkbox' ? e.checked : e.type === 'color' ? sansDiese(e.value) : e.value; });
  if (c.mode === 'perso') {
    c.regles = [...document.querySelectorAll('#l-regles .regle')].map(d => {
      const v = n => d.querySelector(`[data-r="${n}"]`);
      const r = { si: v('si').value, rgb: sansDiese(v('rgb').value), cli: v('cli').checked };
      if (r.si === 'puissance') r.seuil = Math.max(0, parseInt(v('seuil').value, 10) || 0);
      return r;
    });
    if (!$('l-autre-on').checked) c.autre = '000000';
  }
  c.bri = +$('l-bri').value;
  c.nuit = $('l-nuit').checked; c.nuit_de = +$('l-nuit-de').value; c.nuit_a = +$('l-nuit-a').value;
}

async function majLed() {
  $('l-etat').textContent = '';
  try {
    led = await lire('/m-led', true);
    dessinerLed();
  } catch (e) {
    $('l-maintenant').textContent = 'Pilote LED absent : réinstallez l\'interface (berry/installer.sh).';
    console.warn(e);
  }
}

$('v-led').addEventListener('change', ev => {
  if (!led) return;
  const t = ev.target;
  if (t.name === 'l-mode' || t.id === 'l-autre-on') { lireLed(); dessinerLed(); return; }
  if (t.dataset.r === 'si') t.parentNode.querySelectorAll('[data-r="seuil"], .w').forEach(x => { x.hidden = t.value !== 'puissance'; });
  if (t.id === 'l-nuit') $('l-nuit-heures').hidden = !t.checked;
});
$('l-bri').addEventListener('input', ev => { $('l-bri-val').textContent = ev.target.value + ' %'; });
$('v-led').addEventListener('click', ev => {
  if (!led) return;
  if (ev.target.id === 'l-ajouter') { lireLed(); led.cfg.regles.push({ si: 'hc', rgb: '00C853', cli: false }); dessinerLed(); }
  if (ev.target.closest('[data-suppr]')) { ev.target.closest('.regle').remove(); }
});
$('l-enregistrer').addEventListener('click', async () => {
  if (!led) return;
  lireLed();
  const e = $('l-etat');
  e.textContent = 'Enregistrement…';
  try {
    led = await lire('/m-led?cfg=' + encodeURIComponent(JSON.stringify(led.cfg)), true);
    dessinerLed();
    e.textContent = 'Enregistré sur le module.';
  } catch (err) { e.textContent = 'Échec de l\'enregistrement.'; console.warn(err); }
});

if (vue === 'led') majLed();
