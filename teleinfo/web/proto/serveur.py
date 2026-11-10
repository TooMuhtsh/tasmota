#!/usr/bin/env python3
"""Serveur de développement de l'interface mobile Teleinfo.

Sert les fichiers de teleinfo/web/ et relaie vers un module Teleinfo réel
les seules routes de LECTURE dont l'interface a besoin. Aucun réglage du
module ne peut être modifié par ce serveur.

    python3 serveur.py --module 192.168.x.y [--port 8099]
"""
import argparse
import http.server
import pathlib
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

WEB = pathlib.Path(__file__).resolve().parent.parent

# routes relayées telles quelles (lecture seule)
RELAIS = {"/graph.upd", "/tic-msg.upd", "/info.json"}
# /graph ne sert qu'à choisir période et donnée avant /graph.upd
GRAPH_ARGS = re.compile(r"^(period=[0-2])?&?(data=[0-5])?$")
# pages de réglage Teleinfo : lues pour être réaffichées, jamais enregistrées (une requête avec paramètres = écriture)
PAGES_REGLAGE = {"/tic-cfg", "/relay", "/solar-cfg", "/awtrix", "/option"}
# liste des fichiers et lecture des CSV d'historique
FICHIER_CSV = re.compile(r"^download=/teleinfo-[A-Za-z0-9_+-]*\d{4}\.csv$")
# seules les commandes Status sont autorisées sur /cm
COMMANDE_LECTURE = re.compile(r"^Status( (0|1|2|5|8|10|11))?$", re.I)
# le serveur web du module traite une requête à la fois : on les envoie l'une après l'autre
VERROU_MODULE = threading.Lock()


class Gestion(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(WEB), **k)

    def log_message(self, fmt, *args):
        if self.server.verbeux:
            super().log_message(fmt, *args)

    def relayer(self, chemin):
        url = f"http://{self.server.module}{chemin}"
        req = urllib.request.Request(url, headers={"Referer": f"http://{self.server.module}/"})
        for essai in range(3):
            try:
                with VERROU_MODULE, urllib.request.urlopen(req, timeout=10) as r:
                    corps, type_ = r.read(), r.headers.get("Content-Type", "text/plain")
                    code = r.status
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                corps, type_, code = str(e).encode(), "text/plain", 502
                if self.server.verbeux:
                    self.log_message("module : %s (essai %d)", e, essai + 1)
                time.sleep(0.5)
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/proto-config.js":
            corps = f"window.TIC_MODULE='http://{self.server.module}';".encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.end_headers()
            self.wfile.write(corps)
        elif url.path in RELAIS:
            self.relayer(url.path)
        elif url.path == "/graph" and GRAPH_ARGS.match(url.query):
            self.relayer(f"/graph?{url.query}")
        elif url.path in PAGES_REGLAGE:
            if url.query:
                self.send_error(403, "enregistrement désactivé dans le serveur de développement")
            else:
                self.relayer(url.path)
        elif url.path == "/ufsd" and (url.query == "" or FICHIER_CSV.match(url.query)):
            self.relayer("/ufsd?" + url.query)
        elif url.path == "/cm":
            cmnd = urllib.parse.parse_qs(url.query).get("cmnd", [""])[0]
            if COMMANDE_LECTURE.match(cmnd):
                self.relayer("/cm?" + urllib.parse.urlencode({"cmnd": cmnd}))
            else:
                self.send_error(403, "commande non autorisée par le serveur de développement")
        elif url.path in ("/", "/m"):
            self.path = "/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--module", required=True, help="adresse IP du module Teleinfo")
    p.add_argument("--port", type=int, default=8099)
    p.add_argument("--verbeux", action="store_true", help="journal des requêtes")
    a = p.parse_args()
    srv = http.server.ThreadingHTTPServer(("0.0.0.0", a.port), Gestion)
    srv.module, srv.verbeux = a.module, a.verbeux
    print(f"Interface : http://<cette machine>:{a.port}/  (module {a.module})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
