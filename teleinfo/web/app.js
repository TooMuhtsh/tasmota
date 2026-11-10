/* Interface mobile Teleinfo (prototype).
   Ne lit que des routes existantes du firmware : /cm?cmnd=Status 10, /tic-msg.upd, /info.json, /graph + /graph.upd.
   window.TIC_MODULE : adresse du module pour les liens vers ses pages (vide une fois servi par le module lui-même). */
'use strict';
const MODULE = window.TIC_MODULE || '';
const $ = id => document.getElementById(id);
const nf = (v, d = 0) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const SVGNS = 'http://www.w3.org/2000/svg';

// le serveur web du module traite une requête à la fois : on les enchaîne au lieu de les lancer ensemble
let fileRequetes = Promise.resolve();
function lire(url, json = false) {
  const p = fileRequetes.then(async () => {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(url + ' : ' + r.status);
    return json ? r.json() : r.text();
  });
  fileRequetes = p.catch(() => {});
  return p;
}
function el(nom, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, nom);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/* ---------- état et fraîcheur ---------- */
let derniereLecture = 0, horsLigne = false;
function etat() {
  const age = (Date.now() - derniereLecture) / 1000;
  // retour du module après une coupure ou un redémarrage : on relit tout l'écran affiché
  if (derniereLecture && age >= 20) horsLigne = true;
  else if (horsLigne && age < 20) { horsLigne = false; afficher(); majTic(); majModule(); }
  const e = $('etat');
  e.className = 'etat ' + (age < 20 ? 'ok' : 'ko');
  e.lastElementChild.textContent = derniereLecture
    ? (age < 20 ? 'en direct' : 'hors ligne depuis ' + Math.round(age) + ' s') : 'connexion…';
}
setInterval(() => { if (!document.hidden) etat(); }, 1000);

/* ---------- messages TIC ---------- */
function analyserTic(txt) {
  const tic = { _msg: 0 };
  for (const l of txt.split('\n')) {
    const f = l.split(';');
    if (f[0] === 'msg') tic._msg = +f[1];
    else if (f.length >= 4 && f[1] === 'ok') tic[f[2]] = f[3].trim();
  }
  return tic;
}
const horodate = h => h && h.length >= 13 ? h.slice(7, 9) + ':' + h.slice(9, 11) : '';

/* ---------- accueil ---------- */
const spark = [];            // [ms, W] des 15 dernières minutes
let souscrite = 0;           // VA

async function majMesures() {
  try {
    const sns = (await lire('/cm?cmnd=Status%2010', true)).StatusSNS;
    derniereLecture = Date.now();
    // le module renvoie tour à tour la section ENERGY et les sections METER / CONTRACT
    const s = sns.ENERGY;
    if (!s) return etat();
    $('p-w').textContent = nf(s.Power);
    $('p-detail').textContent = `${nf(s.Voltage)} V · ${nf(s.Current, 1)} A · cos φ ${nf(s.Factor, 2)}`;
    $('e-auj').textContent = nf(s.Today, 2);
    $('e-hier').textContent = nf(s.Yesterday, 2);
    if (souscrite) {
      const pct = Math.min(100, s.ApparentPower / souscrite * 100);
      $('jauge').style.width = pct + '%';
      $('p-pct').textContent = `${nf(pct)} % de ${nf(souscrite / 1000)} kVA`;
    }
    spark.push([Date.now(), s.Power]);
    while (spark.length && spark[0][0] < Date.now() - 15 * 60e3) spark.shift();
    dessinerSpark();
  } catch (e) { console.warn(e); }
  etat();
}

async function majTic() {
  try {
    const t = analyserTic(await lire('/tic-msg.upd'));
    if (!t._msg) return;
    const standard = 'SINSTS' in t;
    const periode = t.LTARF || t.PTEC || '';
    const p = $('periode');
    p.textContent = periode ? periode.charAt(0) + periode.slice(1).toLowerCase() : '—';
    p.className = 'puce' + (/PLEINE|HP/.test(periode) ? ' hp' : '');
    $('c-tarif').textContent = t.NGTF || t.OPTARIF || '—';
    const kva = t.PREF ? +t.PREF : (t.ISOUSC ? +t.ISOUSC * 0.2 : 0);
    if (kva) { souscrite = kva * 1000; $('c-pref').textContent = nf(kva) + ' kVA'; }
    if (t.SMAXSN) {
      const [h, v] = t.SMAXSN.split(' ');
      $('c-pic').textContent = `${nf(+v)} VA à ${horodate(h)}`;
    }
    const total = t.EAST || t.BASE;
    if (total) $('c-index').textContent = nf(+total / 1000, 3) + ' kWh';
    $('m-compteur').textContent = `Linky, mode ${standard ? 'standard' : 'historique'}`;
    indexTic(t);
    $('m-trames').textContent = nf(t._msg);
  } catch (e) { console.warn(e); }
}

