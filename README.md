# travleh

Dagelijkse puzzel naar het voorbeeld van [travle](https://travle.earth), maar met de 62 gemeentes van West-Vlaanderen (na de fusies van 1 januari 2025).

Je krijgt twee gemeentes en moet de gemeentes ertussen raden om via buurgemeentes van de ene naar de andere te reizen, met zo weinig mogelijk grensovergangen.

## Ontwikkelen

```bash
npm run dev      # serveert public/ op http://localhost:3000
npm run data     # herbouwt public/data.json uit de officiële gemeentegrenzen
```

Statische site, geen build nodig. Vercel serveert de map `public/`.

Gemeentegrenzen: Voorlopig referentiebestand gemeentegrenzen (VRBG2025), Digitaal Vlaanderen.
