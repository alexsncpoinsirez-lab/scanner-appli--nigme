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
    '<button type="button" id="boutonParametres" class="bouton-secondaire">⚙️ Paramètres</button>' +
    '<button type="button" id="boutonPdf">📄 Télécharger mes QR codes</button>' +
    '<p class="message-erreur" id="messageErreurEspace"></p>' +
    '<p class="message-succes" id="messageSuccesEspace" style="display:none;"></p>';

  afficherListeEnigmes();

  document.getElementById('boutonAjouter').addEventListener('click', function () {
    afficherFormulaire(null, null);
  });
  document.getElementById('boutonParametres').addEventListener('click', afficherParametres);
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
