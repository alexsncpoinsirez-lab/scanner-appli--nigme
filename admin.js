// URL_API vient de config.js (chargé avant ce fichier dans admin.html).

var carte = document.getElementById('carte');
var CLIENT_ID = new URLSearchParams(location.search).get('client') || '';
var pinCourant = null;
var enigmesCourantes = [];
var infosClient = null;
var categoriesActuelles = []; // catégories d'âge définies par ce client (Paramètres > Catégories)

afficherEcranPin();

// ---------------------------------------------------------------------
// APPEL DE L'API (identique au principe de app.js)
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
// ÉCRAN DE CONNEXION (code PIN)
// ---------------------------------------------------------------------

function afficherEcranPin() {
  if (!CLIENT_ID) {
    carte.innerHTML =
      '<div class="etat">' +
      '<span class="emoji">❓</span>' +
      '<p>Lien invalide ou incomplet. Demande un nouveau lien à l\'organisateur.</p>' +
      '</div>';
    return;
  }

  carte.innerHTML =
    '<h1>🔐 Ton espace</h1>' +
    '<p class="question">Entre le code PIN qu\'on t\'a donné pour accéder à tes énigmes.</p>' +
    '<input type="text" id="champPin" placeholder="Code PIN" autocomplete="off" inputmode="numeric">' +
    '<button type="button" id="boutonConnexion">Accéder à mes énigmes</button>' +
    '<p class="message-erreur" id="messageErreurPin"></p>';

  document.getElementById('boutonConnexion').addEventListener('click', connecter);
  document.getElementById('champPin').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') connecter();
  });
}

