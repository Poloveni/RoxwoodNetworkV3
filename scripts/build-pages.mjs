#!/usr/bin/env node
/**
 * Build du site pour GitHub Pages.
 *
 * 1. Lance `vite build` avec BASE_PATH=/RoxwoodNetworkV3/ (ou la valeur passée
 *    en variable d'environnement / en argument), ce qui préfixe tous les assets
 *    et pré-rend la route "/" en HTML statique.
 * 2. Ajoute les deux fichiers attendus par GitHub Pages :
 *      - .nojekyll : empêche tout traitement Jekyll (dossiers/fichiers en "_").
 *      - 404.html  : copie de index.html, pour que le routeur client prenne la
 *                    main sur une URL inconnue au lieu d'afficher le 404 GitHub.
 *
 * Utilisation : npm run build:pages
 * Sortie      : .output/public
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rawBase = process.argv[2] ?? process.env.BASE_PATH ?? "/RoxwoodNetworkV3/";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

console.log(`[pages] base path = ${base}`);

const build = spawnSync("npx", ["vite", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, BASE_PATH: base },
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const outDir = join(root, ".output", "public");
const indexHtml = join(outDir, "index.html");

if (!existsSync(indexHtml)) {
  console.error(
    `[pages] ERREUR : ${indexHtml} est introuvable. Le pré-rendu n'a pas produit de page statique.`,
  );
  process.exit(1);
}

writeFileSync(join(outDir, ".nojekyll"), "");
copyFileSync(indexHtml, join(outDir, "404.html"));

console.log("[pages] .nojekyll et 404.html ajoutés");
console.log(`[pages] site statique prêt dans ${outDir}`);
