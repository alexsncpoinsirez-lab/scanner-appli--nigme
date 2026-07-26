// URL_API vient maintenant de config.js (chargé avant ce fichier dans index.html),
// pour n'avoir qu'un seul endroit à mettre à jour si l'URL de l'API change.

// L'id de l'énigme demandée (paramètre ?id=... de l'URL du site GitHub Pages).
var ID_ENIGME = new URLSearchParams(location.search).get('id') || '';

var carte = document.getElementById('carte');
var PROFILS_CLE = 'chasseEnigmes_profils';
var DERNIER_JOUEUR_CLE = 'chasseEnigmes_dernierJoueur';
var joueurActif = null;
var compteurLignesJoueur = 0;
var minuteurAideId = null;
var minuteurPasserId = null;
var fluxVideo = null;
var animationScanId = null;

afficherAccueil();

// ---------------------------------------------------------------------
// APPEL DE L'API (remplace google.script.run, qui n'existe plus hors
// d'une page Apps Script). Toujours en GET avec les paramètres dans l'URL,
// pour rester simple et éviter les soucis de CORS liés au POST.
// ---------------------------------------------------------------------

function appelerApi(action, parametres) {
  var params = new URLSearchParams(parametres || {});
  params.set('action', action);
  return fetch(URL_API + '?' + params.toString())
    .then(function (reponse) {
      if (!reponse.ok) throw new Error('Réponse HTTP ' + reponse.status);
      return reponse.json();
    });
}

// ---------------------------------------------------------------------
// ÉCRAN D'ACCUEIL / PRÉSENTATION (avant l'inscription, à chaque scan)
// ---------------------------------------------------------------------

function afficherAccueil() {
  carte.innerHTML =
    '<div class="etat"><p>Chargement<span class="points-chargement"><span>.</span><span>.</span><span>.</span></span></p></div>';

  appelerApi('infosAccueil', { id: ID_ENIGME })
    .then(function (infos) {
      carte.innerHTML =
        '<span class="emoji">🗺️</span>' +
        '<h1>' + escapeHtml(infos.nomDuJeu) + '</h1>' +
        '<p class="question">' + escapeHtml(infos.messageAccueil) + '</p>' +
        '<button type="button" id="boutonCommencerAccueil">C\'est parti !</button>';
      document.getElementById('boutonCommencerAccueil').addEventListener('click', demarrer);
    })
    .catch(function () {
      // Pas grave si l'appel échoue : on ne bloque pas l'enfant, on lance le jeu direct.
      demarrer();
    });
}

function nettoyerEcran() {
  if (minuteurAideId) {
    clearTimeout(minuteurAideId);
    minuteurAideId = null;
  }
  if (minuteurPasserId) {
    clearTimeout(minuteurPasserId);
    minuteurPasserId = null;
  }
  fermerFluxCamera();
}

// ---------------------------------------------------------------------
// AIGUILLAGE PRINCIPAL
// ---------------------------------------------------------------------

function demarrer() {
  var profils = obtenirProfils();
  if (profils.length === 0) {
    afficherChoixModeJeu();
    return;
  }
  if (profils.length === 1) {
    lancerTourDuJoueur(profils[0]);
    return;
  }

  // Plusieurs joueurs : on relance directement le dernier joueur actif au lieu de
  // redemander "à qui le tour ?" à chaque scan. "Changer de joueur" reste toujours
  // accessible pour basculer explicitement.
  var dernierId = localStorage.getItem(DERNIER_JOUEUR_CLE);
  var dernierProfil = null;
  for (var i = 0; i < profils.length; i++) {
    if (profils[i].id === dernierId) dernierProfil = profils[i];
  }
  if (dernierProfil) {
    lancerTourDuJoueur(dernierProfil);
    return;
  }

  afficherChoixJoueur(profils);
}

function effacerProfils() {
  localStorage.removeItem(PROFILS_CLE);
  localStorage.removeItem(DERNIER_JOUEUR_CLE);
}

