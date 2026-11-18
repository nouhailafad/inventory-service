# Inventory Service

Microservice de gestion du stock (E-commerce MSOA).
Responsabilité : consulter, vérifier, réserver et libérer le stock des produits.

## Lancer

```bash
npm install
cp .env.example .env      # Windows : copy .env.example .env
npm start
```

Port par défaut : 8083 (configurable dans `.env`).

## Endpoints

| Méthode | URL | Description |
|---|---|---|
| GET | /health | État du service |
| GET | /api/inventory/:productId | Stock d'un produit |
| POST | /api/inventory/check | Vérifier la disponibilité d'une liste d'items |
| POST | /api/inventory/reserve | Réserver le stock (appelé par Orders) |
| POST | /api/inventory/release | Libérer le stock (compensation) |

Body pour check/reserve/release :

```json
{ "items": [{ "productId": 1, "quantity": 2 }] }
```

## Variables d'environnement

Le service se configure via un fichier `.env` (modèle fourni : `.env.example`).
Copier le modèle puis adapter les valeurs si besoin :

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| PORT | Port d'écoute du service | 8083 |
| FRONTEND_URL | Origine du frontend autorisée (CORS) | http://localhost:5173 |
| ORDERS_SERVICE_URL | URL du service Orders | http://localhost:8084 |
| CATALOG_SERVICE_URL | URL du service Catalog (vérifier qu'un produit existe) | http://localhost:8082 |

Si `.env` est absent, ces valeurs par défaut sont utilisées.

## Base de données

SQLite (`db/inventory.db`), schéma dans `db/schema.sql`, données dans `db/seed.sql`.

## Frontend

https://github.com/ZOUHEIRBN/MSOA-E-com-Demo