// index par période depuis la trame : EASFxx (Standard) ou BASE / HCHC / HCHP… (Historique)
const INDEX_HISTO = { BASE: 'Base', HCHC: 'Creuses', HCHP: 'Pleines', EJPHN: 'Normales', EJPHPM: 'Pointe mobile',
  BBRHCJB: 'Creuses bleu', BBRHPJB: 'Pleines bleu', BBRHCJW: 'Creuses blanc', BBRHPJW: 'Pleines blanc', BBRHCJR: 'Creuses rouge', BBRHPJR: 'Pleines rouge' };
function indexTic(t) {
  const code = (t.NGTF || '').replace(/ /g, '').replace('/', '_');
  const noms = (typeof PERIODES_CONNUES === 'object' && PERIODES_CONNUES[code]) || [];
  const lignes = [];
  // contrat connu : seulement ses périodes (les registres d'un ancien contrat restent figés dans la trame)
  for (let k = 1; k <= (noms.length || 10); k++) {
    const v = t['EASF' + String(k).padStart(2, '0')];
    if (v && +v) lignes.push([noms[k - 1]?.[0] || 'Index ' + k, +v, +t.NTARF === k]);
  }
  for (const [cle, nom] of Object.entries(INDEX_HISTO)) if (t[cle] && +t[cle]) lignes.push([nom, +t[cle], false]);
  if (!lignes.length) return;
  $('c-periodes').hidden = false;
  $('c-index-periodes').innerHTML = lignes.map(([nom, v, cour]) =>
    `<dt${cour ? ' class="courante"' : ''}>${nom}${cour ? ' · en cours' : ''}</dt><dd>${nf(v / 1000, 3)} kWh</dd>`).join('');
}

async function majModule() {
  try {
    const i = await lire('/info.json', true);
    $('m-wifi').textContent = (i['Wifi Quality'] || '—') + ' %';
    const m = /^(\d+)T(\d+):(\d+)/.exec(i.Uptime || '');
    $('m-uptime').textContent = m ? `${+m[1] ? m[1] + ' j ' : ''}${+m[2]} h ${m[3]}` : (i.Uptime || '—');
  } catch (e) { console.warn(e); }
}

function dessinerSpark() {
  const svg = $('spark');
  svg.textContent = '';
  if (spark.length < 2) return;
  const t0 = Date.now() - 15 * 60e3, max = Math.max(...spark.map(p => p[1]), 100) * 1.1;
  const pts = spark.map(([t, v]) => [(t - t0) / (15 * 60e3) * 300, 56 - v / max * 52]);
  const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  el('path', { class: 'aire', d: `${d} L${pts.at(-1)[0]} 56 L${pts[0][0]} 56 Z` }, svg);
  el('path', { class: 'trait', d }, svg);
}

/* ---------- courbes ---------- */
const PERIODES = { 0: 15 * 60e3, 1: 24 * 3600e3, 2: 7 * 24 * 3600e3 };
const DONNEES = {
  0: { titre: 'Puissance apparente', unite: 'VA', d: 0 },
  2: { titre: 'Puissance active', unite: 'W', d: 0 },
  3: { titre: 'Tension (minimum)', unite: 'V', d: 0 },
  5: { titre: 'Facteur de puissance', unite: '', d: 2, echelle: 0.01 },
};
const choix = { periode: 1, donnee: 2 };
let serie = [];
const nombreEchelle = s => { const m = /([\d.]+)\s*(k?)/.exec(s || ''); return m ? +m[1] * (m[2] ? 1000 : 1) : NaN; };

// /graph règle un état partagé du module (période, donnée) lu ensuite par /graph.upd : les deux requêtes d'un
// chargement ne doivent pas être entrecoupées par celles d'un autre (mini-courbe de l'accueil)
let fileCourbe = Promise.resolve();
function chargerCourbe(c = { ...choix }) {
  const p = fileCourbe.then(() => chargerCourbeSeul(c));
  fileCourbe = p.catch(() => {});
  return p;
}
async function chargerCourbeSeul(choix) {
  // /graph fixe la période et la donnée côté module, /graph.upd renvoie la courbe en coordonnées SVG (600 px de haut)
  const page = await lire(`/graph?period=${choix.periode}&data=${choix.donnee}`);
  const libelles = [...page.matchAll(/<text class='power' x='2%' y='(\d+)%'>([^<]*)<\/text>/g)];
  const haut = nombreEchelle(libelles.find(l => l[1] === '2')?.[2]);
  const bas = nombreEchelle(libelles.find(l => l[1] === '98')?.[2]) || 0;
  const upd = await lire('/graph.upd');
  derniereLecture = Date.now();
  const ligne = upd.split('\n').find(l => l.startsWith('m0;'));
  if (!ligne || !isFinite(haut)) return [];
  const brut = ligne.split(';')[2] || '';
  let pts = [...brut.matchAll(/(-?\d+)[ ,](-?\d+)/g)].map(m => [+m[1], +m[2]]);
  if (pts.length > 1 && pts[0][0] === pts[1][0]) pts.shift();          // départ de l'aire
  if (pts.length > 1 && pts.at(-1)[0] === pts.at(-2)[0]) pts.pop();    // fermeture de l'aire
  const fin = Date.now(), duree = PERIODES[choix.periode], ech = DONNEES[choix.donnee].echelle || 1;
  return pts.map(([x, y]) => [fin - duree + (x - 60) / 1200 * duree, (bas + (600 - y) / 600 * (haut - bas)) * ech]);
}