function obtenirProfils() {
  try {
    var brut = localStorage.getItem(PROFILS_CLE);
    var profils = brut ? JSON.parse(brut) : [];
    return Array.isArray(profils) ? profils : [];
  } catch (err) {
    return [];
  }
}

function enregistrerProfils(profils) {
  localStorage.setItem(PROFILS_CLE, JSON.stringify(profils));
}

function genererId() {
  return 'joueur-' + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------
// CHOIX DU MODE DE JEU (1er scan, ou après "Gérer les joueurs") :
// solo (un seul pseudo, pas de bouton "ajouter un joueur") ou à plusieurs
// (tour par tour sur le même téléphone, comme avant).
// ---------------------------------------------------------------------

function afficherChoixModeJeu() {
  nettoyerEcran();
  carte.innerHTML =
    '<h1>🙋 Qui joue ?</h1>' +
    '<p class="question">Vous jouez seul, ou à plusieurs sur ce même téléphone (chacun son tour) ?</p>' +
    '<button type="button" id="boutonModeSolo">🧍 Solo</button>' +
    '<button type="button" id="boutonModeMulti" class="bouton-secondaire">👨‍👩‍👧‍👦 À plusieurs, un seul téléphone</button>';

  document.getElementById('boutonModeSolo').addEventListener('click', function () {
    afficherEcranInscription(true);
  });
  document.getElementById('boutonModeMulti').addEventListener('click', function () {
    afficherEcranInscription(false);
  });
}

// ---------------------------------------------------------------------
// ÉCRAN D'INSCRIPTION (après le choix solo/plusieurs, ou après "Gérer les joueurs")
// ---------------------------------------------------------------------

function afficherEcranInscription(estSolo) {
  nettoyerEcran();
  carte.innerHTML =
    '<h1>👋 Bienvenue !</h1>' +
    '<p class="question">' + (estSolo
      ? 'Choisis un pseudo (pas besoin du vrai prénom).'
      : 'Qui va jouer ? Choisis un pseudo pour chacun (pas besoin du vrai prénom) — vous jouerez à tour de rôle sur ce téléphone si vous êtes plusieurs.') +
    '</p>' +
    '<div id="zoneJoueurs"></div>' +
    (estSolo ? '' : '<button type="button" id="boutonAjouterJoueur" class="bouton-secondaire">+ Ajouter un joueur</button>') +
    '<button type="button" id="boutonCommencer">Commencer</button>' +
    '<p class="message-erreur" id="messageErreurInscription"></p>';

  appelerApi('categoriesDisponibles', { id: ID_ENIGME })
    .then(function (categories) {
      window.categoriesDisponibles = (categories && categories.length) ? categories : ['Standard'];
      ajouterLigneJoueur();
    })
    .catch(function () {
      window.categoriesDisponibles = ['Standard'];
      ajouterLigneJoueur();
    });

  if (!estSolo) {
    document.getElementById('boutonAjouterJoueur').addEventListener('click', ajouterLigneJoueur);
  }
  document.getElementById('boutonCommencer').addEventListener('click', validerInscription);
}

function ajouterLigneJoueur() {
  compteurLignesJoueur++;
  var zone = document.getElementById('zoneJoueurs');
  if (!zone) return;

  var optionsCategories = window.categoriesDisponibles.map(function (categorie) {
    return '<option value="' + escapeHtml(categorie) + '">' + escapeHtml(categorie) + '</option>';
  }).join('');

  var ligne = document.createElement('div');
  ligne.className = 'ligne-joueur';
  ligne.innerHTML =
    '<input type="text" class="champ-prenom" placeholder="Pseudo (pas de vrai prénom)" autocomplete="off">' +
    '<select class="champ-categorie">' + optionsCategories + '</select>';
  zone.appendChild(ligne);
}

function validerInscription() {
  var lignes = document.querySelectorAll('.ligne-joueur');
  var profils = [];
  var erreur = document.getElementById('messageErreurInscription');
  erreur.textContent = '';

  for (var i = 0; i < lignes.length; i++) {
    var prenom = lignes[i].querySelector('.champ-prenom').value.trim();
    var categorie = lignes[i].querySelector('.champ-categorie').value;
    if (!prenom) continue;
    profils.push({ id: genererId(), prenom: prenom, categorie: categorie });
  }

  if (profils.length === 0) {
    erreur.textContent = 'Ajoute au moins un pseudo.';
    return;
  }

  enregistrerProfils(profils);
  demarrer();
}

// ---------------------------------------------------------------------
// ÉCRAN "À QUI LE TOUR ?" (si plusieurs joueurs inscrits)
// ---------------------------------------------------------------------

function afficherChoixJoueur(profils) {
  nettoyerEcran();
  var boutons = profils.map(function (profil) {
    return '<button type="button" class="bouton-joueur" data-id="' + escapeHtml(profil.id) + '">' + escapeHtml(profil.prenom) + '</button>';
  }).join('');

  carte.innerHTML =
    '<h1>🙋 À qui le tour ?</h1>' +
    '<div class="liste-joueurs">' + boutons + '</div>' +
    '<button type="button" id="boutonGererJoueurs" class="bouton-secondaire">Gérer les joueurs</button>';

  var listeBoutons = carte.querySelectorAll('.bouton-joueur');
  for (var i = 0; i < listeBoutons.length; i++) {
    listeBoutons[i].addEventListener('click', function () {
      var id = this.getAttribute('data-id');
      var trouve = null;
      for (var j = 0; j < profils.length; j++) {
        if (profils[j].id === id) trouve = profils[j];
      }
      if (trouve) lancerTourDuJoueur(trouve);
    });
  }

  document.getElementById('boutonGererJoueurs').addEventListener('click', function () {
    effacerProfils();
    demarrer();
  });
}

// ---------------------------------------------------------------------
// TOUR DE JEU DU JOUEUR ACTIF
// ---------------------------------------------------------------------

function lancerTourDuJoueur(profil) {
  nettoyerEcran();
  joueurActif = profil;
  localStorage.setItem(DERNIER_JOUEUR_CLE, profil.id);
  carte.innerHTML =
    '<div class="etat"><p>Chargement de l\'énigme pour ' + escapeHtml(profil.prenom) +
    '<span class="points-chargement"><span>.</span><span>.</span><span>.</span></span></p></div>';

  appelerApi('etatEnigme', { playerId: profil.id, id: ID_ENIGME, categorie: profil.categorie })
    .then(afficherEtat)
    .catch(afficherErreurTechnique);
}

function afficherEtat(etat) {
  if (etat.statut === 'introuvable') {
    carte.innerHTML =
      '<div class="etat">' +
      '<span class="emoji">❓</span>' +
      '<p>Ce QR code ne correspond à aucune énigme. Vérifie que c\'est bien un QR code de ce jeu, ou scanne à nouveau.</p>' +
      '</div>';
    ajouterLienGererJoueurs();
    return;
  }

  if (etat.statut === 'introuvablePourCategorie') {
    carte.innerHTML =
      '<div class="etat">' +
      '<span class="emoji">🚧</span>' +
      '<p>Cette énigme n\'existe pas encore pour la catégorie "' + escapeHtml(joueurActif.categorie) + '". Préviens l\'organisateur.</p>' +
      '</div>';
    ajouterLienGererJoueurs();
    return;
  }

  if (etat.statut === 'bloque') {
    carte.innerHTML =
      '<div class="etat">' +
      '<span class="emoji">🔒</span>' +
      '<p>' + escapeHtml(etat.message) + '</p>' +
      '</div>';
    ajouterPiedDeChangementJoueur();
    ajouterBoutonQuitter();
    return;
  }

  if (etat.statut === 'dejaResolu') {
    if (etat.estDerniere) {
      afficherVictoire(etat.indiceOuRecompense, false);
      return;
    }
    carte.innerHTML =
      '<div class="etat">' +
      '<span class="emoji">✅</span>' +
      '<p class="question">' + escapeHtml(etat.question) + '</p>' +
      '<div class="message-succes">' + escapeHtml(etat.indiceOuRecompense) + '</div>' +
      '</div>';
    ajouterBoutonScanner();
    ajouterPiedDeChangementJoueur();
    ajouterBoutonQuitter();
    return;
  }

  // statut === 'aResoudre'
  carte.innerHTML =
    '<h1>🔍 Énigme — ' + escapeHtml(joueurActif.prenom) + '</h1>' +
    '<p class="question">' + escapeHtml(etat.question) + '</p>' +
    '<input type="text" id="champReponse" placeholder="Ta réponse..." autocomplete="off" autocapitalize="off">' +
    '<button id="boutonValider">Valider</button>' +
    '<p class="message-erreur" id="messageErreur"></p>' +
    '<div class="actions-secondaires" id="actionsSecondaires"></div>';

  document.getElementById('boutonValider').addEventListener('click', validerReponseUtilisateur);
  document.getElementById('champReponse').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') validerReponseUtilisateur();
  });
  ajouterPiedDeChangementJoueur();

  if (etat.aUneAide) {
    programmerBoutonAide(etat.delaiAideSecondes);
  }
  if (etat.delaiPasserSecondes > 0) {
    programmerBoutonPasser(etat.delaiPasserSecondes);
  }
  ajouterBoutonQuitter();
}

