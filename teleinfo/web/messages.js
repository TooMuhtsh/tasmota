/* Écran Messages TIC : étiquettes lisibles, regroupées, identifiants masqués par défaut. Données : /tic-msg.upd */
'use strict';
const ETIQUETTES = {
  // mode Standard
  ADSC: 'Adresse du compteur', VTIC: 'Version de la TIC', DATE: 'Date et heure du compteur',
  NGTF: 'Calendrier fournisseur', LTARF: 'Période tarifaire en cours', NTARF: 'Index tarifaire en cours',
  NJOURF: 'Jour du calendrier fournisseur', 'NJOURF+1': 'Jour de demain', 'PJOURF+1': 'Plages de demain (heure : index)', PPOINTE: 'Prochain jour de pointe',
  EAST: 'Index total consommé', EAIT: 'Index total injecté', PREF: 'Puissance souscrite', PCOUP: 'Puissance de coupure',
  SINSTS: 'Puissance apparente', SINSTS1: 'Puissance apparente phase 1', SINSTS2: 'Puissance apparente phase 2', SINSTS3: 'Puissance apparente phase 3',
  SMAXSN: 'Pointe du jour', 'SMAXSN-1': 'Pointe d\'hier', SMAXSN1: 'Pointe du jour phase 1', SMAXSN2: 'Pointe du jour phase 2', SMAXSN3: 'Pointe du jour phase 3',
  SINSTI: 'Puissance injectée', SMAXIN: 'Pointe injectée du jour', 'SMAXIN-1': 'Pointe injectée d\'hier',
  CCASN: 'Courbe de charge (point actuel)', 'CCASN-1': 'Courbe de charge (point précédent)', CCAIN: 'Courbe injectée (point actuel)', 'CCAIN-1': 'Courbe injectée (point précédent)',
  IRMS1: 'Courant phase 1', IRMS2: 'Courant phase 2', IRMS3: 'Courant phase 3',
  URMS1: 'Tension phase 1', URMS2: 'Tension phase 2', URMS3: 'Tension phase 3',
  UMOY1: 'Tension moyenne phase 1', UMOY2: 'Tension moyenne phase 2', UMOY3: 'Tension moyenne phase 3',
  STGE: 'Registre de statuts', MSG1: 'Message court', MSG2: 'Message ultra court', PRM: 'Point de livraison (PRM)', RELAIS: 'Relais',
  ERQ1: 'Énergie réactive Q1', ERQ2: 'Énergie réactive Q2', ERQ3: 'Énergie réactive Q3', ERQ4: 'Énergie réactive Q4',
  DPM1: 'Début pointe mobile 1', FPM1: 'Fin pointe mobile 1', DPM2: 'Début pointe mobile 2', FPM2: 'Fin pointe mobile 2', DPM3: 'Début pointe mobile 3', FPM3: 'Fin pointe mobile 3',
  // mode Historique
  ADCO: 'Adresse du compteur', OPTARIF: 'Option tarifaire', ISOUSC: 'Intensité souscrite', PTEC: 'Période tarifaire en cours',
  BASE: 'Index Base', HCHC: 'Index heures creuses', HCHP: 'Index heures pleines', EJPHN: 'Index EJP normal', EJPHPM: 'Index EJP pointe mobile',
  BBRHCJB: 'Index HC jours bleus', BBRHPJB: 'Index HP jours bleus', BBRHCJW: 'Index HC jours blancs', BBRHPJW: 'Index HP jours blancs',
  BBRHCJR: 'Index HC jours rouges', BBRHPJR: 'Index HP jours rouges', PEJP: 'Préavis EJP', DEMAIN: 'Couleur de demain',
  IINST: 'Courant', IINST1: 'Courant phase 1', IINST2: 'Courant phase 2', IINST3: 'Courant phase 3',
  IMAX: 'Courant maximal', IMAX1: 'Courant maximal phase 1', IMAX2: 'Courant maximal phase 2', IMAX3: 'Courant maximal phase 3',
  ADPS: 'Avertissement de dépassement', ADIR1: 'Dépassement phase 1', ADIR2: 'Dépassement phase 2', ADIR3: 'Dépassement phase 3',
  PAPP: 'Puissance apparente', PMAX: 'Puissance maximale triphasée', HHPHC: 'Horaire HP/HC', MOTDETAT: 'Mot d\'état', PPOT: 'Présence des potentiels',
};
const GROUPES = [
  ['Identification', /^(ADSC|ADCO|PRM|VTIC|DATE)$/],
  ['Contrat et tarif', /^(NGTF|OPTARIF|LTARF|PTEC|NTARF|NJOURF|NJOURF\+1|PJOURF\+1|PPOINTE|DEMAIN|PEJP|ISOUSC|PREF|PCOUP|HHPHC|DPM\d|FPM\d)$/],
  ['Index', /^(EAST|EASF\d\d|EASD\d\d|EAIT|ERQ\d|BASE|HCH[CP]|EJPH(N|PM)|BBRH[CP]J[BWR])$/],
  ['Puissances', /^(SINST[SI]\d?|SMAX[SI]N\d?(-1)?|CCA[SI]N(-1)?|PAPP|PMAX)$/],
  ['Tension et courant', /^(IRMS\d|URMS\d|UMOY\d|IINST\d?|IMAX\d?|ADPS|ADIR\d)$/],
  ['Divers', /./],
];
const SECRETS = /^(ADSC|ADCO|PRM)$/;
const msgEtat = { voir: false, somme: false, lignes: [], nb: 0 };

