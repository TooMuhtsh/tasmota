# Interface mobile Teleinfo servie par le module, sans recompiler le firmware.
# Les fichiers de l'interface sont copiés dans le système de fichiers (mobile-*.html/css/js) ;
# ce pilote Berry les sert sur /m, ajoute un bouton sur les pages d'origine et fait de /m la page d'accueil
# (l'accueil d'origine reste accessible sur /?orig).
# Installation : copier ce fichier et les fichiers mobile-* à la racine, puis ajouter load('mobile.be') dans autoexec.be.
import webserver
import string

class TeleinfoMobile
  static types = {'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript'}
  var fichiers

  def init()
    import path
    self.fichiers = []
    for nom : path.listdir('/')
      if string.find(nom, 'mobile-') == 0 self.fichiers.push(nom) end
    end
    tasmota.add_driver(self)
  end

  # envoie un fichier par morceaux pour ménager la mémoire
  def servir(nom)
    var ext = string.split(nom, '.')
    ext = ext[size(ext) - 1]
    var f = open('/' + nom, 'r')
    webserver.content_open(200, self.types.find(ext, 'text/plain'))
    while true
      var morceau = f.read(1024)
      if size(morceau) == 0 break end
      webserver.content_send(morceau)
    end
    f.close()
    webserver.content_close()
  end

  def web_add_handler()
    webserver.on('/m', / -> self.servir('mobile-index.html'))
    for nom : self.fichiers
      if nom != 'mobile-index.html'
        var n = nom
        webserver.on('/' + n, / -> self.servir(n))
      end
    end
  end

  # bouton vers l'interface mobile : accueil, Configuration et Outils d'origine (retour depuis les pages Tasmota)
  def bouton()
    webserver.content_send("<p></p><form action='/m' method='get'><button>Interface mobile</button></form>")
  end
  # accueil d'origine : redirige vers /m, sauf si on l'a demandé explicitement (/?orig, lien « Interface d'origine »)
  def web_add_main_button()
    self.bouton()
    webserver.content_send("<script>if(location.search.indexOf('orig')<0)location.replace('/m');</script>")
  end
  def web_add_config_button() self.bouton() end
  def web_add_management_button() self.bouton() end
end

