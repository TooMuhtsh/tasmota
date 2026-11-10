/* Carte « Home Assistant » des réglages : état de la liaison MQTT, découverte, republication et lien vers HA.
   Lectures : Status 6 (MQTT), Status (topic), page /tic-cfg (découverte activée ou non). Action : commande hass_publish. */
'use strict';
const CLE_HA = 'teleinfo-adresse-ha';
const lireLocal = () => { try { return localStorage.getItem(CLE_HA) || ''; } catch { return ''; } };

async function majHa() {
  try {
    const mqtt = (await lire('/cm?cmnd=Status%206', true)).StatusMQT;
    const st = (await lire('/cm?cmnd=Status', true)).Status;
    const cfg = new DOMParser().parseFromString(await lire('/tic-cfg'), 'text/html');
    derniereLecture = Date.now();
    const decouverte = cfg.querySelector('input[name=hass]')?.checked;
    $('ha-mqtt').textContent = mqtt ? `${mqtt.MqttHost}:${mqtt.MqttPort}` : '—';
    $('ha-topic').textContent = st?.Topic || '—';
    $('ha-decouverte').textContent = decouverte ? 'activée' : 'désactivée';
    $('ha-decouverte').className = decouverte ? '' : 'ko';
    $('ha-conseil').hidden = !!decouverte;
  } catch (e) { console.warn(e); }
  const url = lireLocal();
  $('ha-adresse').value = url;
  $('ha-ouvrir').hidden = !url;
  if (url) $('ha-ouvrir').href = url.replace(/\/$/, '') + '/config/devices/dashboard?historyBack=1&search=teleinfo';
}

$('ha-adresse').addEventListener('change', ev => {
  const v = ev.target.value.trim();
  try { v ? localStorage.setItem(CLE_HA, v) : localStorage.removeItem(CLE_HA); } catch { /* stockage indisponible */ }
  majHa();
});
$('ha-republier').addEventListener('click', async () => {
  const e = $('ha-etat');
  try {
    const r = await fetch('/cm?cmnd=hass_publish', { cache: 'no-store' });
    e.textContent = r.status === 403 ? 'Désactivé dans le prototype (lecture seule).' : r.ok ? 'Découverte republiée : les entités se mettent à jour dans Home Assistant.' : 'Échec : ' + r.status;
  } catch (err) { e.textContent = 'Échec : ' + err.message; }
});

if (vue === 'reglages') majHa();