// ---------------------------------------------------------------------
// QUITTER LE JEU (icône visible pendant une question, avec confirmation)
// ---------------------------------------------------------------------

function ajouterBoutonQuitter() {
  if (document.getElementById('boutonQuitter')) return;

  var bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.id = 'boutonQuitter';
  bouton.className = 'bouton-quitter';
  bouton.setAttribute('aria-label', 'Quitter le jeu');
  bouton.textContent = '✕';
  carte.appendChild(bouton);

  bouton.addEventListener('click', function () {
    var confirme = window.confirm('Veux-tu quitter le jeu et revenir à l\'accueil ?');
    if (confirme) {
      nettoyerEcran();
      afficherAccueil();
    }
  });
}

// ---------------------------------------------------------------------
// AIDE APRÈS DÉLAI (coup de pouce rédigé, distinct de l'indice de fin)
// ---------------------------------------------------------------------

function programmerBoutonAide(delaiSecondes) {
  minuteurAideId = setTimeout(function () {
    minuteurAideId = null;
    // L'écran a peut-être changé entre-temps (joueur a répondu, changé de joueur...) :
    // on ne fait rien si la question n'est plus affichée.
    if (!document.getElementById('champReponse') || document.getElementById('boutonAide')) return;

    var zoneActions = document.getElementById('actionsSecondaires');
    var boutonAide = document.createElement('button');
    boutonAide.type = 'button';
    boutonAide.id = 'boutonAide';
    boutonAide.className = 'bouton-aide';
    boutonAide.textContent = '💡 Coup de pouce';
    zoneActions.appendChild(boutonAide);

    boutonAide.addEventListener('click', function () {
      boutonAide.disabled = true;
      boutonAide.textContent = 'Chargement...';

      appelerApi('aideSupplementaire', { id: ID_ENIGME, categorie: joueurActif.categorie })
        .then(function (resultat) {
          boutonAide.remove();
          var zoneAide = document.createElement('div');
          zoneAide.className = 'zone-aide';
          zoneAide.textContent = resultat.aide;
          zoneActions.insertAdjacentElement('afterend', zoneAide);
        })
        .catch(function () {
          boutonAide.disabled = false;
          boutonAide.textContent = '💡 Coup de pouce';
        });
    });
  }, delaiSecondes * 1000);
}

