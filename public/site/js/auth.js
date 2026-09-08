/* ==========================================================================
   Roxwood Network — Espace membre, connexion Discord (OAuth2)
   --------------------------------------------------------------------------
   Flux « implicite » : le navigateur envoie la personne chez Discord, Discord
   la renvoie ici avec un jeton d'accès dans le fragment d'URL. Aucun secret —
   c'est le seul flux OAuth2 utilisable sur un hébergement strictement statique
   comme GitHub Pages.

   La vérification, elle, ne se fait PAS ici : le jeton est transmis à l'API du
   bot, qui demande à Discord qui est cette personne puis contrôle, avec le
   jeton du bot qui fait autorité, son appartenance au serveur et ses rôles. Le
   navigateur ne se déclare jamais lui-même membre ou staff.

   Conséquence utile : la connexion ne demande que le scope `identify`. Le site
   n'a pas besoin de lire la liste des serveurs du visiteur.

   Le jeton est conservé en sessionStorage pour la durée de l'onglet, parce que
   chaque appel à l'API doit le porter. C'est un compromis assumé d'un site
   statique : il disparaît à la fermeture de l'onglet, n'est jamais envoyé
   ailleurs qu'à Discord et à l'API, et ne donne accès qu'à ce que l'API accepte
   de servir à cette personne.
   ========================================================================== */

