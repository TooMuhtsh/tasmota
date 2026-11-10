# Interface mobile Teleinfo servie par le module, sans recompiler le firmware.
# Les fichiers de l'interface sont copiés dans le système de fichiers (mobile-*.html/css/js) ;
# ce pilote Berry les sert sur /m et ajoute un bouton sur la page d'accueil d'origine.
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
  def web_add_main_button() self.bouton() end
  def web_add_config_button() self.bouton() end
  def web_add_management_button() self.bouton() end
end

# rechargement (nouvelle version des fichiers) : on retire l'ancien pilote avant d'en créer un nouveau
import global
if global.contains('teleinfo_mobile') tasmota.remove_driver(global.teleinfo_mobile) end
teleinfo_mobile = TeleinfoMobile()