function connecter() {
  var champ = document.getElementById('champPin');
  var bouton = document.getElementById('boutonConnexion');
  var erreur = document.getElementById('messageErreurPin');
  var pin = champ.value.trim();

  if (!pin) return;

  bouton.disabled = true;
  erreur.textContent = '';

  appelerApi('adminListerEnigmes', { client: CLIENT_ID, pin: pin })
    .then(function (resultat) {
      bouton.disabled = false;
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Code incorrect.';
        return;
      }
      pinCourant = pin;
      infosClient = { nomClient: resultat.nomClient, parcours: resultat.parcours };
      enigmesCourantes = resultat.enigmes;
      categoriesActuelles = resultat.categoriesDisponibles || ['Standard'];
      afficherEspaceClient();
    })
    .catch(function () {
      bouton.disabled = false;
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

// ---------------------------------------------------------------------
// ESPACE CLIENT : liste des énigmes + actions
// ---------------------------------------------------------------------

function afficherEspaceClient() {
  carte.innerHTML =
    '<h1>🗂️ ' + escapeHtml(infosClient.parcours) + '</h1>' +
    '<p class="question">Bonjour ' + escapeHtml(infosClient.nomClient) + ', voici tes énigmes.</p>' +
    '<div id="listeEnigmes"></div>' +
    '<button type="button" id="boutonAjouter" class="bouton-secondaire">+ Ajouter un emplacement</button>' +
    '<button type="button" id="boutonGenererIA" class="bouton-secondaire">🤖 Générer avec l\'IA</button>' +
    '<button type="button" id="boutonParametres" class="bouton-secondaire">⚙️ Paramètres</button>' +
    '<button type="button" id="boutonQuiz" class="bouton-secondaire">🏆 Mode Quiz</button>' +
    '<button type="button" id="boutonPdf">📄 Télécharger mes QR codes</button>' +
    '<p class="message-erreur" id="messageErreurEspace"></p>' +
    '<p class="message-succes" id="messageSuccesEspace" style="display:none;"></p>';

  afficherListeEnigmes();

  document.getElementById('boutonAjouter').addEventListener('click', function () {
    afficherFormulaire(null, null);
  });
  document.getElementById('boutonGenererIA').addEventListener('click', afficherGenerateurIA);
  document.getElementById('boutonParametres').addEventListener('click', afficherParametres);
  document.getElementById('boutonQuiz').addEventListener('click', afficherModeQuiz);
  document.getElementById('boutonPdf').addEventListener('click', telechargerPdf);
}

// ---------------------------------------------------------------------
// PARAMÈTRES DU PARCOURS (nom de l'évènement, message d'accueil, délais)
// ---------------------------------------------------------------------

function afficherParametres() {
  carte.innerHTML =
    '<div class="etat"><p>Chargement<span class="points-chargement"><span>.</span><span>.</span><span>.</span></span></p></div>';

  appelerApi('adminObtenirParametres', { client: CLIENT_ID, pin: pinCourant })
    .then(function (resultat) {
      if (!resultat.success) {
        carte.innerHTML =
          '<div class="etat"><span class="emoji">⚠️</span><p>' + escapeHtml(resultat.message || 'Erreur.') + '</p></div>';
        return;
      }
      afficherFormulaireParametres(resultat);
    })
    .catch(function () {
      carte.innerHTML =
        '<div class="etat"><span class="emoji">⚠️</span><p>Petit souci technique, réessaie dans un instant.</p></div>';
    });
}

function afficherFormulaireParametres(reglages) {
  carte.innerHTML =
    '<h1>⚙️ Paramètres</h1>' +
    '<p class="champ-titre">Nom de l\'évènement</p>' +
    '<input type="text" id="champNomEvenement" placeholder="Ex : L\'anniversaire de Léa" autocomplete="off">' +
    '<p class="champ-titre">Message d\'accueil (affiché avant de commencer)</p>' +
    '<textarea id="champMessageAccueilParcours" rows="3" placeholder="Ex : Résous les énigmes pour trouver le trésor !"></textarea>' +
    '<p class="champ-titre">Délai avant le bouton "Coup de pouce" (en secondes)</p>' +
    '<input type="number" id="champDelaiAide" min="0" placeholder="45">' +
    '<p class="champ-titre">Délai avant le bouton "Passer" (en secondes, 0 = désactivé)</p>' +
    '<input type="number" id="champDelaiPasser" min="0" placeholder="120">' +
    '<p class="champ-titre">Catégories d\'âge (séparées par une virgule)</p>' +
    '<input type="text" id="champCategories" placeholder="Ex : Petits (4-6 ans), Grands (10 ans et +)" autocomplete="off">' +
    '<p class="astuce-scanner" style="margin-top:-8px;">Chaque catégorie pourra avoir sa propre version de chaque énigme (question adaptée à l\'âge). Une seule catégorie = tout le monde voit le même contenu.</p>' +
    '<button type="button" id="boutonEnregistrerParametres">Enregistrer</button>' +
    '<button type="button" id="boutonAnnulerParametres" class="bouton-secondaire">← Retour à mes énigmes</button>' +
    '<p class="message-erreur" id="messageErreurParametres"></p>' +
    '<p class="message-succes" id="messageSuccesParametres" style="display:none;"></p>';

  document.getElementById('champNomEvenement').value = reglages.nomEvenement || '';
  document.getElementById('champMessageAccueilParcours').value = reglages.messageAccueil || '';
  document.getElementById('champDelaiAide').value = reglages.delaiAideSecondes;
  document.getElementById('champDelaiPasser').value = reglages.delaiPasserSecondes;
  document.getElementById('champCategories').value = reglages.categories || '';

  document.getElementById('boutonAnnulerParametres').addEventListener('click', afficherEspaceClient);
  document.getElementById('boutonEnregistrerParametres').addEventListener('click', soumettreParametres);
}

function soumettreParametres() {
  var nomEvenement = document.getElementById('champNomEvenement').value.trim();
  var messageAccueil = document.getElementById('champMessageAccueilParcours').value.trim();
  var delaiAide = document.getElementById('champDelaiAide').value;
  var delaiPasser = document.getElementById('champDelaiPasser').value;
  var categories = document.getElementById('champCategories').value.trim();
  var erreur = document.getElementById('messageErreurParametres');
  var succes = document.getElementById('messageSuccesParametres');
  var bouton = document.getElementById('boutonEnregistrerParametres');

  if (!nomEvenement) {
    erreur.textContent = 'Le nom de l\'évènement est obligatoire.';
    return;
  }

  bouton.disabled = true;
  erreur.textContent = '';
  succes.style.display = 'none';

  appelerApi('adminEnregistrerParametres', {
    client: CLIENT_ID,
    pin: pinCourant,
    nomEvenement: nomEvenement,
    messageAccueil: messageAccueil,
    delaiAideSecondes: delaiAide,
    delaiPasserSecondes: delaiPasser,
    categories: categories
  })
    .then(function (resultat) {
      bouton.disabled = false;
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Erreur, réessaie.';
        return;
      }
      categoriesActuelles = categories.split(',').map(function (c) { return c.trim(); }).filter(function (c) { return c; });
      if (categoriesActuelles.length === 0) categoriesActuelles = ['Standard'];
      succes.style.display = '';
      succes.textContent = 'Paramètres enregistrés !';
    })
    .catch(function () {
      bouton.disabled = false;
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

// ---------------------------------------------------------------------
// MODE QUIZ MULTIJOUEUR (chacun à son rythme, classement final)
// ---------------------------------------------------------------------
// Réutilise les mêmes énigmes que la chasse (question/réponse) dans un mode de
// jeu différent : le client démarre une manche (nombre de questions au choix),
// partage UN lien avec les joueurs, chacun répond aux mêmes questions à son
// rythme, et un classement se calcule automatiquement. Voir Code.gs pour le
// détail (une seule manche active à la fois, sans catégories d'âge ici).

/**
 * Construit le lien public de la partie à partir de l'URL de CETTE page
 * (admin.html) plutôt que d'interroger le serveur : les deux pages sont hébergées
 * côte à côte sur GitHub Pages, pas besoin d'aller chercher WebAppUrl.
 */
function obtenirLienQuiz() {
  return location.href.replace(/admin\.html.*$/, 'quiz.html') + '?client=' + encodeURIComponent(CLIENT_ID);
}

function afficherModeQuiz() {
  carte.innerHTML = '<div class="etat"><p>Chargement<span class="points-chargement"><span>.</span><span>.</span><span>.</span></span></p></div>';

  appelerApi('adminQuizEtat', { client: CLIENT_ID, pin: pinCourant })
    .then(function (etat) {
      if (!etat.success) {
        carte.innerHTML =
          '<div class="etat"><span class="emoji">⚠️</span><p>' + escapeHtml(etat.message || 'Erreur.') + '</p></div>';
        return;
      }
      afficherPanneauQuiz(etat);
    })
    .catch(function () {
      carte.innerHTML =
        '<div class="etat"><span class="emoji">⚠️</span><p>Petit souci technique, réessaie dans un instant.</p></div>';
    });
}

function afficherPanneauQuiz(etat) {
  var lienQuiz = obtenirLienQuiz();
  var urlQrCode = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(lienQuiz);

  carte.innerHTML =
    '<h1>🏆 Mode Quiz</h1>' +
    (etat.enCours
      ? '<div class="message-succes">Manche en cours — ' + etat.nombreQuestionsActuel + ' question(s).</div>'
      : '<p class="astuce-scanner">Aucune manche en cours pour l\'instant.</p>') +
    '<p class="champ-titre">Nombre de questions (' + etat.nombreEnigmesDisponibles + ' énigme(s) disponible(s))</p>' +
    '<input type="number" id="champNombreQuestions" min="1" max="' + etat.nombreEnigmesDisponibles + '" value="' + etat.nombreQuestionsActuel + '">' +
    '<button type="button" id="boutonDemarrerManche">' + (etat.enCours ? '🔁 Démarrer une nouvelle manche' : '▶️ Démarrer une manche') + '</button>' +
    (etat.enCours ? '<button type="button" id="boutonTerminerManche" class="bouton-secondaire">⏹️ Terminer la manche en cours</button>' : '') +
    '<p class="champ-titre">Lien à partager avec les joueurs</p>' +
    '<p class="carte-enigme-detail" style="word-break:break-all;">' + escapeHtml(lienQuiz) + '</p>' +
    '<button type="button" id="boutonCopierLien" class="bouton-secondaire">📋 Copier le lien</button>' +
    '<div style="text-align:center; margin: 12px 0;"><img src="' + urlQrCode + '" alt="QR code du quiz" width="150" height="150"></div>' +
    '<button type="button" id="boutonVoirClassementAdmin" class="bouton-secondaire">📊 Voir le classement</button>' +
    '<button type="button" id="boutonRetourQuiz" class="bouton-secondaire">← Retour à mes énigmes</button>' +
    '<p class="message-erreur" id="messageErreurQuizAdmin"></p>' +
    '<p class="message-succes" id="messageSuccesQuizAdmin" style="display:none;"></p>';

  document.getElementById('boutonDemarrerManche').addEventListener('click', function () { demarrerMancheQuiz(etat.enCours); });
  if (etat.enCours) {
    document.getElementById('boutonTerminerManche').addEventListener('click', terminerMancheQuiz);
  }
  document.getElementById('boutonCopierLien').addEventListener('click', function () {
    copierTexte(lienQuiz, document.getElementById('boutonCopierLien'));
  });
  document.getElementById('boutonVoirClassementAdmin').addEventListener('click', afficherClassementQuizAdmin);
  document.getElementById('boutonRetourQuiz').addEventListener('click', afficherEspaceClient);
}

function demarrerMancheQuiz(uneMancheEstDejaEnCours) {
  if (uneMancheEstDejaEnCours) {
    var confirme = window.confirm('Une manche est déjà en cours : la démarrer terminera celle-ci (son classement restera consultable). Continuer ?');
    if (!confirme) return;
  }

  var nombreQuestions = document.getElementById('champNombreQuestions').value;
  var erreur = document.getElementById('messageErreurQuizAdmin');
  var bouton = document.getElementById('boutonDemarrerManche');
  bouton.disabled = true;
  erreur.textContent = '';

  appelerApi('adminQuizDemarrerManche', { client: CLIENT_ID, pin: pinCourant, nombreQuestions: nombreQuestions })
    .then(function (resultat) {
      bouton.disabled = false;
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Erreur, réessaie.';
        return;
      }
      afficherModeQuiz();
    })
    .catch(function () {
      bouton.disabled = false;
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

function terminerMancheQuiz() {
  var confirme = window.confirm('Terminer la manche en cours ? Les joueurs qui n\'ont pas fini ne pourront plus répondre, mais le classement restera consultable.');
  if (!confirme) return;

  appelerApi('adminQuizTerminerManche', { client: CLIENT_ID, pin: pinCourant })
    .then(function (resultat) {
      if (!resultat.success) {
        window.alert(resultat.message || 'Erreur, réessaie.');
        return;
      }
      afficherModeQuiz();
    })
    .catch(function () {
      window.alert('Petit souci technique, réessaie dans un instant.');
    });
}

function copierTexte(texte, bouton) {
  var texteOriginal = bouton.textContent;
  var apresCopie = function () {
    bouton.textContent = '✅ Copié !';
    setTimeout(function () { bouton.textContent = texteOriginal; }, 1800);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texte).then(apresCopie).catch(function () {
      window.prompt('Copie manuelle (Ctrl+C puis Entrée) :', texte);
    });
  } else {
    window.prompt('Copie manuelle (Ctrl+C puis Entrée) :', texte);
  }
}

function afficherClassementQuizAdmin() {
  carte.innerHTML = '<div class="etat"><p>Chargement<span class="points-chargement"><span>.</span><span>.</span><span>.</span></span></p></div>';

  appelerApi('quizClassement', { client: CLIENT_ID })
    .then(function (resultat) {
      if (!resultat.success) {
        carte.innerHTML =
          '<div class="etat"><span class="emoji">⏳</span><p>' + escapeHtml(resultat.message || 'Aucun classement pour l\'instant.') + '</p></div>' +
          '<button type="button" id="boutonRetourClassementAdmin" class="bouton-secondaire">← Retour</button>';
        document.getElementById('boutonRetourClassementAdmin').addEventListener('click', afficherModeQuiz);
        return;
      }

      var medailles = ['🥇', '🥈', '🥉'];
      var lignes = resultat.classement.map(function (j, i) {
        var rang = medailles[i] || (i + 1) + '.';
        return (
          '<div class="carte-variante">' +
          '<strong>' + rang + ' ' + escapeHtml(j.pseudo) + '</strong>' +
          '<p class="carte-enigme-detail">' + j.bonnesReponses + ' / ' + resultat.nombreQuestions + ' bonnes réponses — ' + j.tempsTotal + ' s' +
          (j.termine ? '' : ' (en cours)') +
          '</p>' +
          '</div>'
        );
      }).join('');

      carte.innerHTML =
        '<h1>📊 Classement</h1>' +
        (resultat.classement.length ? lignes : '<p class="question" style="font-size:16px;">Personne n\'a encore répondu.</p>') +
        '<button type="button" id="boutonActualiserClassementAdmin" class="bouton-secondaire">Actualiser</button>' +
        '<button type="button" id="boutonRetourClassementAdmin" class="bouton-secondaire">← Retour</button>';

      document.getElementById('boutonActualiserClassementAdmin').addEventListener('click', afficherClassementQuizAdmin);
      document.getElementById('boutonRetourClassementAdmin').addEventListener('click', afficherModeQuiz);
    })
    .catch(function () {
      carte.innerHTML =
        '<div class="etat"><span class="emoji">⚠️</span><p>Petit souci technique, réessaie dans un instant.</p></div>';
    });
}

// ---------------------------------------------------------------------
// GÉNÉRATION D'ÉNIGMES PAR IA (thème choisi → énigmes proposées → relecture)
// ---------------------------------------------------------------------

var THEMES_SUGGERES_IA = [
  'Musique', 'Cinéma', 'Télé', 'Jouets', 'Dessins animés',
  'Noël', 'Pâques', 'Animaux', 'Sport', 'Nature'
];

function afficherGenerateurIA() {
  var optionsThemes = THEMES_SUGGERES_IA.map(function (t) {
    return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
  }).join('') + '<option value="autre">Autre (je précise)</option>';

  var optionsCategorie = categoriesActuelles.map(function (c) {
    return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
  }).join('');

  carte.innerHTML =
    '<h1>🤖 Générer avec l\'IA</h1>' +
    '<p class="astuce-scanner">L\'IA propose des questions/réponses sur un thème. Tu pourras tout relire, corriger et ajouter le lieu de cache avant de les ajouter à ton parcours — rien n\'est enregistré automatiquement.</p>' +
    '<p class="champ-titre">Thème</p>' +
    '<select id="champThemeIA">' + optionsThemes + '</select>' +
    '<input type="text" id="champThemeAutre" placeholder="Ex : super-héros, licornes..." autocomplete="off" style="display:none;">' +
    (categoriesActuelles.length > 1
      ? '<p class="champ-titre">Catégorie</p><select id="champCategorieIA">' + optionsCategorie + '</select>'
      : '') +
    '<p class="champ-titre">Public visé (optionnel)</p>' +
    '<input type="text" id="champDifficulteIA" placeholder="Ex : 6-8 ans, facile..." autocomplete="off">' +
    '<p class="champ-titre">Nombre d\'énigmes (max 10)</p>' +
    '<input type="number" id="champNombreIA" min="1" max="10" value="5">' +
    '<button type="button" id="boutonGenererIALancer">✨ Générer</button>' +
    '<button type="button" id="boutonAnnulerIA" class="bouton-secondaire">Annuler</button>' +
    '<p class="message-erreur" id="messageErreurIA"></p>';

  document.getElementById('champThemeIA').addEventListener('change', function () {
    document.getElementById('champThemeAutre').style.display = (this.value === 'autre') ? '' : 'none';
  });
  document.getElementById('boutonAnnulerIA').addEventListener('click', afficherEspaceClient);
  document.getElementById('boutonGenererIALancer').addEventListener('click', lancerGenerationIA);
}

function lancerGenerationIA() {
  var selectTheme = document.getElementById('champThemeIA');
  var theme = selectTheme.value === 'autre'
    ? document.getElementById('champThemeAutre').value.trim()
    : selectTheme.value;
  var champCategorieIA = document.getElementById('champCategorieIA');
  var categorie = champCategorieIA ? champCategorieIA.value : categoriesActuelles[0];
  var difficulte = document.getElementById('champDifficulteIA').value.trim();
  var nombre = document.getElementById('champNombreIA').value;
  var erreur = document.getElementById('messageErreurIA');
  var bouton = document.getElementById('boutonGenererIALancer');

  if (!theme) {
    erreur.textContent = 'Choisis ou écris un thème.';
    return;
  }

  bouton.disabled = true;
  bouton.textContent = 'Génération en cours...';
  erreur.textContent = '';

  appelerApi('adminGenererEnigmesIA', {
    client: CLIENT_ID,
    pin: pinCourant,
    theme: theme,
    difficulte: difficulte,
    nombre: nombre
  })
    .then(function (resultat) {
      bouton.disabled = false;
      bouton.textContent = '✨ Générer';
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Erreur, réessaie.';
        return;
      }
      afficherRevueEnigmesIA(resultat.enigmes, categorie);
    })
    .catch(function () {
      bouton.disabled = false;
      bouton.textContent = '✨ Générer';
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

/**
 * Liste éditable des énigmes proposées par l'IA : chaque carte a une case pour
 * la garder ou non, la question/réponse modifiables, et un champ "lieu de
 * cache" à remplir (l'IA ne peut pas le deviner). Rien n'est enregistré tant
 * que le client ne clique pas sur "Ajouter à mon parcours".
 */
function afficherRevueEnigmesIA(enigmes, categorie) {
  var cartes = enigmes.map(function (e, i) {
    return (
      '<div class="carte-variante" data-index="' + i + '">' +
      '<label class="etiquette-case">' +
      '<input type="checkbox" class="case-garder-ia" checked> Garder cette énigme' +
      '</label>' +
      '<p class="champ-titre">Question</p>' +
      '<textarea class="champ-question-ia" rows="2">' + escapeHtml(e.question) + '</textarea>' +
      '<p class="champ-titre">Réponse attendue</p>' +
      '<input type="text" class="champ-reponse-ia" value="' + escapeHtml(e.reponse) + '">' +
      '<p class="champ-titre">Où cacheras-tu le prochain QR ? (optionnel, à compléter maintenant ou plus tard)</p>' +
      '<textarea class="champ-indice-ia" rows="2" placeholder="Optionnel"></textarea>' +
      '</div>'
    );
  }).join('');

  carte.innerHTML =
    '<h1>🤖 Relis avant d\'ajouter</h1>' +
    '<p class="astuce-scanner">Corrige ce que tu veux, décoche ce que tu ne gardes pas, puis valide.</p>' +
    cartes +
    '<button type="button" id="boutonAccepterIA">✅ Ajouter les énigmes gardées à mon parcours</button>' +
    '<button type="button" id="boutonRegenererIA" class="bouton-secondaire">🔄 Regénérer une autre série</button>' +
    '<button type="button" id="boutonAnnulerRevueIA" class="bouton-secondaire">Annuler</button>' +
    '<p class="message-erreur" id="messageErreurRevueIA"></p>';

  document.getElementById('boutonAccepterIA').addEventListener('click', function () {
    accepterEnigmesIA(categorie);
  });
  document.getElementById('boutonRegenererIA').addEventListener('click', afficherGenerateurIA);
  document.getElementById('boutonAnnulerRevueIA').addEventListener('click', afficherEspaceClient);
}

function accepterEnigmesIA(categorie) {
  var cartes = document.querySelectorAll('.carte-variante');
  var erreur = document.getElementById('messageErreurRevueIA');
  var bouton = document.getElementById('boutonAccepterIA');
  var enigmesGardees = [];

  cartes.forEach(function (carteEl) {
    var garder = carteEl.querySelector('.case-garder-ia').checked;
    if (!garder) return;
    var question = carteEl.querySelector('.champ-question-ia').value.trim();
    var reponse = carteEl.querySelector('.champ-reponse-ia').value.trim();
    var indice = carteEl.querySelector('.champ-indice-ia').value.trim();
    if (!question || !reponse) return;
    enigmesGardees.push({ question: question, reponse: reponse, indice: indice });
  });

  if (enigmesGardees.length === 0) {
    erreur.textContent = 'Garde au moins une énigme (coche la case et vérifie question/réponse).';
    return;
  }

  bouton.disabled = true;
  erreur.textContent = '';

  appelerApi('adminAjouterEnigmesEnLot', {
    client: CLIENT_ID,
    pin: pinCourant,
    categorie: categorie,
    enigmes: JSON.stringify(enigmesGardees)
  })
    .then(function (resultat) {
      bouton.disabled = false;
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Erreur, réessaie.';
        return;
      }
      var messageSucces = resultat.nombreAjoutees + ' énigme(s) ajoutée(s) ! Pense à compléter le lieu de cache pour celles qui n\'en ont pas encore.';
      appelerApi('adminListerEnigmes', { client: CLIENT_ID, pin: pinCourant })
        .then(function (resultatListe) {
          if (resultatListe.success) {
            enigmesCourantes = resultatListe.enigmes;
            categoriesActuelles = resultatListe.categoriesDisponibles || categoriesActuelles;
          }
          afficherEspaceClient();
          var zoneSucces = document.getElementById('messageSuccesEspace');
          if (zoneSucces) {
            zoneSucces.style.display = '';
            zoneSucces.textContent = messageSucces;
          }
        });
    })
    .catch(function () {
      bouton.disabled = false;
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

/**
 * Affiche les énigmes groupées par EMPLACEMENT (même numéro d'ordre = même QR
 * physique), avec une carte imbriquée par variante de catégorie à l'intérieur.
 * Un bouton "+ Ajouter une catégorie à cet emplacement" apparaît sous chaque
 * emplacement tant qu'il reste des catégories du client non encore utilisées ici.
 */
function afficherListeEnigmes() {
  var zone = document.getElementById('listeEnigmes');
  if (!zone) return;

  if (enigmesCourantes.length === 0) {
    zone.innerHTML = '<p class="question" style="font-size:16px;">Tu n\'as pas encore d\'énigme. Clique sur "+ Ajouter un emplacement" pour commencer.</p>';
    return;
  }

  var parOrdre = {};
  enigmesCourantes.forEach(function (e) {
    if (!parOrdre[e.ordre]) parOrdre[e.ordre] = [];
    parOrdre[e.ordre].push(e);
  });
  var ordresTries = Object.keys(parOrdre).map(Number).sort(function (a, b) { return a - b; });

  zone.innerHTML = ordresTries.map(function (ordre) {
    var variantes = parOrdre[ordre];
    var estDerniere = variantes.some(function (v) { return v.estDerniere; });
    var idEmplacement = variantes[0].id;
    var categoriesManquantes = categoriesManquantesPour(idEmplacement);

    var htmlVariantes = variantes.map(function (v) {
      return (
        '<div class="carte-variante" data-id="' + escapeHtml(v.id) + '" data-categorie="' + escapeHtml(v.categorie) + '">' +
        (categoriesActuelles.length > 1 ? '<span class="etiquette-categorie">' + escapeHtml(v.categorie) + '</span>' : '') +
        '<p class="carte-enigme-question">' + escapeHtml(v.question) + '</p>' +
        '<p class="carte-enigme-detail"><strong>Réponse :</strong> ' + escapeHtml(v.reponseAttendue) + '</p>' +
        (v.indice ? '<p class="carte-enigme-detail"><strong>Lieu du prochain QR :</strong> ' + escapeHtml(v.indice) + '</p>' : '') +
        (v.recompense ? '<p class="carte-enigme-detail"><strong>Message de victoire :</strong> ' + escapeHtml(v.recompense) + '</p>' : '') +
        '<div class="carte-enigme-actions">' +
        '<button type="button" class="bouton-secondaire bouton-modifier">Modifier</button>' +
        '<button type="button" class="bouton-secondaire bouton-supprimer">Supprimer</button>' +
        '</div>' +
        '</div>'
      );
    }).join('');

    var boutonAjoutVariante = categoriesManquantes.length
      ? '<button type="button" class="bouton-secondaire bouton-ajouter-variante" data-id-emplacement="' + escapeHtml(idEmplacement) + '">+ Ajouter une catégorie à cet emplacement</button>'
      : '';

    return (
      '<div class="carte-enigme">' +
      '<div class="carte-enigme-entete">' +
      '<span class="carte-enigme-numero">Emplacement ' + ordre + '</span>' +
      (estDerniere ? '<span class="badge-derniere">🏆 Dernière énigme</span>' : '') +
      '</div>' +
      htmlVariantes +
      boutonAjoutVariante +
      '</div>'
    );
  }).join('');

  var variantes = zone.querySelectorAll('.carte-variante');
  variantes.forEach(function (el) {
    var id = el.getAttribute('data-id');
    var categorie = el.getAttribute('data-categorie');
    el.querySelector('.bouton-modifier').addEventListener('click', function () {
      var enigme = enigmesCourantes.filter(function (e) { return e.id === id && e.categorie === categorie; })[0];
      if (enigme) afficherFormulaire(enigme, null);
    });
    el.querySelector('.bouton-supprimer').addEventListener('click', function () {
      supprimerEnigme(id, categorie);
    });
  });

  var boutonsAjoutVariante = zone.querySelectorAll('.bouton-ajouter-variante');
  boutonsAjoutVariante.forEach(function (bouton) {
    bouton.addEventListener('click', function () {
      afficherFormulaire(null, this.getAttribute('data-id-emplacement'));
    });
  });
}

/**
 * Catégories du client pas encore représentées à l'emplacement idEmplacement.
 */
function categoriesManquantesPour(idEmplacement) {
  var utilisees = enigmesCourantes
    .filter(function (e) { return e.id === idEmplacement; })
    .map(function (e) { return e.categorie; });
  return categoriesActuelles.filter(function (c) { return utilisees.indexOf(c) === -1; });
}

// ---------------------------------------------------------------------
// FORMULAIRE AJOUT / MODIFICATION
// ---------------------------------------------------------------------

/**
 * Trois modes possibles :
 * - enigmeExistante fourni : modification d'une variante précise (catégorie fixe).
 * - idPourNouvelleVariante fourni : nouvelle variante de catégorie pour un
 *   emplacement déjà existant (pas de case "dernière énigme" : héritée du serveur).
 * - ni l'un ni l'autre : tout nouvel emplacement (nouveau QR physique), avec choix
 *   de la catégorie et possibilité de le marquer comme énigme finale.
 */
function afficherFormulaire(enigmeExistante, idPourNouvelleVariante) {
  var estModification = !!enigmeExistante;
  var estNouvelleVariante = !estModification && !!idPourNouvelleVariante;

  var blocCategorie;
  if (estModification) {
    blocCategorie =
      '<p class="champ-titre">Catégorie</p>' +
      '<p class="etiquette-categorie-fixe">' + escapeHtml(enigmeExistante.categorie) + '</p>';
  } else {
    var categoriesProposees = estNouvelleVariante ? categoriesManquantesPour(idPourNouvelleVariante) : categoriesActuelles;
    var options = categoriesProposees.map(function (c) {
      return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
    }).join('');
    blocCategorie =
      '<p class="champ-titre">Catégorie</p>' +
      '<select id="champCategorie">' + options + '</select>';
  }

  carte.innerHTML =
    '<h1>' + (estModification ? '✏️ Modifier l\'énigme' : (estNouvelleVariante ? '➕ Nouvelle catégorie' : '➕ Nouvel emplacement')) + '</h1>' +
    (estNouvelleVariante ? '<p class="astuce-scanner">Cette variante s\'affichera au même endroit physique (même QR), uniquement pour la catégorie choisie.</p>' : '') +
    blocCategorie +
    '<p class="champ-titre">Question</p>' +
    '<textarea id="champQuestion" rows="3" placeholder="Ex : Je vole sans ailes, je pleure sans yeux. Qui suis-je ?"></textarea>' +
    '<p class="champ-titre">Réponse attendue</p>' +
    '<input type="text" id="champReponse" placeholder="Ex : nuage" autocomplete="off">' +
    '<p class="champ-titre">Où trouver le prochain QR code ?</p>' +
    '<textarea id="champIndice" rows="2" placeholder="Ex : Va voir sous le paillasson de la porte d\'entrée"></textarea>' +
    '<p class="champ-titre">Coup de pouce (optionnel, affiché si l\'enfant est bloqué)</p>' +
    '<textarea id="champIndiceSupplementaire" rows="2" placeholder="Optionnel"></textarea>' +
    (estNouvelleVariante ? '' :
      '<label class="etiquette-case">' +
      '<input type="checkbox" id="champEstDerniere"> C\'est la dernière énigme (le trésor final)' +
      '</label>' +
      '<div id="zoneMessageVictoire" style="display:none;">' +
      '<p class="champ-titre">Message de victoire</p>' +
      '<textarea id="champMessageVictoire" rows="2" placeholder="Ex : Bravo, tu as trouvé le trésor !"></textarea>' +
      '</div>') +
    '<button type="button" id="boutonEnregistrer">Enregistrer</button>' +
    '<button type="button" id="boutonAnnulerFormulaire" class="bouton-secondaire">Annuler</button>' +
    '<p class="message-erreur" id="messageErreurFormulaire"></p>';

  if (estModification) {
    document.getElementById('champQuestion').value = enigmeExistante.question || '';
    document.getElementById('champReponse').value = enigmeExistante.reponseAttendue || '';
    document.getElementById('champIndice').value = enigmeExistante.indice || '';
    document.getElementById('champIndiceSupplementaire').value = enigmeExistante.indiceSupplementaire || '';
    if (enigmeExistante.estDerniere) {
      document.getElementById('champEstDerniere').checked = true;
      document.getElementById('zoneMessageVictoire').style.display = '';
      document.getElementById('champMessageVictoire').value = enigmeExistante.recompense || '';
    }
  }

  var champEstDerniere = document.getElementById('champEstDerniere');
  if (champEstDerniere) {
    champEstDerniere.addEventListener('change', function () {
      document.getElementById('zoneMessageVictoire').style.display = this.checked ? '' : 'none';
    });
  }

  document.getElementById('boutonAnnulerFormulaire').addEventListener('click', afficherEspaceClient);
  document.getElementById('boutonEnregistrer').addEventListener('click', function () {
    soumettreFormulaire(estModification ? enigmeExistante : null, estNouvelleVariante ? idPourNouvelleVariante : null);
  });
}

function soumettreFormulaire(enigmeExistante, idPourNouvelleVariante) {
  var estModification = !!enigmeExistante;
  var question = document.getElementById('champQuestion').value.trim();
  var reponse = document.getElementById('champReponse').value.trim();
  var indice = document.getElementById('champIndice').value.trim();
  var indiceSupplementaire = document.getElementById('champIndiceSupplementaire').value.trim();
  var erreur = document.getElementById('messageErreurFormulaire');
  var bouton = document.getElementById('boutonEnregistrer');

  var estDerniere = false;
  var messageVictoire = '';
  var champEstDerniere = document.getElementById('champEstDerniere');
  if (champEstDerniere) {
    estDerniere = champEstDerniere.checked;
    messageVictoire = document.getElementById('champMessageVictoire').value.trim();
  }

  if (!question || !reponse) {
    erreur.textContent = 'La question et la réponse sont obligatoires.';
    return;
  }
  if (estDerniere && !messageVictoire) {
    erreur.textContent = 'Ajoute un message de victoire pour l\'énigme finale.';
    return;
  }

  bouton.disabled = true;
  erreur.textContent = '';

  var params = {
    client: CLIENT_ID,
    pin: pinCourant,
    question: question,
    reponse: reponse,
    indice: indice,
    indiceSupplementaire: indiceSupplementaire,
    estDerniere: estDerniere ? 'true' : 'false',
    messageVictoire: messageVictoire
  };

  var action;
  if (estModification) {
    action = 'adminModifierEnigme';
    params.id = enigmeExistante.id;
    params.categorie = enigmeExistante.categorie;
  } else {
    action = 'adminAjouterEnigme';
    params.categorie = document.getElementById('champCategorie').value;
    if (idPourNouvelleVariante) params.idExistant = idPourNouvelleVariante;
  }

  appelerApi(action, params)
    .then(function (resultat) {
      bouton.disabled = false;
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Erreur, réessaie.';
        return;
      }
      rafraichirEtRevenir(resultat.avertissement);
    })
    .catch(function () {
      bouton.disabled = false;
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

function supprimerEnigme(id, categorie) {
  var confirme = window.confirm('Supprimer cette variante ? Si c\'était la seule catégorie de cet emplacement, il disparaît entièrement et les suivants se renumérotent automatiquement.');
  if (!confirme) return;

  appelerApi('adminSupprimerEnigme', { client: CLIENT_ID, pin: pinCourant, id: id, categorie: categorie })
    .then(function (resultat) {
      if (!resultat.success) {
        window.alert(resultat.message || 'Erreur, réessaie.');
        return;
      }
      rafraichirEtRevenir(null);
    })
    .catch(function () {
      window.alert('Petit souci technique, réessaie dans un instant.');
    });
}

function rafraichirEtRevenir(avertissement) {
  appelerApi('adminListerEnigmes', { client: CLIENT_ID, pin: pinCourant })
    .then(function (resultat) {
      if (resultat.success) {
        enigmesCourantes = resultat.enigmes;
        categoriesActuelles = resultat.categoriesDisponibles || categoriesActuelles;
      }
      afficherEspaceClient();
      if (avertissement) {
        var zoneErreur = document.getElementById('messageErreurEspace');
        if (zoneErreur) zoneErreur.textContent = avertissement;
      }
    });
}

// ---------------------------------------------------------------------
// TÉLÉCHARGER LES QR CODES (PDF)
// ---------------------------------------------------------------------

function telechargerPdf() {
  var bouton = document.getElementById('boutonPdf');
  var erreur = document.getElementById('messageErreurEspace');
  var succes = document.getElementById('messageSuccesEspace');

  if (enigmesCourantes.length === 0) {
    erreur.textContent = 'Ajoute au moins une énigme avant de générer tes QR codes.';
    return;
  }

  bouton.disabled = true;
  bouton.textContent = 'Génération en cours...';
  erreur.textContent = '';
  succes.style.display = 'none';

  appelerApi('adminGenererPdf', { client: CLIENT_ID, pin: pinCourant })
    .then(function (resultat) {
      bouton.disabled = false;
      bouton.textContent = '📄 Télécharger mes QR codes';
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Erreur pendant la génération.';
        return;
      }
      succes.style.display = '';
      succes.innerHTML = 'PDF prêt : <a href="' + resultat.urlPdf + '" target="_blank">ouvrir le PDF</a>';
    })
    .catch(function () {
      bouton.disabled = false;
      bouton.textContent = '📄 Télécharger mes QR codes';
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

// ---------------------------------------------------------------------
// UTILITAIRES
// ---------------------------------------------------------------------

function escapeHtml(texte) {
  var div = document.createElement('div');
  div.textContent = texte == null ? '' : texte;
  return div.innerHTML;
}