(function () {
  "use strict";

  var CFG = window.ROXWOOD_DISCORD || {};
  var SESSION_KEY = "roxwood_session";
  var STATE_KEY = "roxwood_oauth_state";
  var SNOWFLAKE = /^\d{15,25}$/;

  /* ---------- Configuration ---------- */

  function isConfigured() {
    return SNOWFLAKE.test(CFG.clientId || "") && SNOWFLAKE.test(CFG.guildId || "") && !!CFG.apiBase;
  }

  // Discord compare l'URL de redirection au caractère près : on la reconstruit sans
  // query ni fragment pour qu'elle corresponde à celle déclarée dans le portail.
  function redirectUri() {
    var path = window.location.pathname;
    if (path.slice(-1) === "/") path += "membres.html";
    return window.location.origin + path;
  }

  /* ---------- Session (onglet courant uniquement) ---------- */

  function saveSession(session) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      /* navigation privée ou stockage refusé : la session vit le temps de la page */
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(STATE_KEY);
    } catch (e) {
      /* rien à faire */
    }
    return null;
  }

  function getSession() {
    var raw;
    try {
      raw = sessionStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    var session;
    try {
      session = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!session || !session.id || !session.at || !session.token) return null;

    // Deux échéances : la nôtre, et celle que Discord a fixée pour le jeton.
    var maxAge = (Number(CFG.sessionHours) || 8) * 3600 * 1000;
    if (Date.now() - session.at > maxAge) return clearSession();
    if (session.expiresAt && Date.now() > session.expiresAt) return clearSession();
    return session;
  }

  /* ---------- Appels à l'API ---------- */

  function apiFetch(path) {
    var session = getSession();
    if (!session) return Promise.reject(new Error("no_session"));

    return fetch(CFG.apiBase + path, {
      headers: { Authorization: "Bearer " + session.token },
    }).then(function (res) {
      return res.json().then(
        function (body) {
          if (res.ok) return body;
          var error = new Error((body && body.error) || "http_" + res.status);
          error.status = res.status;
          error.code = body && body.error;
          throw error;
        },
        function () {
          var error = new Error("http_" + res.status);
          error.status = res.status;
          throw error;
        },
      );
    });
  }

  /* ---------- Lecture du retour de Discord ---------- */

  function randomState() {
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map
      .call(bytes, function (b) {
        return ("0" + b.toString(16)).slice(-2);
      })
      .join("");
  }

  function readFragment() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash) return null;
    var params = new URLSearchParams(hash);
    if (!params.get("access_token") && !params.get("error")) return null;

    // Le jeton ne doit pas rester dans la barre d'adresse, l'historique ou
    // l'en-tête Referer des requêtes suivantes.
    history.replaceState(null, "", window.location.pathname + window.location.search);

    return {
      token: params.get("access_token"),
      expiresIn: Number(params.get("expires_in")) || 0,
      error: params.get("error"),
      errorDescription: params.get("error_description"),
      state: params.get("state"),
    };
  }

  /* ---------- Page « Espace membre » ---------- */

  function initLogin() {
    var root = document.querySelector("[data-login]");
    if (!root) return;

    var startBtn = root.querySelector("[data-login-start]");
    var invite = root.querySelector("[data-login-invite]");
    var statusEl = root.querySelector("[data-login-status]");
    var errorBox = root.querySelector(".alert--error");
    var okBox = root.querySelector(".alert--ok");

    function show(el) {
      if (el) el.hidden = false;
    }
    function hide(el) {
      if (el) el.hidden = true;
    }
    function setStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }
    function fail(message, withInvite) {
      hide(startBtn);
      okBox.classList.remove("is-visible");
      errorBox.textContent = message;
      errorBox.classList.add("is-visible");
      if (withInvite) show(invite);
      else show(startBtn);
      setStatus("Connexion refusée");
    }

    if (invite && CFG.invite) invite.href = CFG.invite;

    // Déjà connecté dans cet onglet : on ne redemande rien.
    if (getSession()) {
      window.location.replace("dashboard.html");
      return;
    }

    if (!isConfigured()) {
      hide(startBtn);
      setStatus("Connexion indisponible");
      errorBox.textContent =
        "La connexion Discord n'est pas encore configurée : renseignez clientId, guildId et apiBase dans js/discord-config.js.";
      errorBox.classList.add("is-visible");
      return;
    }

    var incoming = readFragment();

    if (incoming && incoming.error) {
      fail(
        incoming.error === "access_denied"
          ? "Autorisation refusée côté Discord. Relancez la connexion pour réessayer."
          : "Discord a refusé la connexion (" + (incoming.errorDescription || incoming.error) + ").",
        false,
      );
      return;
    }

    if (incoming && incoming.token) {
      var expected;
      try {
        expected = sessionStorage.getItem(STATE_KEY);
        sessionStorage.removeItem(STATE_KEY);
      } catch (e) {
        expected = null;
      }

      if (!expected || expected !== incoming.state) {
        fail("Réponse Discord non vérifiable (jeton d'état invalide). Relancez la connexion depuis cette page.", false);
        return;
      }

      hide(startBtn);
      setStatus("Vérification en cours");
      okBox.textContent = "Compte Discord reconnu — vérification de votre accès…";
      okBox.classList.add("is-visible");

      var expiresAt = incoming.expiresIn ? Date.now() + incoming.expiresIn * 1000 : null;

      // Session provisoire : `apiFetch` a besoin du jeton pour interroger /api/me.
      saveSession({
        v: 2,
        id: "pending",
        name: "",
        avatar: null,
        role: "",
        isStaff: false,
        sections: [],
        token: incoming.token,
        at: Date.now(),
        expiresAt: expiresAt,
      });

      apiFetch("/api/me")
        .then(function (me) {
          var labels = CFG.roleLabels || {};
          saveSession({
            v: 2,
            id: me.id,
            name: me.name,
            avatar: me.avatarUrl,
            role: me.isStaff ? labels.staff || "Staff" : labels.member || "Membre",
            isStaff: me.isStaff,
            sections: me.sections || [],
            token: incoming.token,
            at: Date.now(),
            expiresAt: expiresAt,
          });
          okBox.textContent = "Bienvenue " + me.name + " — ouverture de votre espace…";
          setStatus("Connecté");
          setTimeout(function () {
            window.location.replace("dashboard.html");
          }, 700);
        })
        .catch(function (err) {
          clearSession();
          var code = err && err.code;
          if (code === "not_member") {
            fail(
              "Compte reconnu, mais vous n'êtes pas encore membre de « " +
                (CFG.guildName || "notre serveur") +
                " ». Rejoignez-le, puis relancez la connexion.",
              true,
            );
            return;
          }
          if (code === "invalid_token") {
            fail("Le jeton Discord a été refusé. Relancez la connexion.", false);
            return;
          }
          if (code === "rate_limited") {
            fail("Discord limite temporairement les requêtes. Réessayez dans une minute.", false);
            return;
          }
          if (code === "discord_unreachable" || code === "guild_not_configured" || (err && err.status === 503)) {
            fail("Le service d'authentification est momentanément indisponible. Réessayez dans un instant.", false);
            return;
          }
          fail("La vérification a échoué. Réessayez, et signalez-le si le problème persiste.", false);
        });
      return;
    }

    // État initial : on attend le clic.
    setStatus("Authentification par Discord");
    if (startBtn) {
      startBtn.addEventListener("click", function () {
        var state = randomState();
        try {
          sessionStorage.setItem(STATE_KEY, state);
        } catch (e) {
          fail("Le stockage de session est bloqué par votre navigateur : la connexion ne peut pas être sécurisée.", false);
          return;
        }

        var params = new URLSearchParams({
          client_id: CFG.clientId,
          redirect_uri: redirectUri(),
          response_type: "token",
          // `identify` suffit : c'est l'API, avec le jeton du bot, qui établit
          // l'appartenance au serveur et les rôles.
          scope: "identify",
          state: state,
          prompt: "consent",
        });
        window.location.href = "https://discord.com/oauth2/authorize?" + params.toString();
      });
    }
  }

  /* ---------- Garde du tableau de bord ---------- */

  function initDashboardGuard() {
    var root = document.querySelector("[data-dashboard]");
    if (!root) return;

    if (!getSession()) {
      window.location.replace("membres.html");
      return;
    }

    var out = root.querySelector("[data-logout]");
    if (out) {
      out.addEventListener("click", function () {
        clearSession();
        window.location.href = "membres.html";
      });
    }
  }

  // Expose le strict nécessaire à dashboard.js : la session et l'appel authentifié.
  window.RoxwoodAuth = {
    getSession: getSession,
    clearSession: clearSession,
    apiFetch: apiFetch,
  };

  document.addEventListener("DOMContentLoaded", function () {
    initLogin();
    initDashboardGuard();
  });
})();