// ---------------------------------------------------------------------
// BOUTON "PASSER" APRÈS DÉLAI (débloque l'étape suivante sans bonne réponse)
// ---------------------------------------------------------------------

function programmerBoutonPasser(delaiSecondes) {
  minuteurPasserId = setTimeout(function () {
    minuteurPasserId = null;
    if (!document.getElementById('champReponse') || document.getElementById('boutonPasser')) return;

    var zoneActionsPasser = document.getElementById('actionsSecondaires');
    var boutonPasser = document.createElement('button');
    boutonPasser.type = 'button';
    boutonPasser.id = 'boutonPasser';
    boutonPasser.className = 'bouton-passer';
    boutonPasser.textContent = '⏭️ Passer';
    zoneActionsPasser.appendChild(boutonPasser);

    boutonPasser.addEventListener('click', function () {
      var confirme = window.confirm('Passer cette énigme ? Tu ne sauras pas la réponse, mais tu pourras continuer l\'aventure.');
      if (!confirme) return;

      boutonPasser.disabled = true;
      boutonPasser.textContent = 'Un instant...';

      appelerApi('passerEnigme', { playerId: joueurActif.id, id: ID_ENIGME, categorie: joueurActif.categorie, nom: joueurActif.prenom })
        .then(function (resultat) {
          if (resultat.success) {
            afficherSucces(resultat);
          } else {
            boutonPasser.disabled = false;
            boutonPasser.textContent = '⏭️ Passer';
          }
        })
        .catch(afficherErreurTechnique);
    });
  }, delaiSecondes * 1000);
}

