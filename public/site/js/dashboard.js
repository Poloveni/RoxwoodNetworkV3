/* ==========================================================================
   Roxwood Network — Tableau de bord, chargement des données réelles
   --------------------------------------------------------------------------
   Chaque section est chargée indépendamment depuis l'API du bot. Une section
   qui échoue affiche son propre message : elle ne fait jamais tomber la page.

   Les sections auxquelles la personne n'a pas droit sont retirées de la page
   ET de la navigation — mais c'est un confort d'affichage, pas une sécurité :
   la vraie barrière est côté serveur, qui refuse la requête. Masquer ici sans
   refuser là-bas ne protégerait rien.
   ========================================================================== */

(function () {
  "use strict";

  var auth = window.RoxwoodAuth;
  if (!auth) return;

  var root = document.querySelector("[data-dashboard]");
  if (!root) return;

  /* ---------- Libellés ---------- */

  // Les statuts arrivent tels que le bot les stocke ; la traduction est ici,
  // pas dans l'API — le vocabulaire d'affichage n'a pas à voyager sur le réseau.
  var LABELS = {
    PENDING: "En attente",
    INTERVIEW: "Entretien",
    ACCEPTED: "Accepté",
    REJECTED: "Refusé",
    REFUSED: "Refusée",
    PREPARING: "En préparation",
    DELIVERED: "Livrée",
    CANCELLED: "Annulée",
    UNPAID: "Impayée",
    PAID: "Payée",
    OPEN: "Ouvert",
    CLOSED: "Fermé",
    SHIFT: "Prises de service",
    RECRUITMENT: "Embauches & licenciements",
    SAFE: "Mouvements de coffre",
    INVOICE: "Factures",
    SALE: "Ventes run",
  };

  // Couleur de la pastille : cyan par défaut, ambre pour « en cours », gris pour « clos ».
  var TONE = {
    PENDING: "warn",
    INTERVIEW: "warn",
    PREPARING: "warn",
    REJECTED: "off",
    REFUSED: "off",
    CANCELLED: "off",
    UNPAID: "off",
    CLOSED: "off",
  };

  function label(value) {
    return LABELS[value] || value || "—";
  }

  function statusHtml(value) {
    return badge(label(value), TONE[value]);
  }

  /** Pastille libre : `tone` vaut "warn", "off", ou rien pour le cyan par défaut. */
  function badge(text, tone) {
    return '<span class="status' + (tone ? " status--" + tone : "") + '"><i></i>' + escapeHtml(text) + "</span>";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Identifiant Discord brut : affiché comme une donnée technique, pas comme un nom. */
  function userHtml(id) {
    if (!id) return "—";
    return '<span class="tag">' + escapeHtml(id) + "</span>";
  }

  function money(value) {
    if (value == null) return "—";
    return Number(value).toLocaleString("fr-FR") + " $";
  }

  function date(value) {
    if (!value) return "—";
    var d = new Date(value);
    return isNaN(d) ? "—" : d.toLocaleDateString("fr-FR");
  }

  function dateTime(value) {
    if (!value) return "—";
    var d = new Date(value);
    return isNaN(d) ? "—" : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }

  /* ---------- États d'une section ---------- */

  function stateEl(section) {
    return root.querySelector('[data-state="' + section + '"]');
  }

  function setState(section, text, kind) {
    var el = stateEl(section);
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
    el.className = "form-note dash-state" + (kind ? " dash-state--" + kind : "");
  }

  function target(section) {
    return root.querySelector('[data-list="' + section + '"]');
  }

  function fill(section, html, emptyMessage) {
    var el = target(section);
    if (!el) return;
    if (!html) {
      el.innerHTML = "";
      setState(section, emptyMessage || "Rien à afficher pour l'instant.", "empty");
      return;
    }
    el.innerHTML = html;
    setState(section, "");
  }

  /**
   * Charge une section. Un 403 ne devrait pas arriver (la section est masquée
   * en amont), mais on le traite quand même : la politique peut changer côté
   * serveur entre la connexion et le chargement.
   */
  function load(section, path, render) {
    setState(section, "Chargement…", "loading");
    return auth
      .apiFetch(path)
      .then(function (data) {
        render(data);
      })
      .catch(function (err) {
        var code = err && err.code;
        if (code === "forbidden") {
          hideSection(section);
          return;
        }
        if (code === "invalid_token" || err.status === 401) {
          auth.clearSession();
          window.location.replace("membres.html");
          return;
        }
        setState(section, "Impossible de charger cette section pour le moment.", "error");
      });
  }

  function hideSection(section) {
    var el = root.querySelector('[data-section="' + section + '"]');
    if (el) el.hidden = true;
    var nav = root.querySelector('[data-nav="' + section + '"]');
    if (nav) nav.hidden = true;
  }

  /* ---------- Rendu par section ---------- */

  function renderOverview(data) {
    var map = {
      pendingApplications: data.pendingApplications,
      unpaidOrders: data.unpaidOrders,
      pendingAbsences: data.pendingAbsences,
      logs24h: data.logs24h,
    };
    Object.keys(map).forEach(function (key) {
      var card = root.querySelector('[data-kpi="' + key + '"]');
      if (!card) return;
      // `null` = section non autorisée : on retire la carte plutôt que d'afficher zéro.
      if (map[key] == null) {
        card.hidden = true;
        return;
      }
      var value = card.querySelector("strong");
      if (value) value.textContent = map[key];
    });
    setState("overview", "");
  }

  function renderRecruitment(data) {
    var flags = root.querySelector("[data-recruitment-flags]");
    if (flags) {
      flags.innerHTML =
        '<span class="status' + (data.open ? "" : " status--off") + '"><i></i>' +
        (data.open ? "Recrutements ouverts" : "Recrutements fermés") + "</span>" +
        '<span class="status' + (data.acceptedCategoryConfigured ? "" : " status--warn") + '"><i></i>' +
        (data.acceptedCategoryConfigured ? "Catégorie d'acceptation définie" : "Catégorie d'acceptation non définie") + "</span>" +
        '<span class="status' + (data.acceptedRoleConfigured ? "" : " status--warn") + '"><i></i>' +
        (data.acceptedRoleConfigured ? "Rôle d'acceptation défini" : "Rôle d'acceptation non défini") + "</span>";
    }

    fill(
      "recruitment",
      data.applications
        .map(function (a) {
          return (
            "<tr><td>" + userHtml(a.candidateId) + "</td><td>" + statusHtml(a.status) + "</td><td>" +
            userHtml(a.recruiterId) + "</td><td>" +
            (a.attachments.length ? a.attachments.length + " fichier" + (a.attachments.length > 1 ? "s" : "") : "—") +
            "</td><td>" + dateTime(a.updatedAt) + "</td></tr>"
          );
        })
        .join(""),
      "Aucune candidature enregistrée.",
    );
  }

  function renderOrders(data) {
    fill(
      "orders",
      data
        .map(function (o) {
          return (
            "<tr><td>" + (o.invoiceNumber ? "n° " + escapeHtml(o.invoiceNumber) : "—") + "</td><td>" +
            userHtml(o.clientId) + "</td><td>" +
            (o.items.length ? escapeHtml(o.items.map(function (i) { return i.name; }).join(", ")) : "—") +
            "</td><td>" + money(o.total) + "</td><td>" + statusHtml(o.status) + "</td><td>" +
            statusHtml(o.paymentStatus) + "</td></tr>"
          );
        })
        .join(""),
      "Aucune commande enregistrée.",
    );
  }

  function renderCatalog(data) {
    fill(
      "catalog",
      data.items
        .map(function (item) {
          var fields = item.fields.length
            ? item.fields
                .map(function (f) {
                  return escapeHtml(f.label) + (f.style === "QUANTITY" ? ' <span class="tag">Quantité</span>' : "");
                })
                .join(", ")
            : "—";
          return (
            "<tr><td>" + escapeHtml(item.name) + (item.active ? "" : ' <span class="tag">retiré</span>') +
            "</td><td>" + money(item.price) + "</td><td>" +
            (item.weightGrams != null ? Number(item.weightGrams).toLocaleString("fr-FR") + " g" : "—") +
            "</td><td>" + fields + "</td><td>" +
            (item.hasImage ? badge("Définie") : badge("Aucune", "off")) +
            "</td></tr>"
          );
        })
        .join(""),
      "Le catalogue est vide.",
    );

    var shop = root.querySelector("[data-shop]");
    if (shop) {
      var s = data.shop;
      shop.innerHTML =
        '<li><i class="dot"></i><div><b>Profil boutique</b><span>' +
        (s.rib ? "RIB renseigné" : "RIB non renseigné") + " · " +
        (s.phone ? "téléphone renseigné" : "téléphone non renseigné") + " · " +
        (s.hasBanner ? "bannière définie" : "aucune bannière") +
        "</span></div></li>" +
        '<li><i class="dot"></i><div><b>Capacité d\'un camion</b><span>' +
        (s.truckCapacityGrams
          ? Number(s.truckCapacityGrams).toLocaleString("fr-FR") + " g — le nombre de camions apparaît sur les factures."
          : "Non définie : le nombre de camions requis est omis des factures.") +
        "</span></div></li>";
    }
  }

  function renderAbsences(data) {
    fill(
      "absences",
      data
        .map(function (a) {
          return (
            '<li><i class="dot"></i><div><b>' + userHtml(a.requesterId) + " — " + date(a.startDate) +
            (a.endDate && a.endDate !== a.startDate ? " au " + date(a.endDate) : "") +
            "</b><span>" + label(a.status) +
            (a.resolverId ? " par " + escapeHtml(a.resolverId) : "") +
            (a.reason ? " · " + escapeHtml(a.reason) : "") +
            "</span></div></li>"
          );
        })
        .join(""),
      "Aucune demande d'absence.",
    );
  }

  function renderMonitoring(data) {
    var byType = data.last24hByType || {};
    var rows = ["SHIFT", "RECRUITMENT", "SAFE", "INVOICE", "SALE"].map(function (type) {
      var configured = (data.configuredTypes || []).indexOf(type) !== -1;
      return (
        '<li><i class="dot"></i><div><b>' + escapeHtml(label(type)) + " — " + (byType[type] || 0) +
        " sur 24 h</b><span>" +
        (configured ? "Salon configuré." : "Aucun salon configuré pour ce type.") +
        "</span></div></li>"
      );
    });
    fill("monitoring", rows.join(""), null);

    var head = root.querySelector("[data-monitoring-head]");
    if (head) {
      head.innerHTML =
        '<span class="status' + (data.jobConfigured ? "" : " status--warn") + '"><i></i>' +
        (data.jobConfigured ? "Entreprise configurée" : "Entreprise non configurée") + "</span>" +
        '<span class="status' + (data.onDutyRoleConfigured ? "" : " status--warn") + '"><i></i>' +
        (data.onDutyRoleConfigured ? "Rôle en service défini" : "Rôle en service non défini") + "</span>" +
        '<span class="status"><i></i>' + Number(data.storedTotal || 0).toLocaleString("fr-FR") + " logs conservés</span>";
    }
  }

  function renderStorage(data) {
    var stock = data.stock || [];
    fill(
      "storage",
      stock
        .map(function (row) {
          return (
            "<tr><td>" + escapeHtml(row.safeLabel) + "</td><td>" + escapeHtml(row.itemId) +
            "</td><td>" + Number(row.quantity).toLocaleString("fr-FR") + "</td></tr>"
          );
        })
        .join(""),
      "Aucun mouvement de coffre enregistré.",
    );

    var moves = root.querySelector('[data-list="storage-movements"]');
    if (moves) {
      moves.innerHTML = (data.movements || [])
        .map(function (m) {
          var sign = m.direction === "IN" ? "+" : "";
          return (
            "<tr><td>" + escapeHtml(m.safeLabel) + "</td><td>" + escapeHtml(m.itemId) + "</td><td>" +
            '<span class="status' + (m.direction === "IN" ? "" : " status--off") + '"><i></i>' +
            (m.direction === "IN" ? "Dépôt " : "Retrait ") + sign + m.quantity + "</span></td><td>" +
            (m.playerName ? escapeHtml(m.playerName) : userHtml(m.playerDiscordId)) + "</td><td>" +
            dateTime(m.createdAt) + "</td></tr>"
          );
        })
        .join("");
    }
  }

  function renderWebhooks(data) {
    fill(
      "webhooks",
      data
        .map(function (w) {
          var health = w.pendingRetries
            ? '<span class="status status--warn"><i></i>' + w.pendingRetries + " relance" + (w.pendingRetries > 1 ? "s" : "") + "</span>"
            : w.enabled
              ? '<span class="status"><i></i>Actif</span>'
              : '<span class="status status--off"><i></i>Désactivé</span>';
          return (
            '<tr><td><span class="tag">' + escapeHtml(w.eventType) + "</span>" +
            (w.label ? " " + escapeHtml(w.label) : "") + "</td><td>" + escapeHtml(w.targetHost) + "</td><td>" +
            (w.sheetSync ? w.sheetSync.rowsSent + " lignes envoyées" : "—") + "</td><td>" + health + "</td></tr>"
          );
        })
        .join(""),
      "Aucun abonnement webhook configuré.",
    );
  }

  /* ---------- Démarrage ---------- */

  var session = auth.getSession();
  if (!session) return;

  // Identité, depuis la session établie à la connexion.
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

  var granted = session.sections || [];
  var SECTIONS = [
    ["overview", "/api/overview", renderOverview],
    ["recruitment", "/api/recruitment", renderRecruitment],
    ["orders", "/api/orders", renderOrders],
    ["catalog", "/api/catalog", renderCatalog],
    ["absences", "/api/absences", renderAbsences],
    ["monitoring", "/api/monitoring", renderMonitoring],
    ["storage", "/api/storage", renderStorage],
    ["webhooks", "/api/webhooks", renderWebhooks],
  ];

  SECTIONS.forEach(function (entry) {
    var section = entry[0];
    if (granted.indexOf(section) === -1) {
      hideSection(section);
      return;
    }
    load(section, entry[1], entry[2]);
  });

  // Rechargement manuel de toutes les sections autorisées.
  var refresh = root.querySelector("[data-refresh]");
  if (refresh) {
    refresh.addEventListener("click", function () {
      SECTIONS.forEach(function (entry) {
        if (granted.indexOf(entry[0]) !== -1) load(entry[0], entry[1], entry[2]);
      });
    });
  }
})();
