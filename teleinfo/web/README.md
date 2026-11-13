# Interface mobile Teleinfo (prototype)

Nouvelle interface web pensée pour le téléphone, **à côté** de l'interface actuelle : les pages existantes ne sont pas modifiées.

| Accueil | Courbes 24 h | Historique |
|---|---|---|
| ![](captures/prototype/accueil-sombre.png) | ![](captures/prototype/courbes-24h.png) | ![](captures/prototype/historique-jour.png) |

| Historique, tous contrats | Messages TIC | Réglage du compteur |
|---|---|---|
| ![](captures/prototype/historique-annee.png) | ![](captures/prototype/messages.png) | ![](captures/prototype/reglage-compteur.png) |

## Principe

- HTML, CSS et JavaScript sans dépendance ni étape de compilation (`index.html`, `app.css`, `app.js`).
- Ne lit que des routes déjà présentes dans le firmware : `/cm?cmnd=Status 10`, `/tic-msg.upd`, `/info.json`, `/graph` + `/graph.upd`, les CSV d'historique (`/ufsd?download=`) et les pages de réglage Teleinfo.
- Les réglages Teleinfo (`/tic-cfg`, `/relay`, `/solar-cfg`, `/awtrix`, `/option`) sont relus depuis les pages d'origine et enregistrés avec les mêmes paramètres : aucun code C++ à modifier.
- L'historique peut afficher tous les contrats de l'année ensemble, ce qui garde la consommation visible après un changement de contrat.
- Material Design 3, thème clair ou sombre selon le téléphone.
- Règles d'app embarquée : aucune ressource externe (ni police, ni bibliothèque, ni CDN), environ 64 Ko au total, une requête à la fois vers le module, interrogation limitée à l'écran affiché et suspendue quand l'application passe en arrière-plan, cibles tactiles de 48 px, animations coupées si le téléphone le demande.
- Les réglages et les écrans Tasmota restent ceux du firmware, regroupés dans un onglet « Réglages ».

## Essayer sans toucher au module

```
python3 teleinfo/web/proto/serveur.py --module <IP du module>
```

puis ouvrir `http://<IP de la machine>:8099/` sur le téléphone. Le serveur relaie seulement des lectures (seules les commandes `Status` passent par `/cm`, et l'enregistrement des réglages est refusé).

## Installer sur le module, sans recompiler

Le module sert lui-même l'interface grâce à un petit pilote Berry (`berry/mobile.be`) : les fichiers sont copiés dans son système de fichiers et servis sur `/m`. Un bouton « Interface mobile » apparaît sur l'accueil, la page Configuration et les Outils d'origine.

```
teleinfo/web/berry/installer.sh <IP du module>              # jusqu'au prochain redémarrage
teleinfo/web/berry/installer.sh <IP du module> --permanent  # chargé à chaque démarrage (autoexec.be)
```

Pour retirer : supprimer `mobile.be`, les fichiers `mobile-*` et la ligne `load('mobile.be')` de `autoexec.be` depuis le gestionnaire de fichiers.

## Chrome sur Android : ERR_TOO_MANY_RETRIES

Les versions récentes d'Android demandent à chaque application l'autorisation de joindre les appareils du réseau local. Si Chrome ne l'a pas, la page du module ne s'ouvre pas et Chrome affiche `ERR_TOO_MANY_RETRIES`, alors que Firefox fonctionne. La page ne peut rien y faire, car la requête ne quitte pas le téléphone.

Pour corriger : appui long sur Chrome, Infos sur l'appli, Autorisations, puis autoriser « Réseau local » (ou « Appareils à proximité » selon la version). Fermer Chrome complètement et rouvrir l'adresse du module.

## Suite

L'avancement est suivi dans les issues du dépôt (étiquette `interface-mobile`).
