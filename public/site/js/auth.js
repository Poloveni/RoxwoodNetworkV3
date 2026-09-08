/* ==========================================================================
   Roxwood Network — Espace membre, connexion Discord (OAuth2)
   --------------------------------------------------------------------------
   Flux « implicite » : le navigateur envoie la personne chez Discord, Discord
   la renvoie ici avec un jeton d'accès dans le fragment d'URL. Aucun serveur,
   aucun secret — c'est le seul flux OAuth2 utilisable sur un hébergement
   strictement statique comme GitHub Pages.

   Ce que ce fichier garantit :
     - l'identité affichée est réellement celle du compte Discord ;
     - l'appartenance au serveur est réellement vérifiée auprès de Discord ;
     - le jeton n'est jamais stocké : il sert à la vérification puis disparaît.

   Ce que ce fichier NE garantit PAS, et ne peut pas garantir ici :
     dashboard.html reste un fichier public servi par GitHub Pages. Quiconque
     connaît l'URL peut le télécharger sans passer par Discord. La connexion
     décide de CE QUI EST AFFICHÉ, pas de ce qui est téléchargeable. Tant que
     le tableau de bord ne contient que du contenu de vitrine, c'est sans
     conséquence. Le jour où de vraies données sensibles y passent, il faudra
     un backend (Edge Function Supabase ou Worker) qui les serve après
     vérification du jeton.
   ========================================================================== */

