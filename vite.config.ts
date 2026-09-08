// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Déploiement GitHub Pages : le site est servi depuis https://poloveni.github.io/RoxwoodNetworkV3/
// donc tous les assets doivent être préfixés par /RoxwoodNetworkV3/.
// En dev (vite dev) on reste à la racine "/".
const BASE_PATH = process.env["BASE_PATH"] ?? "/";
const base = BASE_PATH.endsWith("/") ? BASE_PATH : `${BASE_PATH}/`;
const basepath = base === "/" ? "/" : base.slice(0, -1);

export default defineConfig({
  vite: {
    base,
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    router: { basepath },
    // Pré-rendu statique : chaque route est écrite en HTML à la compilation,
    // il ne reste aucune exécution serveur à l'exécution.
    // crawlLinks est désactivé : les liens de la page pointent vers le site
    // statique de public/site (des fichiers, pas des routes du routeur).
    prerender: { enabled: true, crawlLinks: false, failOnError: true },
    pages: [{ path: "/" }],
  },
});