function validerReponseUtilisateur() {
  var champ = document.getElementById('champReponse');
  var bouton = document.getElementById('boutonValider');
  var messageErreur = document.getElementById('messageErreur');
  var reponse = champ.value;

  if (!reponse.trim()) return;

  bouton.disabled = true;
  messageErreur.textContent = '';

  appelerApi('validerReponse', { playerId: joueurActif.id, id: ID_ENIGME, categorie: joueurActif.categorie, reponse: reponse, nom: joueurActif.prenom })
    .then(function (resultat) {
      bouton.disabled = false;
      if (resultat.success) {
        afficherSucces(resultat);
      } else {
        messageErreur.textContent = resultat.message;
      }
    })
    .catch(afficherErreurTechnique);
}

function afficherSucces(resultat) {
  nettoyerEcran();
  if (resultat.estDerniere) {
    afficherVictoire(resultat.indiceOuRecompense, true);
    return;
  }
  carte.innerHTML =
    '<div class="etat">' +
    '<span class="emoji">🎉</span>' +
    '<div class="message-succes">' + escapeHtml(resultat.indiceOuRecompense) + '</div>' +
    '</div>';
  ajouterBoutonScanner();
  ajouterPiedDeChangementJoueur();
}

// ---------------------------------------------------------------------
// ÉCRAN DE VICTOIRE
// ---------------------------------------------------------------------

function afficherVictoire(messageRecompense, avecSon) {
  carte.innerHTML =
    '<div class="etat victoire-conteneur" id="conteneurVictoire">' +
    '<span class="emoji">🏆</span>' +
    '<h1 class="titre-victoire">Bravo ' + escapeHtml(joueurActif.prenom) + ', tu as gagné !</h1>' +
    '<div class="message-victoire">' + escapeHtml(messageRecompense) + '</div>' +
    '<button class="bouton-rejouer" id="boutonRejouer">Recommencer à zéro</button>' +
    '</div>';

  ajouterConfettis();
  if (avecSon) jouerSonVictoire();

  document.getElementById('boutonRejouer').addEventListener('click', function () {
    effacerProfils();
    location.reload();
  });

  ajouterPiedDeChangementJoueur();
}

