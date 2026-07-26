// URL_API vient de config.js (chargé avant ce fichier dans quiz.html).
// Mode quiz multijoueur (V8) : chaque joueur répond aux mêmes questions, à son
// rythme, sur son propre téléphone. Voir Code.gs pour le détail du fonctionnement
// (une seule manche active à la fois par parcours, classement calculé à la volée).

var carte = document.getElementById('carte');
var CLIENT_ID = new URLSearchParams(location.search).get('client') || '';
var CLE_PLAYER_ID = 'chasseQuiz_playerId_' + CLIENT_ID;
var CLE_PSEUDO = 'chasseQuiz_pseudo_' + CLIENT_ID;
var PLAYER_ID = localStorage.getItem(CLE_PLAYER_ID) || '';
var PSEUDO = localStorage.getItem(CLE_PSEUDO) || '';
var debutQuestionMs = null;

demarrer();

// ---------------------------------------------------------------------
// APPEL DE L'API
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
// AIGUILLAGE PRINCIPAL
// ---------------------------------------------------------------------

function demarrer() {
  if (!CLIENT_ID) {
    carte.innerHTML =
      '<div class="etat">' +
      '<span class="emoji">❓</span>' +
      '<p>Lien invalide ou incomplet. Demande un nouveau lien à l\'organisateur.</p>' +
      '</div>';
    return;
  }

  if (!PSEUDO) {
    afficherEcranPseudo();
    return;
  }

  demarrerQuiz();
}

// ---------------------------------------------------------------------
// ÉCRAN PSEUDO (une seule fois par téléphone, réutilisé aux prochaines manches)
// ---------------------------------------------------------------------

function afficherEcranPseudo() {
  carte.innerHTML =
    '<h1>🏆 Quiz</h1>' +
    '<p class="question">Choisis un pseudo pour rejoindre la partie (pas besoin du vrai prénom).</p>' +
    '<input type="text" id="champPseudo" placeholder="Ton pseudo" autocomplete="off">' +
    '<button type="button" id="boutonRejoindre">Rejoindre</button>' +
    '<p class="message-erreur" id="messageErreurPseudo"></p>';

  document.getElementById('boutonRejoindre').addEventListener('click', validerPseudo);
  document.getElementById('champPseudo').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') validerPseudo();
  });
}

function validerPseudo() {
  var champ = document.getElementById('champPseudo');
  var erreur = document.getElementById('messageErreurPseudo');
  var pseudo = champ.value.trim();

  if (!pseudo) {
    erreur.textContent = 'Choisis un pseudo pour continuer.';
    return;
  }

  if (!PLAYER_ID) {
    PLAYER_ID = 'quiz-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(CLE_PLAYER_ID, PLAYER_ID);
  }
  PSEUDO = pseudo;
  localStorage.setItem(CLE_PSEUDO, pseudo);

  demarrerQuiz();
}

// ---------------------------------------------------------------------
// ÉTAT DU JOUEUR (question à afficher, ou terminé, ou aucune manche)
// ---------------------------------------------------------------------

function demarrerQuiz() {
  carte.innerHTML = '<div class="etat"><p>Chargement<span class="points-chargement"><span>.</span><span>.</span><span>.</span></span></p></div>';

  appelerApi('quizEtatJoueur', { client: CLIENT_ID, playerId: PLAYER_ID })
    .then(function (etat) {
      if (etat.statut === 'introuvable') {
        carte.innerHTML =
          '<div class="etat"><span class="emoji">❓</span><p>Lien invalide. Demande un nouveau lien à l\'organisateur.</p></div>';
        return;
      }
      if (etat.statut === 'aucuneManche') {
        afficherAucuneManche();
        return;
      }
      if (etat.statut === 'termine') {
        afficherEcranFin(etat.score, etat.nombreQuestions);
        return;
      }
      afficherQuestion(etat);
    })
    .catch(afficherErreurTechnique);
}

function afficherAucuneManche() {
  carte.innerHTML =
    '<div class="etat">' +
    '<span class="emoji">⏳</span>' +
    '<p>Aucune partie en cours pour l\'instant. Demande à l\'organisateur de démarrer une manche.</p>' +
    '</div>' +
    '<button type="button" id="boutonReessayer" class="bouton-secondaire">Réessayer</button>' +
    '<button type="button" id="boutonVoirClassementVide" class="bouton-secondaire">🏆 Voir le classement</button>';

  document.getElementById('boutonReessayer').addEventListener('click', demarrerQuiz);
  document.getElementById('boutonVoirClassementVide').addEventListener('click', afficherClassement);
}

// ---------------------------------------------------------------------
// QUESTION EN COURS (avec chrono)
// ---------------------------------------------------------------------