function graduations(min, max, n = 4) {
  const brut = (max - min) / n || 1, p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= brut);
  const debut = Math.floor(min / pas) * pas, fin = Math.ceil(max / pas) * pas;
  const t = [];
  for (let v = debut; v <= fin + pas / 2; v += pas) t.push(+v.toFixed(6));
  return t;
}
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
function etiquetteTemps(t, periode) {
  const d = new Date(t);
  if (periode === 2) return JOURS[d.getDay()];
  return d.getHours() + 'h' + (periode === 0 ? String(d.getMinutes()).padStart(2, '0') : '');
}

function quandLisible(t) {
  const d = new Date(t);
  return 'à ' + (choix.periode === 2 ? JOURS[d.getDay()] + ' ' : '') + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const G = { l: 44, r: 8, t: 8, b: 24, w: 360, h: 240 };
function dessinerCourbe() {
  const svg = $('graphe'), info = DONNEES[choix.donnee];
  svg.textContent = '';
  $('g-titre').textContent = info.titre;
  if (serie.length < 2) {
    el('text', { x: 180, y: 120, 'text-anchor': 'middle', class: 'vide' }, svg).textContent = 'Pas encore de données';
    $('g-resume').textContent = ''; $('g-pointe').textContent = '…';
    return;
  }
  const vals = serie.map(p => p[1]);
  let vmin = Math.min(...vals), vmax = Math.max(...vals);
  if (info.unite !== 'V' && info.echelle == null) vmin = 0;
  if (vmax === vmin) vmax = vmin + 1;
  const ticks = graduations(vmin, vmax), y0 = ticks[0], y1 = ticks.at(-1);
  const t0 = Date.now() - PERIODES[choix.periode], t1 = Date.now();
  const X = t => G.l + (t - t0) / (t1 - t0) * (G.w - G.l - G.r);
  const Y = v => G.h - G.b - (v - y0) / (y1 - y0) * (G.h - G.t - G.b);

  for (const v of ticks) {
    el('line', { class: 'grille', x1: G.l, x2: G.w - G.r, y1: Y(v), y2: Y(v) }, svg);
    const txt = info.unite === 'W' || info.unite === 'VA'
      ? (v >= 1000 ? nf(v / 1000, v % 1000 ? 1 : 0) + ' k' : nf(v)) : nf(v, info.d);
    el('text', { x: G.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = txt;
  }
  // graduations du temps : 5 min, 6 h ou minuit
  const pasT = { 0: 5 * 60e3, 1: 6 * 3600e3, 2: 24 * 3600e3 }[choix.periode];
  const decal = new Date().getTimezoneOffset() * 60e3;
  for (let t = Math.ceil((t0 - decal) / pasT) * pasT + decal; t < t1 - (t1 - t0) * .04; t += pasT) {
    el('line', { class: 'grille', x1: X(t), x2: X(t), y1: G.t, y2: G.h - G.b, 'stroke-dasharray': '2 4' }, svg);
    el('text', { x: X(t), y: G.h - 6, 'text-anchor': 'middle' }, svg).textContent = etiquetteTemps(t, choix.periode);
  }
  const d = 'M' + serie.map(([t, v]) => X(t).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' L');
  if (info.unite === 'W' || info.unite === 'VA')
    el('path', { class: 'aire', d: `${d} L${X(serie.at(-1)[0]).toFixed(1)} ${Y(y0)} L${X(serie[0][0]).toFixed(1)} ${Y(y0)} Z` }, svg);
  el('path', { class: 'trait', d }, svg);
  const curseur = el('line', { class: 'curseur', y1: G.t, y2: G.h - G.b, visibility: 'hidden' }, svg);
  const point = el('circle', { class: 'point', r: 4, visibility: 'hidden' }, svg);

  // résumé
  const iMax = vals.indexOf(Math.max(...vals)), moy = vals.reduce((a, b) => a + b, 0) / vals.length;
  const u = info.unite ? ' ' + info.unite : '';
  $('g-resume').innerHTML = `<div><span>Minimum</span><b>${nf(Math.min(...vals), info.d)}${u}</b></div>`
    + `<div><span>Moyenne</span><b>${nf(moy, info.d)}${u}</b></div>`
    + `<div><span>Maximum</span><b>${nf(vals[iMax], info.d)}${u}</b></div>`;
  $('g-pointe').textContent = 'max ' + quandLisible(serie[iMax][0]);

  // lecture au doigt
  const bulle = $('bulle');
  const lireAu = ev => {
    const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * G.w;
    let best = serie[0];
    for (const p of serie) if (Math.abs(X(p[0]) - x) < Math.abs(X(best[0]) - x)) best = p;
    const px = X(best[0]), py = Y(best[1]);
    curseur.setAttribute('x1', px); curseur.setAttribute('x2', px); curseur.setAttribute('visibility', 'visible');
    point.setAttribute('cx', px); point.setAttribute('cy', py); point.setAttribute('visibility', 'visible');
    bulle.textContent = `${nf(best[1], info.d)}${u} · ${quandLisible(best[0]).slice(2)}`;
    bulle.style.left = (r.left + px / G.w * r.width) + 'px';
    bulle.style.top = (r.top + py / G.h * r.height) + 'px';
    bulle.hidden = false;
  };
  svg.onpointerdown = svg.onpointermove = lireAu;
  svg.onpointerleave = svg.onpointerup = () => {
    bulle.hidden = true; curseur.setAttribute('visibility', 'hidden'); point.setAttribute('visibility', 'hidden');
  };
}

let minuteurCourbe;
async function majCourbe() {
  clearTimeout(minuteurCourbe);
  try { serie = await chargerCourbe(); dessinerCourbe(); } catch (e) { console.warn(e); }
  etat();
  if (vue === 'courbes' && !document.hidden) minuteurCourbe = setTimeout(majCourbe, choix.periode === 0 ? 5000 : 60000);
}
for (const [id, cle] of [['s-periode', 'periode'], ['s-donnee', 'donnee']])
  $(id).addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('actif', x === b));
    choix[cle] = +b.dataset.v;
    serie = []; dessinerCourbe(); majCourbe();
  });

