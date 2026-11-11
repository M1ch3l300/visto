# Visto

Web app installabile (PWA) per tenere traccia di film e serie TV. Tema chiaro/scuro automatico, stile iOS.
Nessun server, nessuna build: sono file statici.

## Funzioni
- Home con tendenze, popolari, "continua a guardare" e consigli basati su ciò che hai visto
- Ricerca film e serie
- Scheda titolo: trama, cast, trailer, **dove guardarlo in Italia**
- Watchlist, film visti, episodi visti stagione per stagione, statistiche
- Link esterni tuoi (NAS, Jellyfin, Plex, segnalibri), che si aprono in una nuova scheda
- Backup/ripristino JSON
- Funziona offline per l'interfaccia; i dati restano nel tuo dispositivo

## Pubblicarla online (gratis)
Scegli una opzione, tutte danno un indirizzo https (necessario per "Aggiungi a Home").

**Netlify Drop:** vai su app.netlify.com/drop e trascina questa cartella.
**Cloudflare Pages:** Workers & Pages → Create → Upload assets → trascina la cartella.
**GitHub Pages:** carica i file in un repo, poi Settings → Pages → branch `main`.

## Installarla su iPhone
Apri l'indirizzo in Safari → Condividi → **Aggiungi alla schermata Home**.

## Chiave TMDB
Al primo avvio l'app chiede una chiave gratuita: registrati su themoviedb.org → Impostazioni → API.
La chiave resta nel tuo browser. Dati e piattaforme: TMDB / JustWatch.

## Limiti attuali
- Niente sincronizzazione tra dispositivi (usa Esporta/Importa backup). Per l'accesso con Google/Apple serve un backend, ad esempio Supabase o Firebase.
- Niente riproduzione video dentro l'app: i link aprono il tuo NAS o servizio nella sua pagina.
