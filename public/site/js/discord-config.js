/* ==========================================================================
   Roxwood Network — Configuration de l'espace membre
   --------------------------------------------------------------------------
   Ces valeurs sont PUBLIQUES par nature (elles partent dans le navigateur).
   Un client ID, un ID de serveur et une adresse d'API ne sont pas des secrets :
   ils identifient, ils n'autorisent rien. Ne mets JAMAIS le "Client Secret" de
   l'application Discord ici — il n'est pas necessaire au flux utilise.

   La politique d'acces (qui voit le coffre, les factures, les candidatures) ne
   se configure PAS ici : elle vit cote serveur, dans API_STAFF_ROLE_IDS du
   fichier .env du bot. Une regle appliquee dans le navigateur serait purement
   decorative — n'importe qui peut modifier ce fichier une fois telecharge.
   ========================================================================== */

window.ROXWOOD_DISCORD = {
  /* ---------- 1. Identifiants Discord ---------- */

  // Application ID de l'application Discord du bot roxwood-network-entreprise.
  clientId: "1541476885924683919",

  // Serveur dont l'appartenance ouvre l'espace membre.
  guildId: "1533030404817162300",

  /* ---------- 2. API de lecture ---------- */

  // Racine de l'API servie par le bot, derriere Caddy (voir src/http/ du depot du bot).
  // Sans slash final.
  apiBase: "https://roxwoodnetworkv3.duckdns.org",

  /* ---------- 3. Affichage ---------- */

  guildName: "Roxwood Network | Espace Web",
  invite: "https://discord.gg/V4CGhfpn3k",

  // Libelles affiches selon ce que l'API repond dans `isStaff`.
  roleLabels: {
    staff: "Direction",
    member: "Membre",
  },

  /* ---------- 4. Session ---------- */

  // Duree de validite de la session dans l'onglet, en heures.
  sessionHours: 8,
};

/* ==========================================================================
   COMMENT CA MARCHE

   1. Le visiteur clique "Se connecter avec Discord". Le navigateur part chez
      Discord et revient avec un jeton d'acces dans l'URL (flux implicite : le
      seul utilisable sans serveur, et le site est sur GitHub Pages).

   2. Le site envoie ce jeton a SON API (apiBase). C'est l'API qui demande a
      Discord qui est cette personne, puis qui verifie — avec le jeton du bot,
      qui fait autorite — qu'elle est bien membre du serveur et quels roles
      elle detient. Le navigateur ne se declare jamais lui-meme staff.

      C'est pour ca que la connexion ne demande que le scope `identify` : le
      site n'a pas besoin de lire la liste des serveurs du visiteur, le bot
      sait deja.

   3. Chaque section du tableau de bord est ensuite chargee depuis l'API, qui
      refuse celles auxquelles la personne n'a pas droit. Les donnees refusees
      ne quittent pas le serveur.

   --------------------------------------------------------------------------
   SI TU CHANGES DE DOMAINE POUR L'API

   Mets a jour `apiBase` ci-dessus, ET la variable API_ALLOWED_ORIGINS du .env
   du bot si l'adresse du SITE change (pas celle de l'API). Sans ca le
   navigateur bloquera les appels au nom du CORS.

   --------------------------------------------------------------------------
   URL DE REDIRECTION A DECLARER DANS L'APPLICATION DISCORD

   Onglet OAuth2 > Redirects, au caractere pres :

     https://poloveni.github.io/RoxwoodNetworkV3/site/membres.html
     http://localhost:8080/site/membres.html
   ========================================================================== */
