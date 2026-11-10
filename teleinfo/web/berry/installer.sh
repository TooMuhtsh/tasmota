#!/bin/bash
# Copie l'interface mobile sur un module Teleinfo (système de fichiers) et charge le pilote Berry.
# usage : installer.sh <IP du module> [--permanent]
#   sans --permanent : chargé jusqu'au prochain redémarrage du module ; avec : ajouté à autoexec.be
#   (réversible : supprimer mobile.be, mobile-* et la ligne de autoexec.be)
set -e
IP=$1; WEB=$(cd "$(dirname "$0")/.." && pwd); T=$(mktemp -d)
[ -n "$IP" ] || { echo "usage : $0 <IP du module>"; exit 1; }
cmd() { curl -sf -H "Referer: http://$IP/" --get --data-urlencode "cmnd=$1" "http://$IP/cm"; echo; }
envoyer() { curl -sf -o /dev/null -H "Referer: http://$IP/" -F "ufsu=@$1;filename=$(basename "$1")" "http://$IP/ufsu?fsz=$(stat -c %s "$1")"; echo "envoyé : $(basename "$1")"; }
# noms à plat avec le préfixe mobile- (le pilote sert chaque fichier à la racine)
sed -e 's#href="app.css"#href="/mobile-app.css"#' -e 's#src="\([a-z]*\)\.js"#src="/mobile-\1.js"#g' -e '/proto-config.js/d' "$WEB/index.html" > "$T/mobile-index.html"
for f in app.css app.js messages.js histo.js reglages.js ha.js; do cp "$WEB/$f" "$T/mobile-$f"; done
cp "$WEB/berry/mobile.be" "$T/mobile.be"
for f in "$T"/*; do envoyer "$f"; done
# autoexec.be : ajoute le chargement s'il n'y est pas déjà (seulement avec --permanent)
[ "$2" = "--permanent" ] && {
curl -sf -H "Referer: http://$IP/" "http://$IP/ufsd?download=/autoexec.be" > "$T/autoexec.be" || : > "$T/autoexec.be"
grep -q "load('mobile.be')" "$T/autoexec.be" || { echo "load('mobile.be')" >> "$T/autoexec.be"; envoyer "$T/autoexec.be"; }
}
cmd "Br load('mobile.be')"
# au premier chargement le serveur web tourne déjà : on déclare les adresses tout de suite
cmd "Br teleinfo_mobile.web_add_handler()"
rm -rf "$T"
echo "Interface disponible sur http://$IP/m"