(function () {
  "use strict";

  var CFG = window.ROXWOOD_DISCORD || {};
  var API = "https://discord.com/api/v10";
  var SESSION_KEY = "roxwood_session";
  var STATE_KEY = "roxwood_oauth_state";
  var SNOWFLAKE = /^\d{15,25}$/;

  /* ---------- Configuration ---------- */

  function isConfigured() {
    return SNOWFLAKE.test(CFG.clientId || "") && SNOWFLAKE.test(CFG.guildId || "");
  }

  function roleEntries() {
    var roles = CFG.roles || {};
    return Object.keys(roles).filter(function (id) {
      return SNOWFLAKE.test(id);
    });
  }

  function scopes() {
    var list = ["identify", "guilds"];
    // Le scope supplémentaire n'est demandé que si un mapping de rôles existe :
    // inutile de réclamer une permission dont on ne se sert pas.
    if (roleEntries().length) list.push("guilds.members.read");
    return list.join(" ");
  }

  // Discord compare l'URL de redirection au caractère près : on la reconstruit
  // sans query ni fragment pour qu'elle corresponde à celle déclarée dans le
  // portail développeur.
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
    if (!session || !session.id || !session.at) return null;

    var maxAge = (Number(CFG.sessionHours) || 8) * 3600 * 1000;
    if (Date.now() - session.at > maxAge) {
      clearSession();
      return null;
    }
    return session;
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(STATE_KEY);
    } catch (e) {
      /* rien à faire */
    }
  }

  /* ---------- Utilitaires Discord ---------- */

  function randomState() {
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map
      .call(bytes, function (b) {
        return ("0" + b.toString(16)).slice(-2);
      })
      .join("");
  }

  function avatarUrl(user) {
    if (user.avatar) {
      var ext = user.avatar.indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + "." + ext + "?size=128";
    }
    // Avatar par défaut : dépend de l'identifiant depuis le passage aux pseudos uniques.
    var index = 0;
    try {
      index = Number((BigInt(user.id) >> BigInt(22)) % BigInt(6));
    } catch (e) {
      index = 0;
    }
    return "https://cdn.discordapp.com/embed/avatars/" + index + ".png";
  }

  function apiGet(path, token) {
    return fetch(API + path, {
      headers: { Authorization: "Bearer " + token },
    }).then(function (res) {
      if (res.status === 401) throw new Error("Session Discord expirée. Reconnectez-vous.");
      if (res.status === 429) throw new Error("Discord limite temporairement les requêtes. Réessayez dans une minute.");
      if (!res.ok) throw new Error("Discord a répondu " + res.status + ".");
      return res.json();
    });
  }

  /* ---------- Vérification d'appartenance ---------- */

  function resolveRole(token) {
    var wanted = roleEntries();
    if (!wanted.length) return Promise.resolve(CFG.defaultRole || "Membre");

    return apiGet("/users/@me/guilds/" + CFG.guildId + "/member", token)
      .then(function (member) {
        var held = member && member.roles ? member.roles : [];
        // L'ordre du mapping fait foi : le premier rôle reconnu gagne.
        for (var i = 0; i < wanted.length; i++) {
          if (held.indexOf(wanted[i]) !== -1) return CFG.roles[wanted[i]];
        }
        return CFG.defaultRole || "Membre";
      })
      .catch(function () {
        // Rôle indisponible : on n'échoue pas la connexion pour autant.
        return CFG.defaultRole || "Membre";
      });
  }

  function verify(token) {
    var user;
    return apiGet("/users/@me", token)
      .then(function (me) {
        user = me;
        return apiGet("/users/@me/guilds", token);
      })
      .then(function (guilds) {
        var member = Array.isArray(guilds) && guilds.some(function (g) {
          return g.id === CFG.guildId;
        });
        if (!member) {
          var err = new Error("not_member");
          err.code = "not_member";
          err.user = user;
          throw err;
        }
        return resolveRole(token);
      })
      .then(function (role) {
        return {
          v: 1,
          id: user.id,
          name: user.global_name || user.username,
          avatar: avatarUrl(user),
          role: role,
          at: Date.now(),
        };
      });
  }

  /* ---------- Lecture du retour de Discord ---------- */

  function readFragment() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash) return null;
    var params = new URLSearchParams(hash);
    if (!params.get("access_token") && !params.get("error")) return null;

    // Le jeton ne doit pas rester dans la barre d'adresse, l'historique
    // ou l'en-tête Referer des requêtes suivantes.
    history.replaceState(null, "", window.location.pathname + window.location.search);

    return {
      token: params.get("access_token"),
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
    var existing = getSession();
    if (existing) {
      window.location.replace("dashboard.html");
      return;
    }

    if (!isConfigured()) {
      hide(startBtn);
      setStatus("Connexion indisponible");
      errorBox.textContent =
        "La connexion Discord n'est pas encore configurée : renseignez clientId et guildId dans js/discord-config.js.";
      errorBox.classList.add("is-visible");
      return;
    }

    var incoming = readFragment();

    if (incoming && incoming.error) {
      var refused = incoming.error === "access_denied";
      fail(
        refused
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
      } catch (e) {
        expected = null;
      }
      try {
        sessionStorage.removeItem(STATE_KEY);
      } catch (e) {
        /* rien à faire */
      }

      if (!expected || expected !== incoming.state) {
        fail("Réponse Discord non vérifiable (jeton d'état invalide). Relancez la connexion depuis cette page.", false);
        return;
      }

      hide(startBtn);
      setStatus("Vérification en cours");
      okBox.textContent = "Compte Discord reconnu — vérification de votre présence sur le serveur…";
      okBox.classList.add("is-visible");

      verify(incoming.token)
        .then(function (session) {
          saveSession(session);
          okBox.textContent = "Bienvenue " + session.name + " — ouverture de votre espace…";
          setStatus("Connecté");
          setTimeout(function () {
            window.location.replace("dashboard.html");
          }, 700);
        })
        .catch(function (err) {
          if (err && err.code === "not_member") {
            fail(
              "Compte reconnu, mais vous n'êtes pas encore membre de « " +
                (CFG.guildName || "notre serveur") +
                " ». Rejoignez-le, puis relancez la connexion.",
              true,
            );
            return;
          }
          fail(err && err.message ? err.message : "La vérification a échoué. Réessayez.", false);
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
          scope: scopes(),
          state: state,
          prompt: "consent",
        });
        window.location.href = "https://discord.com/oauth2/authorize?" + params.toString();
      });
    }
  }

  /* ---------- Page « Tableau de bord » ---------- */

  function initDashboard() {
    var root = document.querySelector("[data-dashboard]");
    if (!root) return;

    var session = getSession();
    if (!session) {
      window.location.replace("membres.html");
      return;
    }

    var nameEl = root.querySelector("[data-user-name]");
    var roleEl = root.querySelector("[data-user-role]");
    var avatarEl = root.querySelector("[data-user-avatar]");

    if (nameEl) nameEl.textContent = session.name;
    if (roleEl) roleEl.textContent = session.role;
    if (avatarEl && session.avatar) {
      avatarEl.src = session.avatar;
      avatarEl.alt = "Avatar Discord de " + session.name;
      avatarEl.hidden = false;
    }

    var out = root.querySelector("[data-logout]");
    if (out) {
      out.addEventListener("click", function () {
        clearSession();
        window.location.href = "membres.html";
      });
    }

    var refresh = root.querySelector("[data-refresh]");
    if (refresh) {
      refresh.addEventListener("click", function () {
        var alertBox = root.querySelector(".alert--ok");
        if (!alertBox) return;
        alertBox.textContent =
          "Flux synchronisé — dernières candidatures, commandes et journaux récupérés depuis le bot.";
        alertBox.classList.add("is-visible");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initLogin();
    initDashboard();
  });
})();