// ---------------------------------------------------------------------
// PIED DE PAGE "CHANGER DE JOUEUR" (si plusieurs joueurs inscrits)
// ---------------------------------------------------------------------

function ajouterPiedDeChangementJoueur() {
  var profils = obtenirProfils();
  if (profils.length <= 1) return;

  var pied = document.createElement('div');
  pied.className = 'pied-changement-joueur';
  pied.innerHTML = '<button type="button" id="boutonChangerJoueur" class="bouton-lien">Ce n\'est pas ' + escapeHtml(joueurActif.prenom) + ' ? Changer de joueur</button>';
  carte.appendChild(pied);

  document.getElementById('boutonChangerJoueur').addEventListener('click', function () {
    afficherChoixJoueur(profils);
  });
}

/**
 * Lien de secours sur les écrans sans autre action possible (énigme introuvable...) :
 * repart proprement de l'écran d'inscription plutôt que de laisser un cul-de-sac.
 */
function ajouterLienGererJoueurs() {
  var lien = document.createElement('div');
  lien.className = 'pied-changement-joueur';
  lien.innerHTML = '<button type="button" id="boutonGererJoueursPied" class="bouton-lien">Gérer les joueurs</button>';
  carte.appendChild(lien);

  document.getElementById('boutonGererJoueursPied').addEventListener('click', function () {
    effacerProfils();
    demarrer();
  });
}

// ---------------------------------------------------------------------
// SCANNER LE QR SUIVANT DEPUIS L'APPLI (caméra)
// ---------------------------------------------------------------------

function ajouterBoutonScanner() {
  if (document.getElementById('boutonScanner')) return;

  var bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.id = 'boutonScanner';
  bouton.className = 'bouton-scanner';
  bouton.textContent = '📷 Scanner le QR suivant';
  carte.appendChild(bouton);

  bouton.addEventListener('click', ouvrirScanner);
}

function ouvrirScanner() {
  if (typeof jsQR === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    afficherErreurScanner('Le scanner n\'est pas disponible sur cet appareil. Utilise l\'appareil photo de ton téléphone à la place.');
    return;
  }

  var boutonScanner = document.getElementById('boutonScanner');
  if (boutonScanner) boutonScanner.style.display = 'none';

  var zone = document.createElement('div');
  zone.className = 'zone-scanner';
  zone.id = 'zoneScanner';
  zone.innerHTML =
    '<video id="videoScanner" playsinline autoplay muted></video>' +
    '<p class="astuce-scanner">Vise le QR code avec ton téléphone</p>' +
    '<button type="button" id="boutonAnnulerScan" class="bouton-secondaire">Annuler</button>';
  carte.appendChild(zone);

  document.getElementById('boutonAnnulerScan').addEventListener('click', fermerScanner);

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(function (stream) {
      fluxVideo = stream;
      var video = document.getElementById('videoScanner');
      if (!video) { // l'écran a changé pendant l'autorisation caméra
        stream.getTracks().forEach(function (piste) { piste.stop(); });
        fluxVideo = null;
        return;
      }
      video.srcObject = stream;
      video.play();
      animationScanId = requestAnimationFrame(analyserImageCamera);
    })
    .catch(function () {
      afficherErreurScanner('Impossible d\'accéder à la caméra. Vérifie que tu as autorisé l\'accès, ou utilise l\'appareil photo de ton téléphone.');
    });
}

function analyserImageCamera() {
  var video = document.getElementById('videoScanner');
  if (!video || !fluxVideo) return; // scanner fermé entre-temps

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var contexte = canvas.getContext('2d');
    contexte.drawImage(video, 0, 0, canvas.width, canvas.height);
    var image = contexte.getImageData(0, 0, canvas.width, canvas.height);
    var resultat = jsQR(image.data, image.width, image.height);

    if (resultat && resultat.data) {
      traiterCodeScanne(resultat.data);
      return;
    }
  }

  animationScanId = requestAnimationFrame(analyserImageCamera);
}

