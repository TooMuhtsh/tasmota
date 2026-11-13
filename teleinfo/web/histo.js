/* Écran Historique : consommation par heure, jour ou mois, empilée par période tarifaire.
   Données : fichiers CSV du module (teleinfo-<contrat>-<année>.csv, index cumulés heure par heure), lus par /ufsd?download=.
   « Tous les contrats » additionne les fichiers de l'année, ce qui garde l'historique après un changement de contrat. */
'use strict';
// noms des périodes des contrats courants (code du fichier = code du contrat sans espaces)
const PERIODES_CONNUES = {
  'HPLEINE-CREUSE': [['Creuses', 'hc'], ['Pleines', 'hp']],
  'HPLEINE_CREUSE': [['Creuses', 'hc'], ['Pleines', 'hp']],
  HSCETEHIVER: [['Super creuses été', 'hc'], ['Creuses été', 'hc'], ['Pleines été', 'hp'],
    ['Super creuses hiver', 'hc'], ['Creuses hiver', 'hc'], ['Pleines hiver', 'hp']],
  BASE: [['Toutes heures', 'hp']], TH__: [['Toutes heures', 'hp']], HC__: [['Creuses', 'hc'], ['Pleines', 'hp']],
  TEMPO: [['Creuses bleu', 'hc'], ['Pleines bleu', 'hp'], ['Creuses blanc', 'hc'], ['Pleines blanc', 'hp'], ['Creuses rouge', 'hc'], ['Pleines rouge', 'hp']],
  BBR: [['Creuses bleu', 'hc'], ['Pleines bleu', 'hp'], ['Creuses blanc', 'hc'], ['Pleines blanc', 'hp'], ['Creuses rouge', 'hc'], ['Pleines rouge', 'hp']],
};
const NOMS_CONTRATS = { 'HPLEINE-CREUSE': 'Tarif Bleu HP/HC', 'HPLEINE_CREUSE': 'HC/HP', HSCETEHIVER: 'Zen Estival', BASE: 'Base',
  TEMPO: 'Tempo', BBR: 'Tempo', HC__: 'HC/HP', TH__: 'Base', '': 'Fichier d\'origine' };
const COULEURS_CONTRATS = ['#03a9f4', '#ff9800', '#4caf50', '#9c27b0'];
const nomContrat = c => NOMS_CONTRATS[c] ?? c;
const COULEURS = { hc: ['#03a9f4', '#0277bd', '#4fc3f7'], hp: ['#ff9800', '#e65100', '#ffb74d'] };
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const histo = { fichiers: [], cache: {}, choix: 'tous', echelle: 'jour', ref: new Date() };