const dateTic = h => /^[HE ]\d{12}$/.test(h)
  ? `${h.slice(5, 7)}/${h.slice(3, 5)}/20${h.slice(1, 3)} ${h.slice(7, 9)}:${h.slice(9, 11)}:${h.slice(11, 13)}` : h;
const heureTic = h => /^[HE ]\d{12}$/.test(h) ? `${h.slice(7, 9)}:${h.slice(9, 11)}` : '';
const LIBELLES_EASD = { 1: 'distributeur 1 (HPH)', 2: 'distributeur 2 (HCH)', 3: 'distributeur 3 (HPB)', 4: 'distributeur 4 (HCB)' };

function libelle(cle) {
  if (ETIQUETTES[cle]) return ETIQUETTES[cle];
  let m = /^EASF(\d\d)$/.exec(cle); if (m) return 'Index fournisseur ' + +m[1];
  m = /^EASD(\d\d)$/.exec(cle); if (m) return 'Index ' + (LIBELLES_EASD[+m[1]] || 'distributeur ' + +m[1]);
  return '';
}

function valeurLisible(cle, v) {
  if (SECRETS.test(cle) && !msgEtat.voir) return '•'.repeat(Math.min(v.length, 14));
  if (/^(EAST|EASF\d\d|EASD\d\d|EAIT|BASE|HCH[CP]|EJPH(N|PM)|BBRH[CP]J[BWR])$/.test(cle)) return nf(+v / 1000, 3) + ' kWh';
  if (/^ERQ\d$/.test(cle)) return nf(+v / 1000, 3) + ' kvarh';
  if (cle === 'DATE') return dateTic(v.split(' ')[0]);
  let m = /^([HE ]\d{12}) +(\d+)$/.exec(v);
  if (m) {
    const u = /^UMOY/.test(cle) ? ' V' : ' VA';
    return `${nf(+m[2])}${u} à ${heureTic(m[1])}`;
  }
  if (/^(SINST[SI]\d?|PAPP|PMAX)$/.test(cle)) return nf(+v) + (cle === 'PMAX' ? ' W' : ' VA');
  if (/^(PREF|PCOUP)$/.test(cle)) return nf(+v) + ' kVA';
  if (/^(IRMS\d|IINST\d?|IMAX\d?|ISOUSC|ADPS|ADIR\d)$/.test(cle)) return nf(+v) + ' A';
  if (/^URMS\d$/.test(cle)) return nf(+v) + ' V';
  if (cle === 'PJOURF+1') {
    const plages = v.split(' ').filter(p => /^[0-9A-F]{8}$/.test(p))
      .map(p => `${+p.slice(0, 2)}h${p.slice(2, 4)} : ${parseInt(p.slice(4), 16) & 0xF}`);
    return plages.length ? plages.join('\n') : v;
  }
  if (/^(NTARF|NJOURF|NJOURF\+1)$/.test(cle)) return String(+v);
  return v;
}