function afficherQuestion(etat) {
  carte.innerHTML =
    '<h1>🏆 Question ' + (etat.indexQuestion + 1) + ' / ' + etat.nombreQuestions + '</h1>' +
    '<p class="question">' + escapeHtml(etat.question) + '</p>' +
    '<input type="text" id="champReponseQuiz" placeholder="Ta réponse..." autocomplete="off" autocapitalize="off">' +
    '<button type="button" id="boutonValiderQuiz">Valider</button>' +
    '<p class="message-erreur" id="messageErreurQuiz"></p>' +
    '<div class="pied-changement-joueur">' +
    '<button type="button" id="boutonClassementDiscret" class="bouton-lien">🏆 Voir le classement</button>' +
    '</div>';

  debutQuestionMs = performance.now();

  document.getElementById('champReponseQuiz').focus();
  document.getElementById('boutonValiderQuiz').addEventListener('click', function () {
    validerReponseQuiz(etat.indexQuestion);
  });
  document.getElementById('champReponseQuiz').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') validerReponseQuiz(etat.indexQuestion);
  });
  document.getElementById('boutonClassementDiscret').addEventListener('click', afficherClassement);
}

function validerReponseQuiz(indexQuestion) {
  var champ = document.getElementById('champReponseQuiz');
  var bouton = document.getElementById('boutonValiderQuiz');
  var erreur = document.getElementById('messageErreurQuiz');
  var reponse = champ.value;

  if (!reponse.trim()) return;

  var temps = debutQuestionMs ? (performance.now() - debutQuestionMs) / 1000 : 0;

  bouton.disabled = true;
  erreur.textContent = '';

  appelerApi('quizRepondre', {
    client: CLIENT_ID,
    playerId: PLAYER_ID,
    pseudo: PSEUDO,
    index: indexQuestion,
    reponse: reponse,
    temps: temps.toFixed(1)
  })
    .then(function (resultat) {
      bouton.disabled = false;
      if (!resultat.success) {
        erreur.textContent = resultat.message || 'Erreur, réessaie.';
        return;
      }
      afficherRetourReponse(resultat);
    })
    .catch(function () {
      bouton.disabled = false;
      erreur.textContent = 'Petit souci technique, réessaie dans un instant.';
    });
}

/**
 * Petit flash "✅/❌" puis retour à demarrerQuiz(), qui relit l'état complet du
 * joueur et affiche automatiquement soit la question suivante, soit l'écran de
 * fin avec le bon score — pas besoin de dupliquer cette logique ici.
 */
function afficherRetourReponse(resultat) {
  var emoji = resultat.correct ? '✅' : '❌';
  var texte = resultat.correct ? 'Bonne réponse !' : 'Ce n\'était pas ça.';

  carte.innerHTML = '<div class="etat"><span class="emoji">' + emoji + '</span><p>' + texte + '</p></div>';

  setTimeout(demarrerQuiz, 900);
}

// ---------------------------------------------------------------------
// ÉCRAN DE FIN
// ---------------------------------------------------------------------

function afficherEcranFin(score, nombreQuestions) {
  var texteScore = (nombreQuestions != null)
    ? score + ' / ' + nombreQuestions + ' bonnes réponses'
    : score + ' bonnes réponses';

  carte.innerHTML =
    '<div class="etat">' +
    '<span class="emoji">🏁</span>' +
    '<h1 class="titre-victoire">C\'est terminé, ' + escapeHtml(PSEUDO) + ' !</h1>' +
    '<div class="message-victoire">' + escapeHtml(texteScore) + '</div>' +
    '</div>' +
    '<button type="button" id="boutonVoirClassement">🏆 Voir le classement</button>';

  document.getElementById('boutonVoirClassement').addEventListener('click', afficherClassement);
}

// ---------------------------------------------------------------------
// CLASSEMENT
// ---------------------------------------------------------------------

function afficherClassement() {
  carte.innerHTML = '<div class="etat"><p>Chargement<span class="points-chargement"><span>.</span><span>.</span><span>.</span></span></p></div>';

  appelerApi('quizClassement', { client: CLIENT_ID })
    .then(function (resultat) {
      if (!resultat.success) {
        carte.innerHTML =
          '<div class="etat"><span class="emoji">⏳</span><p>' + escapeHtml(resultat.message || 'Aucun classement pour l\'instant.') + '</p></div>' +
          '<button type="button" id="boutonRetourClassement" class="bouton-secondaire">← Retour</button>';
        document.getElementById('boutonRetourClassement').addEventListener('click', demarrerQuiz);
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
        '<h1>🏆 Classement</h1>' +
        (resultat.classement.length ? lignes : '<p class="question" style="font-size:16px;">Personne n\'a encore répondu.</p>') +
        '<button type="button" id="boutonActualiserClassement" class="bouton-secondaire">Actualiser</button>' +
        '<button type="button" id="boutonRetourClassement" class="bouton-secondaire">← Retour</button>';

      document.getElementById('boutonActualiserClassement').addEventListener('click', afficherClassement);
      document.getElementById('boutonRetourClassement').addEventListener('click', demarrerQuiz);
    })
    .catch(afficherErreurTechnique);
}

// ---------------------------------------------------------------------
// UTILITAIRES
// ---------------------------------------------------------------------

function afficherErreurTechnique() {
  carte.innerHTML =
    '<div class="etat"><span class="emoji">⚠️</span><p>Petit souci technique, réessaie dans un instant.</p></div>' +
    '<button type="button" id="boutonReessayerTechnique">Réessayer</button>';
  document.getElementById('boutonReessayerTechnique').addEventListener('click', demarrerQuiz);
}

function escapeHtml(texte) {
  var div = document.createElement('div');
  div.textContent = texte == null ? '' : texte;
  return div.innerHTML;
}
