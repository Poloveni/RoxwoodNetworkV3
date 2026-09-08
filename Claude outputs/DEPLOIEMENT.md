# API de lecture — deploiement

## 1. Fichiers

A copier dans le depot `roxwood-network-entreprise` :

```
src/http/server.ts        (nouveau)
src/http/discordAuth.ts   (nouveau)
src/http/access.ts        (nouveau)
src/http/readQueries.ts   (nouveau)
src/config/env.ts         (remplace : 4 variables ajoutees)
src/index.ts              (remplace : 2 lignes ajoutees)
```

Aucune dependance npm ajoutee. `package.json` et `package-lock.json` sont inchanges.

## 2. Variables d'environnement

Dans le `.env` du VPS (`/opt/roxwood-network/.env`) :

```bash
# Guilde dont l'API expose les donnees. Sans elle, seule /api/health repond.
API_GUILD_ID=1533030404817162300

# Roles ouvrant les sections reservees (candidatures, commandes, journaux, coffre, flux).
# Vide = tout membre du serveur y accede, et le bot journalise un avertissement au demarrage.
API_STAFF_ROLE_IDS=

# Facultatif, valeurs par defaut ci-dessous.
# API_PORT=8080
# API_ALLOWED_ORIGINS=https://poloveni.github.io
```

## 3. docker-compose.yml

Dans le service `bot`, ajouter les variables et le raccordement reseau :

```yaml
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN}
      CLIENT_ID: ${CLIENT_ID}
      DEV_GUILD_ID: ${DEV_GUILD_ID}
      DATABASE_URL: postgresql://${POSTGRES_USER:-roxwood_network}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-roxwood_network}
      API_GUILD_ID: ${API_GUILD_ID}
      API_STAFF_ROLE_IDS: ${API_STAFF_ROLE_IDS}
    networks:
      - default    # garde l'acces a la base
      - vps        # rend le bot joignable par Caddy
```

Et en bas du fichier :

```yaml
networks:
  vps:
    external: true
    name: vps_default
```

Aucun `ports:` : l'API ne doit pas etre publiee sur l'hote, seul Caddy y accede.

## 4. Mise en service

```bash
cd /opt/roxwood-network && git pull && sudo docker compose up -d --build
sudo docker compose logs -f bot | head -20
curl -s https://roxwoodnetworkv3.duckdns.org/api/health
```

## 5. Les routes

| Route | Acces |
| --- | --- |
| `GET /api/health` | public (sonde, ne touche pas la base) |
| `GET /api/me` | tout membre |
| `GET /api/overview` | tout membre (compteurs limites a ses sections) |
| `GET /api/catalog` | tout membre |
| `GET /api/absences` | tout membre |
| `GET /api/recruitment` | roles declares |
| `GET /api/orders` | roles declares |
| `GET /api/monitoring` | roles declares |
| `GET /api/storage` | roles declares |
| `GET /api/webhooks` | roles declares |

Toutes attendent `Authorization: Bearer <jeton Discord>`, sauf `/api/health`.
`limit` (max 200) est accepte sur les routes de liste.

## 6. Ce qui ne sort jamais

- `WebhookSubscription.secret` — jamais selectionne.
- Les URL de destination des webhooks — reduites a leur hote.
- Les colonnes `Bytes` (photos d'articles, banniere, pieces jointes) — seuls leur presence
  et leur nom de fichier remontent.
