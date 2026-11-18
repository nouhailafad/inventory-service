# Inventory Service

Microservice de gestion du stock (E-commerce MSOA).
Responsabilité : consulter, vérifier, réserver et libérer le stock des produits.

## Lancer
npm install
cp .env.example .env
npm start

Port par défaut : 8083 (configurable dans .env)

## Endpoints
| Méthode | URL | Description |
|---|---|---|
| GET | /health | État du service |
| GET | /api/inventory/:productId | Stock d'un produit |
| POST | /api/inventory/check | Vérifier la disponibilité d'une liste d'items |
| POST | /api/inventory/reserve | Réserver le stock (appelé par Orders) |
| POST | /api/inventory/release | Libérer le stock (compensation) |

Body pour check/reserve/release : `{ "items": [{ "productId": 1, "quantity": 2 }] }`

## Variables d'environnement
Voir `.env.example` (PORT, FRONTEND_URL, ORDERS_SERVICE_URL, CATALOG_SERVICE_URL)

## Base de données
SQLite (`db/inventory.db`), schéma dans `db/schema.sql`, données dans `db/seed.sql`.

## Frontend
https://github.com/ZOUHEIRBN/MSOA-E-com-Demo