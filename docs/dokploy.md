# Deploy LinkBreeze on Dokploy

Dokploy builds one LinkBreeze container from your GitHub branch using the repository's Dockerfile. The `linkbreeze-data` Docker volume stores the SQLite database, uploads, scheduled backups, and the automatically generated session signing key. Dokploy's Traefik proxy serves HTTPS and connects to the container on port `3000`.

## First deployment

1. Point a DNS `A` record for your app hostname (for example, `links.example.com`) at the VPS's public IPv4 address. If you also publish an `AAAA` record, point it at the same VPS's public IPv6 address. Make ports `80` and `443` reachable for Traefik and Let's Encrypt.
2. In Dokploy, connect GitHub under **Git Sources** and grant its GitHub App access to your LinkBreeze repository. In a Dokploy project, create a **Compose** service with type **Docker Compose**. In **General**, select **GitHub**, your repository, and the branch containing this file. Set **Compose Path** to `./docker-compose.dokploy.yml` and save.
3. In the service's **Environment** tab, paste the following and replace `links.example.com` with your app hostname. Keep Dokploy's **Create .env File** setting enabled if your version shows it.

   ```dotenv
   BASE_URL=https://links.example.com
   ```

   LinkBreeze generates a signing key on the first boot and saves it in the data volume. If you already run LinkBreeze with an explicit `SECRET_KEY` and are moving its data here, set the same key in Dokploy's **Environment** before starting the container.

4. In **Domains**, add your app hostname. Set **Service** to `linkbreeze`, **Path** to `/`, **Container Port** to `3000`, and enable **HTTPS** with the **Let's Encrypt** certificate. Leave **Internal Path** blank and **Strip Path** off.
5. Click **Deploy**. When the deployment finishes, visit `https://links.example.com/api/health` and check for HTTP `200` with `"status":"ok"`. On a fresh install, open `https://links.example.com/setup` immediately to create the first administrator. Then sign in and open your public page at `https://links.example.com/<slug>`.

[Dokploy GitHub setup](https://docs.dokploy.com/docs/core/github) · [Dokploy Compose settings](https://docs.dokploy.com/docs/core/docker-compose) · [Dokploy domain settings](https://docs.dokploy.com/docs/core/domains)

## Redeploy and back up

- Deploy future commits from the same Dokploy service so it reuses the named volume. The container runs database migrations on startup. Keep one LinkBreeze replica on the VPS.
- Use **Settings → Data** in LinkBreeze to create or schedule configuration backups. For full recovery, stop the service and back up the entire `/app/data` volume off the VPS so it includes accounts, uploads, and the generated `.secret-key`. If you supplied `SECRET_KEY` separately, keep it with your recovery material to preserve access to encrypted data such as enrolled two-factor authentication secrets.
- If you delete the Dokploy service, leave **Delete Volumes** unchecked to keep its data. Recreating the service can create a new project-scoped volume, so keep a backup before deleting it.