function analyserLignes(txt) {
  const lignes = [];
  let nb = 0;
  for (const l of txt.split('\n')) {
    const f = l.split(';');
    if (f[0] === 'msg') { nb = +f[1]; continue; }
    if (f.length < 5 || !f[2]) continue;              // lignes vides de fin de tableau
    lignes[+f[0]] = { ok: f[1] === 'ok', cle: f[2], val: f[3].trim(), somme: f[4] };
  }
  return { lignes: lignes.filter(Boolean), nb };
}

function afficherMessages() {
  const zone = $('m-groupes');
  zone.textContent = '';
  const restantes = [...msgEtat.lignes];
  const erreurs = restantes.filter(l => !l.ok).length;
  $('m-resume').textContent = `${restantes.length} étiquettes · trame n° ${nf(msgEtat.nb)}`;
  const e = $('m-erreurs');
  e.hidden = !erreurs;
  e.textContent = erreurs ? `${erreurs} étiquette${erreurs > 1 ? 's' : ''} avec une somme de contrôle fausse` : '';
  for (const [titre, motif] of GROUPES) {
    const pris = restantes.filter(l => motif.test(l.cle));
    if (!pris.length) continue;
    for (const l of pris) restantes.splice(restantes.indexOf(l), 1);
    const carte = document.createElement('article');
    carte.className = 'carte';
    carte.innerHTML = `<h2>${titre}</h2>`;
    const dl = document.createElement('dl');
    dl.className = 'tic';
    for (const l of pris) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      const nom = libelle(l.cle);
      dt.innerHTML = `<span>${nom || l.cle}</span>${nom ? `<code>${l.cle}</code>` : ''}`;
      dd.textContent = valeurLisible(l.cle, l.val);
      if (/^0+$/.test(l.val) && /^EAS[FD]/.test(l.cle)) dd.classList.add('nul');
      if (!l.ok) { dt.classList.add('ko'); dd.classList.add('ko'); }
      if (msgEtat.somme) dd.insertAdjacentHTML('beforeend', ` <code class="somme">${l.somme.replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;')}</code>`);
      dl.append(dt, dd);
    }
    carte.appendChild(dl);
    zone.appendChild(carte);
  }
}

function trameTexte(masquer) {
  return msgEtat.lignes.map(l => `${l.cle}\t${masquer && SECRETS.test(l.cle) ? '0'.repeat(l.val.length) : l.val}\t${l.somme}`).join('\n');
}

let minuteurMessages;
async function majMessages() {
  clearTimeout(minuteurMessages);
  try {
    Object.assign(msgEtat, analyserLignes(await lire('/tic-msg.upd')));
    derniereLecture = Date.now();
    afficherMessages();
  } catch (e) { console.warn(e); }
  etat();
  if (vue === 'messages' && !document.hidden) minuteurMessages = setTimeout(majMessages, 5000);
}

$('m-voir').addEventListener('change', ev => { msgEtat.voir = ev.target.checked; afficherMessages(); });
$('m-somme').addEventListener('change', ev => { msgEtat.somme = ev.target.checked; afficherMessages(); });
$('m-copier').addEventListener('click', async () => {
  const b = $('m-copier'), avant = b.textContent;
  try { await navigator.clipboard.writeText(trameTexte(!msgEtat.voir)); b.textContent = 'Copiée'; }
  catch { b.textContent = 'Copie impossible'; }
  setTimeout(() => { b.textContent = avant; }, 2000);
});

if (vue === 'messages') majMessages();