/* ---------- navigation ---------- */
let vue = '', pageReglage = '';
document.querySelectorAll('[data-module]').forEach(a => { a.href = MODULE + a.dataset.module; });
function afficher() {
  const [v, arg] = (location.hash || '#accueil').slice(1).split('=');
  vue = ['accueil', 'courbes', 'historique', 'messages', 'reglages', 'reglage'].includes(v) ? v : 'accueil';
  pageReglage = arg || '';
  document.querySelectorAll('.vue').forEach(s => { s.hidden = s.id !== 'v-' + vue; });
  document.querySelectorAll('.onglets a').forEach(a => a.classList.toggle('actif', a.dataset.vue === (['messages', 'reglage'].includes(vue) ? 'reglages' : vue)));
  $('titre').textContent = { accueil: 'Teleinfo', courbes: 'Courbes', historique: 'Historique', messages: 'Messages', reglages: 'Réglages', reglage: 'Réglages' }[vue];
  if (vue === 'courbes') majCourbe();
  if (vue === 'messages' && typeof majMessages === 'function') majMessages();
  if (vue === 'historique' && typeof majHisto === 'function') majHisto();
  if (vue === 'reglage' && typeof majReglage === 'function') majReglage(pageReglage);
  if (vue === 'reglages' && typeof majHa === 'function') majHa();
}
addEventListener('hashchange', afficher);

/* ---------- démarrage ---------- */
afficher();
majMesures(); majTic(); majModule();
// interrogations du module : seulement pour l'écran affiché, et jamais quand l'application est en arrière-plan
const actif = v => !document.hidden && vue === v;
setInterval(() => { if (actif('accueil')) majMesures(); }, 5000);
setInterval(() => { if (actif('accueil')) majTic(); }, 15000);
setInterval(() => { if (actif('accueil')) majModule(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { afficher(); if (vue === 'accueil') { majMesures(); majTic(); } } });
// amorce la mini-courbe avec le « direct » du module (15 min)
(async () => {
  try {
    const pts = await chargerCourbe({ periode: 0, donnee: 2 });
    if (pts.length > 1 && spark.length < 3) { spark.unshift(...pts.filter(p => p[0] < (spark[0]?.[0] ?? Infinity))); dessinerSpark(); }
  } catch (e) { console.warn(e); }
})();