async function listerFichiers() {
  const page = await lire('/ufsd?');
  const noms = [...new Set([...page.matchAll(/download=\/(teleinfo-[^'"]*?\.csv)/g)].map(m => m[1]))];
  return noms.map(n => {
    const m = /^teleinfo-(?:(.+)-)?(\d{4})\.csv$/.exec(n);
    return m ? { nom: n, contrat: m[1] || '', an: +m[2] } : null;
  }).filter(Boolean);
}

// lignes horaires : { t: Date (début de l'heure), v: [index par période] }
async function chargerFichier(f) {
  if (histo.cache[f.nom] && Date.now() - histo.cache[f.nom].lu < 5 * 60e3) return histo.cache[f.nom].lignes;
  const txt = await lire('/ufsd?download=/' + f.nom);
  const lignes = [];
  for (const l of txt.split('\n')) {
    const c = l.trim().split(';');
    if (!/^\d{12}$/.test(c[0]) || c[0] === '000000000000' || c.length < 5) continue;
    const mois = +c[0].slice(6, 8), jour = +c[0].slice(8, 10), heure = +c[0].slice(10, 12);
    lignes.push({ t: new Date(f.an, mois - 1, jour, heure), v: c.slice(2, c.length - 2).map(Number) });
  }
  histo.cache[f.nom] = { lu: Date.now(), lignes };
  return lignes;
}

// consommation de chaque heure. Le module écrit une ligne au changement d'heure, datée de l'heure
// qui vient de finir (xdrv_98_03_teleinfo_histo.ino) : la ligne de HH h contient l'index à HH+1 h.
// La consommation de l'heure HH est donc ligne(HH) − ligne(HH−1), rangée à l'heure de la ligne la plus récente.
function heures(lignes, direct) {
  const r = [];
  for (let i = 0; i + 1 < lignes.length; i++) {
    const a = lignes[i], b = lignes[i + 1];
    if (b.t - a.t > 3 * 3600e3 || b.t <= a.t) continue;          // trou ou désordre : on n'invente rien
    r.push({ t: b.t, v: b.v.map((x, k) => Math.max(0, x - (a.v[k] ?? x))) });
  }
  // heure en cours : index en direct moins la dernière ligne (index de début de l'heure en cours)
  const der = lignes[lignes.length - 1];
  if (direct && der && Date.now() - der.t < 2 * 3600e3)
    r.push({ t: new Date(+der.t + 3600e3), v: der.v.map((x, k) => direct[k] > x ? direct[k] - x : 0) });
  return r;
}

// index en direct du contrat en cours (mode Standard : EASF01…), pour compléter l'heure en cours
async function indexDirect() {
  try {
    const t = analyserTic(await lire('/tic-msg.upd'));
    if (!t.NGTF || !t.EASF01) return null;
    const v = [];
    for (let k = 1; k <= 10 && t['EASF' + String(k).padStart(2, '0')]; k++) v.push(+t['EASF' + String(k).padStart(2, '0')]);
    return { contrat: t.NGTF.replace(/ /g, ''), v };
  } catch (e) { return null; }
}

function bornes() {
  const d = histo.ref, e = histo.echelle;
  if (e === 'jour') { const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return [a, new Date(+a + 864e5), 24]; }
  if (e === 'semaine') {
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);
    return [a, new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7), 7];
  }
  if (e === 'mois') { const a = new Date(d.getFullYear(), d.getMonth(), 1); const b = new Date(d.getFullYear(), d.getMonth() + 1, 1); return [a, b, Math.round((b - a) / 864e5)]; }
  return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear() + 1, 0, 1), 12];
}
function case_(t, debut) {
  const e = histo.echelle;
  if (e === 'jour') return t.getHours();
  if (e === 'annee') return t.getMonth();
  return Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - debut) / 864e5);
}
function etiquette(i, debut) {
  const e = histo.echelle;
  if (e === 'jour') return i % 6 ? '' : i + 'h';
  if (e === 'semaine') return JOURS[(i + 1) % 7];
  if (e === 'mois') return (i + 1) % 5 && i ? '' : String(i + 1);
  return MOIS[i].slice(0, 1).toUpperCase();
}
function titrePeriode(debut, fin) {
  const e = histo.echelle, o = { day: 'numeric', month: 'long' };
  if (e === 'jour') return debut.toLocaleDateString('fr-FR', { weekday: 'long', ...o });
  if (e === 'semaine') return `du ${debut.toLocaleDateString('fr-FR', o)} au ${new Date(+fin - 864e5).toLocaleDateString('fr-FR', o)}`;
  if (e === 'mois') return debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return String(debut.getFullYear());
}

async function majHisto() {
  try {
    if (!histo.fichiers.length) {
      histo.fichiers = await listerFichiers();
      const sel = $('h-contrat');
      const contrats = [...new Set(histo.fichiers.map(f => f.contrat))];
      sel.innerHTML = '<option value="tous">Tous les contrats</option>'
        + contrats.map(c => `<option value="${c}">${nomContrat(c)}</option>`).join('');
      sel.value = histo.choix;
    }
    derniereLecture = Date.now();
    await dessinerHisto();
  } catch (e) { console.warn(e); $('h-vide').hidden = false; $('h-vide').textContent = 'Historique illisible : ' + e.message; }
  etat();
}

