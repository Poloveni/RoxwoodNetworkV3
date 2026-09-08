/* ==========================================================================
   Roxwood Network — Configuration de la connexion Discord
   --------------------------------------------------------------------------
   Ces valeurs sont PUBLIQUES par nature (elles partent dans le navigateur).
   Un client ID et un ID de serveur ne sont pas des secrets : ils identifient,
   ils n'autorisent rien. Ne mets JAMAIS le "Client Secret" de l'application
   Discord dans ce fichier — il n'est pas nécessaire au flux utilisé ici.

   À REMPLIR (voir le pas-à-pas en bas de fichier) :
     1. clientId  — Application ID de l'application Discord DÉJÀ EXISTANTE
                    du bot roxwood-network-entreprise (aucune application
                    supplémentaire à créer)
     2. guildId   — Discord > Paramètres > Avancés > Mode développeur activé,
                    puis clic droit sur le serveur > « Copier l'identifiant »
   ========================================================================== */

window.ROXWOOD_DISCORD = {
  /* ---------- 1. Obligatoire ---------- */

  // Application ID de ton application Discord.
  clientId: "1541476885924683919",

  // Identifiant du serveur dont l'appartenance ouvre l'espace membre.
  // Serveur visé : « Roxwood Network | Espace Web ».
  guildId: "1533030404817162300",

  /* ---------- 2. Affichage ---------- */

  // Nom affiché du serveur dans les messages de l'espace membre.
  guildName: "Roxwood Network | Espace Web",

  // Invitation proposée à qui n'est pas encore sur le serveur.
  invite: "https://discord.gg/V4CGhfpn3k",

  /* ---------- 3. Rôles (optionnel) ---------- */

  // Laisse cet objet VIDE et chaque membre est simplement affiché comme
  // « Membre ». Dès que tu y mets au moins une entrée, la connexion demande
  // en plus le scope guilds.members.read et affiche le libellé du premier
  // rôle reconnu, dans l'ordre de cette liste (le plus haut d'abord).
  //
  // Les clés sont des IDs de rôle : Discord > Paramètres du serveur > Rôles >
  // clic droit sur un rôle > « Copier l'identifiant » (mode développeur actif).
  //
  //   roles: {
  //     "1234567890123456789": "Direction",
  //     "9876543210987654321": "Développeur",
  //     "1122334455667788990": "Client",
  //   },
  roles: {},

  // Libellé de repli quand aucun rôle de la liste ci-dessus ne correspond,
  // ou quand la liste est vide.
  defaultRole: "Membre",

  /* ---------- 4. Session ---------- */

  // Durée de validité de la session dans l'onglet, en heures.
  sessionHours: 8,
};

/* ==========================================================================
   PAS-À-PAS (5 minutes, une seule fois)
   --------------------------------------------------------------------------
   On réutilise l'application Discord du bot roxwood-network-entreprise :
   celle dont l'Application ID est déjà dans CLIENT_ID du .env du VPS. Une
   application Discord peut servir à la fois de bot et de client OAuth2 —
   ce sont deux usages indépendants du même identifiant.

   Ajouter des URL de redirection ne touche NI le token du bot, NI ses
   permissions, NI son comportement sur le serveur. Le bot n'a pas besoin
   d'être redémarré, et rien n'est à modifier dans son dépôt.

   1. https://discord.com/developers/applications > ouvre l'application
      du bot > onglet « OAuth2 » > section « Redirects » > « Add Redirect ».
      Ajoute EXACTEMENT ces URL, une par ligne (l'égalité est stricte :
      un slash ou une majuscule en trop et Discord refuse la connexion) :

        https://poloveni.github.io/RoxwoodNetworkV3/site/membres.html
        http://localhost:8080/site/membres.html

      La seconde ne sert qu'au développement local (npm run dev).
      Clique « Save Changes ».

   2. Sur la même page, copie l'« Application ID » (identique au CLIENT_ID
      du .env du bot) et colle-le dans clientId ci-dessus.

   3. Dans Discord : Paramètres utilisateur > Avancés > active « Mode
      développeur ». Clic droit sur le serveur « Roxwood Network | Espace Web »
      > « Copier l'identifiant » > colle-le dans guildId ci-dessus.

   4. Commit + push : le workflow redéploie tout seul.

   Rien d'autre n'est à configurer : pas de token, pas de secret, aucune
   permission supplémentaire. L'application sert ici uniquement à demander
   « identify » et « guilds » au nom de la personne qui se connecte, et
   l'écran de consentement Discord affichera son nom — donc ta marque.

   --------------------------------------------------------------------------
   POUR PLUS TARD — brancher les vraies données du bot
   --------------------------------------------------------------------------
   Le bot stocke déjà, en PostgreSQL, tout ce qu'affiche le tableau de bord :
   RecruitmentApplication (candidatures), ServiceOrder / OrderItem (commandes
   et factures), AbsenceRequest (absences), MonitoringEvent (journaux).

   Il n'expose en revanche aucun HTTP : c'est un client passerelle Discord,
   ses webhooks sont sortants, et Postgres reste dans le réseau Docker. Pour
   que ce site lise ces données il faudrait, dans l'ordre :
     - un reverse proxy HTTPS devant le VPS (Caddy fait le certificat seul) —
       obligatoire, un site en HTTPS ne peut pas appeler une API en HTTP ;
     - une petite API de lecture dans le bot, qui valide le jeton Discord
       reçu du navigateur et vérifie l'appartenance au serveur avant de
       répondre, avec CORS ouvert pour https://poloveni.github.io.
   C'est un ajout, pas une réécriture : les services de lecture existent déjà.
   ========================================================================== */
