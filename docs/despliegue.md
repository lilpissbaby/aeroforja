# Despliegue

AeroForja es una web estática: todo el cálculo corre en el navegador. El contenedor solo sirve archivos con nginx. La imagen se construye en dos etapas y la primera ejecuta `pnpm check` (tipos y tests de validación física): si un test falla, no hay imagen.

Archivos en `docker/`:

| Archivo | Para qué |
|---|---|
| `Dockerfile` | Compila la app, pasa los tests y la deja en `nginx:alpine` |
| `nginx.conf` | nginx del contenedor: caché larga para `/assets`, `index.html` siempre revalidado, `/healthz` |
| `docker-compose.local.yml` | Tu ordenador, en `http://localhost:8080` |
| `docker-compose.vps.yml` | El VPS, en `proxy_network` detrás de `reverse_proxy` |
| `vps/aeroforja.conf` | Bloque de nginx para `infra/nginx/conf.d/` |
| `vps/deploy.sh` | Actualiza y despliega en el VPS de una vez |

## 1. En local

### Sin Docker (desarrollo)

```powershell
pnpm install
pnpm dev        # http://localhost:5173, se recarga al guardar
```

### Con Docker (igual que en el VPS)

Necesitas Docker Desktop.

```powershell
pnpm docker:local        # = docker compose -f docker/docker-compose.local.yml up -d --build
# abre http://localhost:8080
pnpm docker:local:down   # para pararlo
```

El puerto solo escucha en `127.0.0.1`. Si el 8080 está ocupado, cambia la parte izquierda de `ports` en `docker/docker-compose.local.yml`.

## 2. En el VPS (docker-modular-infra)

Sigue la plantilla de apps de tu infra: la app se une a la red externa `proxy_network`, solo expone el puerto 80 y `reverse_proxy` pone el TLS con el certificado comodín de `tenebrum.online`.

Primera vez:

```bash
# 1. DNS: registro A  aeroforja.tenebrum.online → IP del VPS
# 2. Código
sudo git clone https://github.com/lilpissbaby/aeroforja /opt/homelab/apps/aeroforja
cd /opt/homelab/apps/aeroforja
# 3. Imagen, contenedor, conf de nginx y recarga
sudo ./docker/vps/deploy.sh
```

`deploy.sh` busca la infra en `/opt/homelab/infra` o en `~/infra` (o en `INFRA_DIR=/ruta`), copia `docker/vps/aeroforja.conf` a `nginx/conf.d/` si no existe, comprueba la sintaxis con `nginx -t`, recarga nginx sin reiniciarlo y verifica que `reverse_proxy` llega a `http://aeroforja/healthz`.

Actualizar: `git push` desde tu PC y, en el VPS, `sudo ./docker/vps/deploy.sh` otra vez.

### Acceso

El bloque de nginx usa el mismo basic auth que Portainer o Dozzle (`/etc/nginx/certs/.htpasswd`), porque sigue abierta la decisión «uso personal o publicación» y el proyecto aún no tiene licencia. Para hacerla pública, borra las dos líneas `auth_basic` de `infra/nginx/conf.d/aeroforja.conf` y recarga: `sudo docker exec reverse_proxy nginx -s reload`.

### Si algo falla

- 502 Bad Gateway: `sudo docker ps | grep aeroforja` y `sudo docker exec reverse_proxy wget -qO- http://aeroforja/healthz`.
- La imagen no se construye: mira la salida de `pnpm check`; un test de validación roto para el despliegue a propósito.
- Logs: `sudo docker logs aeroforja --tail 50` o Dozzle.

## Datos

Los proyectos se guardan en el navegador de cada equipo (y en los JSON que descargues). El servidor no guarda nada, así que local y VPS no comparten trabajo: para pasarlo, «Guardar JSON» en uno y «Abrir JSON» en el otro.