async function dessinerHisto(contratSeul) {
  const [debut, fin, n] = bornes();
  $('h-titre').textContent = titrePeriode(debut, fin);
  $('h-suivant').disabled = +fin > Date.now();
  const choix = contratSeul ?? histo.choix, tous = choix === 'tous';
  const fichiers = histo.fichiers.filter(f => (tous || f.contrat === choix) && f.an >= debut.getFullYear() && f.an <= new Date(fin - 1).getFullYear());
  const series = [];                      // séries empilées : { nom, type, v: [n] }
  const parContrat = {}, contrats = [...new Set(fichiers.map(f => f.contrat))];
  const enCours = +fin > Date.now() ? await indexDirect() : null;
  for (const f of fichiers) {
    const direct = enCours && enCours.contrat === f.contrat && f.an === new Date().getFullYear() ? enCours.v : null;
    for (const h of heures(await chargerFichier(f), direct)) {
      if (h.t < debut || h.t >= fin) continue;
      const i = case_(h.t, debut);
      if (tous) {
        const k = contrats.indexOf(f.contrat);
        series[k] ??= { nom: nomContrat(f.contrat), couleur: COULEURS_CONTRATS[k % 4], v: Array(n).fill(0) };
        series[k].v[i] += h.v.reduce((a, b) => a + b, 0);
        parContrat[f.contrat] = (parContrat[f.contrat] || 0) + h.v.reduce((a, b) => a + b, 0);
      } else {
        h.v.forEach((x, k) => {
          const [nom, type] = (PERIODES_CONNUES[f.contrat] || [])[k] || ['Période ' + (k + 1), 'hp'];
          series[k] ??= { nom, type, v: Array(n).fill(0) };
          series[k].v[i] += x;
        });
      }
    }
  }
  // « tous » sur une période couverte par un seul contrat : on montre ses périodes tarifaires
  const presents = Object.keys(parContrat).filter(c => parContrat[c]);
  if (tous && presents.length === 1) return dessinerHisto(presents[0]);
  const actives = series.filter(s => s && s.v.some(Boolean));
  const rang = { hc: 0, hp: 0 };
  for (const s of actives) s.couleur ??= COULEURS[s.type][rang[s.type]++ % 3];
  const totaux = Array(n).fill(0).map((_, i) => actives.reduce((a, s) => a + s.v[i], 0));
  const total = totaux.reduce((a, b) => a + b, 0);
  $('h-vide').hidden = total > 0;
  $('h-vide').textContent = 'Pas de données pour cette période.';
  $('h-total').textContent = nf(total / 1000, total < 10000 ? 2 : 1);

  // barres
  const svg = $('h-graphe'); svg.textContent = '';
  const G = { l: 36, r: 6, t: 8, b: 22, w: 360, h: 220 };
  const max = Math.max(...totaux, 1), ticks = graduations(0, max / 1000, 3).map(v => v * 1000), haut = ticks.at(-1);
  const Y = v => G.h - G.b - v / haut * (G.h - G.t - G.b), larg = (G.w - G.l - G.r) / n;
  for (const v of ticks) {
    el('line', { class: 'grille', x1: G.l, x2: G.w - G.r, y1: Y(v), y2: Y(v) }, svg);
    el('text', { x: G.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = nf(v / 1000, v % 1000 ? 1 : 0);
  }
  for (let i = 0; i < n; i++) {
    let y = 0;
    const x = G.l + i * larg + larg * .15, w = Math.max(1, larg * .7);
    for (const s of actives) {
      if (!s.v[i]) continue;
      el('rect', { x, y: Y(y + s.v[i]), width: w, height: Y(y) - Y(y + s.v[i]), fill: s.couleur, rx: Math.min(2, w / 4) }, svg);
      y += s.v[i];
    }
    const lab = etiquette(i, debut);
    if (lab) el('text', { x: x + w / 2, y: G.h - 6, 'text-anchor': 'middle' }, svg).textContent = lab;
    el('rect', { x: G.l + i * larg, y: G.t, width: larg, height: G.h - G.t - G.b, fill: 'transparent', 'data-i': i }, svg);
  }
  // lecture au doigt
  const bulle = $('bulle');
  svg.onpointerdown = svg.onpointermove = ev => {
    const i = +ev.target.dataset?.i;
    if (!(i >= 0) || !totaux[i]) { bulle.hidden = true; return; }
    const quand = histo.echelle === 'jour' ? `${i}h-${i + 1}h` : histo.echelle === 'annee' ? MOIS[i]
      : new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    bulle.textContent = `${quand} · ${nf(totaux[i] / 1000, 2)} kWh`;
    const r = svg.getBoundingClientRect();
    bulle.style.left = (r.left + (G.l + (i + .5) * larg) / G.w * r.width) + 'px';
    bulle.style.top = (r.top + Y(totaux[i]) / G.h * r.height) + 'px';
    bulle.hidden = false;
  };
  svg.onpointerleave = svg.onpointerup = () => { bulle.hidden = true; };

  // répartition
  const rep = $('h-repartition');
  const lignes = tous
    ? actives.map(s => [s.nom, s.v.reduce((a, b) => a + b, 0), s.couleur])
    : actives.map(s => [s.nom, s.v.reduce((a, b) => a + b, 0), s.couleur]);
  rep.innerHTML = lignes.map(([nom, v, c]) =>
    `<dt><i style="background:${c}"></i>${nom}</dt><dd>${nf(v / 1000, 2)} kWh <small>${nf(total ? v / total * 100 : 0)} %</small></dd>`).join('');
  $('h-rep-titre').textContent = tous ? 'Par contrat' : 'Par période · ' + nomContrat(choix);
}

$('h-echelle').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  $('h-echelle').querySelectorAll('button').forEach(x => x.classList.toggle('actif', x === b));
  histo.echelle = b.dataset.v; dessinerHisto();
});
$('h-contrat').addEventListener('change', ev => { histo.choix = ev.target.value; dessinerHisto(); });
for (const [id, sens] of [['h-precedent', -1], ['h-suivant', 1]])
  $(id).addEventListener('click', () => {
    const d = histo.ref, e = histo.echelle;
    histo.ref = e === 'jour' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + sens)
      : e === 'semaine' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * sens)
      : e === 'mois' ? new Date(d.getFullYear(), d.getMonth() + sens, 1) : new Date(d.getFullYear() + sens, 0, 1);
    dessinerHisto();
  });

if (vue === 'historique') majHisto();