function traiterCodeScanne(texte) {
  var baseActuelle = location.origin + location.pathname;
  if (texte.indexOf(baseActuelle) !== 0 || texte.indexOf('id=') === -1) {
    // Pas un QR code de ce jeu : on continue simplement à scanner.
    animationScanId = requestAnimationFrame(analyserImageCamera);
    return;
  }
  fermerFluxCamera();
  window.location.href = texte;
}

function fermerScanner() {
  fermerFluxCamera();
  var zone = document.getElementById('zoneScanner');
  if (zone) zone.remove();
  var boutonScanner = document.getElementById('boutonScanner');
  if (boutonScanner) boutonScanner.style.display = '';
}

function fermerFluxCamera() {
  if (animationScanId) {
    cancelAnimationFrame(animationScanId);
    animationScanId = null;
  }
  if (fluxVideo) {
    fluxVideo.getTracks().forEach(function (piste) { piste.stop(); });
    fluxVideo = null;
  }
}

function afficherErreurScanner(message) {
  fermerFluxCamera();
  var zone = document.getElementById('zoneScanner');
  if (zone) zone.remove();

  var erreur = document.createElement('p');
  erreur.className = 'message-erreur';
  erreur.textContent = message;
  carte.appendChild(erreur);

  var boutonScanner = document.getElementById('boutonScanner');
  if (boutonScanner) boutonScanner.style.display = '';
}

// ---------------------------------------------------------------------
// CONFETTIS + SON DE VICTOIRE
// ---------------------------------------------------------------------

function ajouterConfettis() {
  var conteneur = document.getElementById('conteneurVictoire');
  if (!conteneur) return;
  var emojis = ['🎉', '⭐', '🎊', '✨', '🏅'];
  for (var i = 0; i < 18; i++) {
    var piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    piece.style.left = Math.floor(Math.random() * 90) + '%';
    piece.style.animationDelay = (Math.random() * 1.5) + 's';
    conteneur.appendChild(piece);
  }
}

function jouerSonVictoire() {
  try {
    var ContexteAudio = window.AudioContext || window.webkitAudioContext;
    if (!ContexteAudio) return;
    var contexteAudio = new ContexteAudio();
    var notes = [523.25, 659.25, 783.99, 1046.5]; // do - mi - sol - do aigu

    notes.forEach(function (frequence, index) {
      var oscillateur = contexteAudio.createOscillator();
      var gain = contexteAudio.createGain();
      oscillateur.type = 'sine';
      oscillateur.frequency.value = frequence;
      oscillateur.connect(gain);
      gain.connect(contexteAudio.destination);

      var debut = contexteAudio.currentTime + index * 0.15;
      gain.gain.setValueAtTime(0.15, debut);
      gain.gain.exponentialRampToValueAtTime(0.001, debut + 0.3);
      oscillateur.start(debut);
      oscillateur.stop(debut + 0.3);
    });
  } catch (err) {
    // Pas grave si le son ne joue pas (politique du navigateur, etc.)
  }
}

// ---------------------------------------------------------------------
// ERREURS / UTILITAIRES
// ---------------------------------------------------------------------

function afficherErreurTechnique(erreur) {
  nettoyerEcran();
  carte.innerHTML =
    '<div class="etat">' +
    '<span class="emoji">⚠️</span>' +
    '<p>Petit souci technique, réessaie dans un instant.</p>' +
    '<button type="button" id="boutonReessayer">🔄 Réessayer</button>' +
    '</div>';
  console.error(erreur);

  document.getElementById('boutonReessayer').addEventListener('click', function () {
    if (joueurActif) {
      lancerTourDuJoueur(joueurActif);
    } else {
      demarrer();
    }
  });
}

function escapeHtml(texte) {
  var div = document.createElement('div');
  div.textContent = texte == null ? '' : texte;
  return div.innerHTML;
}
