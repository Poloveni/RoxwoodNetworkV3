# /opt/roxwood-network/docker-compose.yml

Deux ajouts. Le service `bot` rejoint le reseau de Caddy, en plus du sien.

## 1. Dans le service `bot`, ajouter la cle `networks`

```yaml
  bot:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN}
      CLIENT_ID: ${CLIENT_ID}
      DEV_GUILD_ID: ${DEV_GUILD_ID}
      DATABASE_URL: postgresql://${POSTGRES_USER:-roxwood_network}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-roxwood_network}
      API_PORT: 8080
      API_ALLOWED_ORIGINS: https://poloveni.github.io
    networks:            # <-- AJOUT
      - default          # <-- garde l'acces a la base
      - vps              # <-- rend le bot joignable par Caddy
    mem_limit: 512m
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Aucun `ports:` n'est ajoute : l'API ne doit pas etre publiee sur l'hote, seul Caddy y accede.

## 2. En bas du fichier, a cote de `volumes:`

```yaml
networks:
  vps:
    external: true
    name: vps_default
```

`external: true` signifie « ce reseau existe deja, ne le cree pas » — c'est celui de
/opt/vps-proxy, partage par tes autres sites.
