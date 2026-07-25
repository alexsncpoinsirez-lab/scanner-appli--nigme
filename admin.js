// URL_API vient de config.js (chargé avant ce fichier dans admin.html).

var carte = document.getElementById('carte');
var CLIENT_ID = new URLSearchParams(location.search).get('client') || '';
var pinCourant = null;
var enigmesCourantes = [];
var infosClient = null;

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
    '<button type="button" id="boutonAjouter" class="bouton-secondaire">+ Ajouter une énigme</button>' +
    '<button type="button" id="boutonPdf">📄 Télécharger mes QR codes</button>' +
    '<p class="message-erreur" id="messageErreurEspace"></p>' +
    '<p class="message-succes" id="messageSuccesEspace" style="display:none;"></p>';

  afficherListeEnigmes();

  document.getElementById('boutonAjouter').addEventListener('click', function () {
    afficherFormulaire(null);
  });
  document.getElementById('boutonPdf').addEventListener('click', telechargerPdf);
}

function afficherListeEnigmes() {
  var zone = document.getElementById('listeEnigmes');
  if (!zone) return;

  if (enigmesCourantes.length === 0) {
    zone.innerHTML = '<p class="question" style="font-size:16px;">Tu n\'as pas encore d\'énigme. Clique sur "+ Ajouter une énigme" pour commencer.</p>';
    return;
  }

  zone.innerHTML = enigmesCourantes.map(function (enigme) {
    return (
      '<div class="carte-enigme" data-id="' + escapeHtml(enigme.id) + '">' +
      '<div class="carte-enigme-entete">' +
      '<span class="carte-enigme-numero">Énigme ' + enigme.ordre + '</span>' +
      (enigme.estDerniere ? '<span class="badge-derniere">🏆 Dernière énigme</span>' : '') +
      '</div>' +
      '<p class="carte-enigme-question">' + escapeHtml(enigme.question) + '</p>' +
      '<p class="carte-enigme-detail"><strong>Réponse :</strong> ' + escapeHtml(enigme.reponseAttendue) + '</p>' +
      (enigme.indice ? '<p class="carte-enigme-detail"><strong>Lieu du prochain QR :</strong> ' + escapeHtml(enigme.indice) + '</p>' : '') +
      (enigme.recompense ? '<p class="carte-enigme-detail"><strong>Message de victoire :</strong> ' + escapeHtml(enigme.recompense) + '</p>' : '') +
      '<div class="carte-enigme-actions">' +
      '<button type="button" class="bouton-secondaire bouton-modifier">Modifier</button>' +
      '<button type="button" class="bouton-secondaire bouton-supprimer">Supprimer</button>' +
      '</div>' +
      '</div>'
    );
  }).join('');

  var cartes = zone.querySelectorAll('.carte-enigme');
  cartes.forEach(function (carteEl) {
    var id = carteEl.getAttribute('data-id');
    carteEl.querySelector('.bouton-modifier').addEventListener('click', function () {
      var enigme = enigmesCourantes.filter(function (e) { return e.id === id; })[0];
      if (enigme) afficherFormulaire(enigme);
    });
    carteEl.querySelector('.bouton-supprimer').addEventListener('click', function () {
      supprimerEnigme(id);
    });
  });
}

// ---------------------------------------------------------------------
// FORMULAIRE AJOUT / MODIFICATION
// ---------------------------------------------------------------------

function afficherFormulaire(enigmeExistante) {
  var estModification = !!enigmeExistante;

  carte.innerHTML =
    '<h1>' + (estModification ? '✏️ Modifier l\'énigme' : '➕ Nouvelle énigme') + '</h1>' +
    '<p class="champ-titre">Question</p>' +
    '<textarea id="champQuestion" rows="3" placeholder="Ex : Je vole sans ailes, je pleure sans yeux. Qui suis-je ?"></textarea>' +
    '<p class="champ-titre">Réponse attendue</p>' +
    '<input type="text" id="champReponse" placeholder="Ex : nuage" autocomplete="off">' +
    '<p class="champ-titre">Où trouver le prochain QR code ?</p>' +
    '<textarea id="champIndice" rows="2" placeholder="Ex : Va voir sous le paillasson de la porte d\'entrée"></textarea>' +
    '<p class="champ-titre">Coup de pouce (optionnel, affiché si l\'enfant est bloqué)</p>' +
    '<textarea id="champIndiceSupplementaire" rows="2" placeholder="Optionnel"></textarea>' +
    '<label class="etiquette-case">' +
    '<input type="checkbox" id="champEstDerniere"> C\'est la dernière énigme (le trésor final)' +
    '</label>' +
    '<div id="zoneMessageVictoire" style="display:none;">' +
    '<p class="champ-titre">Message de victoire</p>' +
    '<textarea id="champMessageVictoire" rows="2" placeholder="Ex : Bravo, tu as trouvé le trésor !"></textarea>' +
    '</div>' +
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

  document.getElementById('champEstDerniere').addEventListener('change', function () {
    document.getElementById('zoneMessageVictoire').style.display = this.checked ? '' : 'none';
  });

  document.getElementById('boutonAnnulerFormulaire').addEventListener('click', afficherEspaceClient);
  document.getElementById('boutonEnregistrer').addEventListener('click', function () {
    soumettreFormulaire(estModification ? enigmeExistante.id : null);
  });
}

function soumettreFormulaire(idEnModification) {
  var question = document.getElementById('champQuestion').value.trim();
  var reponse = document.getElementById('champReponse').value.trim();
  var indice = document.getElementById('champIndice').value.trim();
  var indiceSupplementaire = document.getElementById('champIndiceSupplementaire').value.trim();
  var estDerniere = document.getElementById('champEstDerniere').checked;
  var messageVictoire = document.getElementById('champMessageVictoire').value.trim();
  var erreur = document.getElementById('messageErreurFormulaire');
  var bouton = document.getElementById('boutonEnregistrer');

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

  var action = idEnModification ? 'adminModifierEnigme' : 'adminAjouterEnigme';
  if (idEnModification) params.id = idEnModification;

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

function supprimerEnigme(id) {
  var confirme = window.confirm('Supprimer cette énigme ? Les énigmes suivantes seront renumérotées automatiquement.');
  if (!confirme) return;

  appelerApi('adminSupprimerEnigme', { client: CLIENT_ID, pin: pinCourant, id: id })
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
