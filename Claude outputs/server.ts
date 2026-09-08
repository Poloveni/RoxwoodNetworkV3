import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Serveur HTTP de lecture, dans le meme process que le bot.
 *
 * Pourquoi ici plutot qu'un service separe : les donnees vivent deja dans la base a
 * laquelle ce process est connecte, et les services de lecture sont deja importables.
 * Un second conteneur imposerait une seconde connexion Prisma et un second deploiement
 * pour zero benefice.
 *
 * Pourquoi `node:http` plutot qu'Express ou Fastify : la surface est minuscule (quelques
 * routes GET, pas de corps de requete a parser, pas de sessions) et le projet tient
 * volontairement sa liste de dependances courte. Le routage manuel ci-dessous coute moins
 * cher qu'un framework a maintenir et a auditer.
 *
 * Ce serveur n'est jamais publie sur l'hote : il n'ecoute que sur le reseau Docker, et
 * c'est le reverse proxy Caddy qui l'expose en HTTPS. Aucun port n'est ouvert par ce
 * conteneur dans docker-compose.yml.
 */

type Route = {
  method: "GET";
  path: string;
  handle: (req: IncomingMessage, url: URL) => Promise<unknown> | unknown;
};

const startedAt = Date.now();

const routes: Route[] = [
  {
    method: "GET",
    path: "/api/health",
    // Sonde de bout en bout : prouve que Caddy joint bien ce process. Ne touche pas a la
    // base et n'expose rien de sensible — elle est volontairement accessible sans jeton.
    handle: () => ({
      ok: true,
      service: "roxwood-network-bot",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    }),
  },
];

/**
 * Origines autorisees a appeler cette API depuis un navigateur.
 *
 * On repond `Access-Control-Allow-Origin` avec l'origine exacte de la requete quand elle
 * figure dans la liste, jamais `*` : le jour ou les routes porteront un jeton
 * d'autorisation, un joker interdirait l'envoi des identifiants et masquerait le probleme
 * derriere une erreur CORS obscure. Autant poser la regle stricte tout de suite.
 */
function resolveAllowedOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  return env.API_ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const allowed = resolveAllowedOrigin(req.headers.origin);
  if (!allowed) return;

  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  // Une reponse mise en cache pour une origine ne doit jamais etre resservie a une autre.
  res.setHeader("Vary", "Origin");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    // Donnees d'entreprise : aucun cache intermediaire ne doit les conserver.
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  applyCors(req, res);

  // Requete preliminaire CORS : le navigateur l'envoie avant tout appel portant un
  // en-tete Authorization.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const route = routes.find((r) => r.path === url.pathname);

  if (!route) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }
  if (req.method !== route.method) {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    sendJson(res, 200, await route.handle(req, url));
  } catch (error) {
    // Le detail part dans les logs du conteneur, jamais dans la reponse : un message
    // d'erreur brut renseigne un attaquant sur la structure interne.
    logger.error("Erreur non geree dans l'API HTTP", error);
    sendJson(res, 500, { error: "internal_error" });
  }
}

/** Demarre le serveur. Un echec ici ne doit jamais empecher le bot Discord de tourner. */
export function startHttpServer(): void {
  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  server.on("error", (error) => {
    logger.error("Erreur du serveur HTTP", error);
  });

  server.listen(env.API_PORT, "0.0.0.0", () => {
    logger.info(`API de lecture a l'ecoute sur le port ${env.API_PORT}`);
  });
}