# Pilotage de la LED selon le contrat : heures pleines / creuses, couleur du jour (Tempo), ou règles personnalisées.
# Sources : section CONTRACT de la télémétrie (règle Tele#CONTRACT, à chaque TelePeriod) et ENERGY#Power (chaque seconde).
# Réglages gardés dans _persist.json (persist.mobile_led). Lecture et écriture : /m-led (?cfg=<json>).
# Mode « origine » : le firmware garde la main (sa propre LED clignotante, EnergyConfig period=1).
class TeleinfoLed
  static defaut = {'mode': 'origine', 'bri': 30, 'hp': 'FF6D00', 'hc': '00C853',
                   'bleu': '2962FF', 'blanc': 'FFFFFF', 'rouge': 'FF1744', 'hc_doux': false, 'cli_jour': 'non', 'alerte_demain': true,
                   'regles': [], 'autre': '000000', 'nuit': false, 'nuit_de': 23, 'nuit_a': 7}
  var cfg, contrat, puissance, cible, phase, appliquee, tic

  def init()
    import persist
    self.cfg = {}
    for k : self.defaut.keys() self.cfg[k] = self.defaut[k] end
    var p = persist.find('mobile_led')
    if type(p) == 'instance' for k : p.keys() self.cfg[k] = p[k] end end
    self.contrat = {}
    self.puissance = 0
    self.phase = true
    self.tic = 0
    tasmota.add_rule('Tele#CONTRACT', def (v) if type(v) == 'instance' self.contrat = v self.calculer() end end, 'mobile_led')
    tasmota.add_rule('ENERGY#Power', def (v) self.puissance = v end, 'mobile_led')
    tasmota.add_driver(self)
  end

  # le jour Tempo : nom de la couleur du firmware vers notre clé
  def couleur_jour(nom)
    return {'Bleu': 'bleu', 'Blanc': 'blanc', 'Rouge': 'rouge'}.find(nom)
  end

  def condition(si, seuil)
    var c = self.contrat
    if si == 'toujours' return true end
    if si == 'hc' return c.find('hour') == 'Creuse' end
    if si == 'hp' return c.find('hour') == 'Pleine' end
    if si == 'bleu' || si == 'blanc' || si == 'rouge' return self.couleur_jour(c.find('color')) == si end
    if si == 'demain_blanc' return c.find('tmrw') == 'Blanc' end
    if si == 'demain_rouge' return c.find('tmrw') == 'Rouge' end
    if si == 'puissance' return self.puissance >= int(seuil) end
    return false
  end

  # cible = [couleur RRGGBB, luminosité 0-100, clignote] ; nil = LED éteinte
  def calculer()
    var c = self.cfg, m = c['mode'], bri = int(c['bri'])
    var cible = nil
    if m == 'hphc' && self.contrat.find('hour') != nil
      cible = [self.condition('hc') ? c['hc'] : c['hp'], bri, false]
    elif m == 'jour'
      var j = self.couleur_jour(self.contrat.find('color'))
      if j != nil
        cible = [c[j], (c['hc_doux'] && self.condition('hc')) ? bri / 3 : bri, false]
        # clignotement lent : heures creuses ou pleines selon le choix ; rapide : la veille d'un jour rouge (prioritaire)
        if c['cli_jour'] == 'hc' || c['cli_jour'] == 'hp' if self.condition(c['cli_jour']) cible[2] = 1 end end
        if c['alerte_demain'] && self.condition('demain_rouge') cible[2] = 2 end
      end
    elif m == 'perso'
      for r : c['regles']
        if self.condition(r.find('si'), r.find('seuil', 0))
          cible = [r.find('rgb', 'FFFFFF'), bri, r.find('cli', false) ? 1 : false]
          break
        end
      end
      if cible == nil && c['autre'] != '000000' cible = [c['autre'], bri, false] end
    end
    if cible != nil && c['nuit']
      var h = tasmota.time_dump(tasmota.rtc()['local'])['hour'], de = int(c['nuit_de']), a = int(c['nuit_a'])
      if (de > a) ? (h >= de || h < a) : (h >= de && h < a) cible = nil end
    end
    if cible != nil && cible[1] < 1 cible[1] = 1 end
    self.cible = cible
  end

  def appliquer()
    import light
    var m = self.cfg['mode']
    if m == 'origine' return end
    var etat = 'off'
    if self.cible != nil
      # clignotement par la luminosité (pas par l'alimentation, qui publierait POWER à chaque battement)
      var b = self.cible[1] * 255 / 100
      if self.cible[2] && !self.phase b = b / 10 end
      etat = self.cible[0] + ':' + str(b < 1 ? 1 : b)
    end
    if etat == self.appliquee return end
    var allumer = self.appliquee == nil || self.appliquee == 'off'
    self.appliquee = etat
    if etat == 'off'
      light.set({'power': false})
    else
      var v = {'rgb': self.cible[0], 'bri': int(string.split(etat, ':')[1])}
      if allumer v['power'] = true end
      light.set(v)
    end
  end

  # cadence 250 ms : clignotement lent (1 s allumée, 1 s atténuée) ou rapide (250 ms)
  def every_250ms()
    self.tic = (self.tic + 1) % 4
    if self.tic == 0 && self.cfg['mode'] == 'perso' self.calculer() end   # règle sur la puissance : chaque seconde
    var cli = self.cible != nil ? self.cible[2] : false
    if !cli self.phase = true
    elif cli == 2 self.phase = !self.phase
    elif self.tic == 0 self.phase = !self.phase
    end
    self.appliquer()
  end

  def enregistrer(texte)
    import json
    import persist
    var n = json.load(texte)
    if type(n) != 'instance' return false end
    var avant = self.cfg['mode']
    for k : n.keys() if self.defaut.contains(k) self.cfg[k] = n[k] end end
    persist.mobile_led = self.cfg
    persist.save()
    # la LED d'origine du firmware et la nôtre ne doivent pas se battre
    if (avant == 'origine') != (self.cfg['mode'] == 'origine')
      tasmota.cmd('EnergyConfig period=' + (self.cfg['mode'] == 'origine' ? '1' : '0'))
      if self.cfg['mode'] != 'origine' import light light.set({'power': false}) end
    end
    self.appliquee = nil
    self.calculer()
    self.appliquer()
    return true
  end

  def web_add_handler()
    webserver.on('/m-led', def ()
      import json
      var ok = true
      if webserver.has_arg('cfg') ok = self.enregistrer(webserver.arg('cfg')) end
      webserver.content_open(ok ? 200 : 400, 'application/json')
      webserver.content_send(json.dump({'cfg': self.cfg, 'contrat': {'hour': self.contrat.find('hour'), 'color': self.contrat.find('color'),
        'tmrw': self.contrat.find('tmrw')}, 'puissance': self.puissance, 'cible': self.cible}))
      webserver.content_close()
    end)
  end
end

# rechargement (nouvelle version des fichiers) : on retire l'ancien pilote avant d'en créer un nouveau
import global
if global.contains('teleinfo_mobile') tasmota.remove_driver(global.teleinfo_mobile) end
teleinfo_mobile = TeleinfoMobile()
if global.contains('teleinfo_led')
  tasmota.remove_driver(global.teleinfo_led)
  tasmota.remove_rule('Tele#CONTRACT', 'mobile_led')
  tasmota.remove_rule('ENERGY#Power', 'mobile_led')
end
teleinfo_led = TeleinfoLed()
