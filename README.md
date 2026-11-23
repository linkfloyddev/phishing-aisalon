<!--
  Simulazione di security awareness. Nessun dato personale raccolto, salvato o trasmesso.
  Conforme per design (nessun trattamento di dati personali).
-->

# AI Salon — "Guardie e Ladri" · Simulazione di phishing

Esercizio di security awareness dal vivo per l'**AI Salon** (Swiss AI Weeks, Acer Europe, Bioggio – Ticino).

I partecipanti scansionano un QR code appeso in sala con scritto **"WiFi"**, atterrano su un finto captive portal, inseriscono email e password e premono *Connettiti*. Il telefono mostra soltanto un anticlimatico *"Connessione non riuscita"*. Il **reveal** avviene più tardi **dal palco**: un contatore anonimo proiettato mostra quante persone hanno abboccato.

## Il punto dell'esercizio (vincoli di sicurezza)

Email e password **non lasciano mai** il browser del partecipante. Al submit l'unica chiamata di rete è un `POST /hit` **senza body**: manda solo il segnale "+1".

- I valori dei campi non vengono salvati, loggati, messi in `localStorage`/cookie né inclusi in alcuna richiesta. Dopo il submit sono scartati (`form.reset()`).
- Il backend **per costruzione** non può ricevere né registrare dati personali: `/hit` ignora qualsiasi payload e incrementa soltanto. Non si loggano IP, user-agent o altro.
- Lo stato persistito è un solo intero.

> È una simulazione **conforme per design**: nessun trattamento di dati personali.

## I tre componenti

| File | Ruolo |
|------|-------|
| `index.html` | Pagina partecipante (captive portal). Single-file, mobile-first, zero dipendenze. |
| `worker.js` + `wrangler.toml` | Cloudflare Worker: contatore anonimo condiviso (`POST /hit`, `GET /count`). |
| `dashboard.html` | Pagina di proiezione per il palco. Numero grande, polling ogni 2,5 s. |

Flusso:

```
[Telefono partecipante]  --(POST /hit, nessun dato)-->  [Worker + contatore]  <--(GET /count)--  [Proiezione palco]
     index.html                                             worker.js                               dashboard.html
```

---

## Passo 1 — Deploy della Worker (il contatore)

Serve Node.js e un account Cloudflare (il piano gratuito basta: i Durable Object sono inclusi).

```bash
# 1. Installa la CLI di Cloudflare (una volta sola)
npm install -g wrangler

# 2. Login (apre il browser)
wrangler login

# 3. Dalla cartella del progetto, pubblica
wrangler deploy
```

Al termine Wrangler stampa l'URL pubblico della Worker, del tipo:

```
https://aisalon-counter.<tuo-account>.workers.dev
```

**Copia questo URL**: ti serve al passo 3.

Verifica rapida:

```bash
curl -X POST https://aisalon-counter.<tuo-account>.workers.dev/hit    # -> {"count":1}
curl       https://aisalon-counter.<tuo-account>.workers.dev/count    # -> {"count":1}
```

> **Reset del contatore prima dell'evento.** Il numero parte da 0 alla prima creazione. Per azzerarlo dopo i test, il modo più semplice è cambiare il nome dell'istanza: in `worker.js` sostituisci `idFromName("global")` con `idFromName("evento-2026")` e rifai `wrangler deploy`. Ogni nome è un contatore separato che parte da zero.

---

## Passo 2 — Deploy delle due pagine

`index.html` e `dashboard.html` sono file statici: vanno bene Cloudflare Pages, Netlify o Vercel. Puoi anche tenerli su progetti/domini diversi (consigliato: la pagina partecipante su un dominio "civetta", vedi passo 4).

### Opzione A — Cloudflare Pages (drag & drop)
1. Vai su **Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets**.
2. Trascina la cartella con `index.html` (e, se vuoi, `dashboard.html`).
3. Pubblica. Ottieni un URL tipo `https://<nome>.pages.dev`.

### Opzione B — Netlify (drag & drop)
1. Vai su [app.netlify.com/drop](https://app.netlify.com/drop).
2. Trascina i file. Ottieni un URL `https://<nome>.netlify.app`.

### Opzione C — Vercel
```bash
npm i -g vercel
vercel        # dalla cartella del progetto, segui le istruzioni
```

> Suggerimento pratico: pubblica `dashboard.html` su un indirizzo **diverso** e poco intuitivo (o tienilo in locale aperto sul portatile del palco), così nessun partecipante lo trova durante l'esercizio.

---

## Passo 3 — Collega le pagine alla Worker

In **entrambi** i file HTML, in cima al tag `<script>`, c'è una riga di configurazione. Sostituisci il segnaposto con l'URL della tua Worker (dal passo 1, **senza** slash finale):

In `index.html`:
```js
var COUNTER_URL = "https://aisalon-counter.<tuo-account>.workers.dev";
```

In `dashboard.html`:
```js
var COUNTER_URL = "https://aisalon-counter.<tuo-account>.workers.dev";
```

Ri-carica/ri-pubblica i file. Fatto.

**Collaudo end-to-end:** apri `index.html` sul telefono, compila e premi *Connettiti*; su un altro schermo apri `dashboard.html` e verifica che il numero salga entro ~2,5 s.

---

## Passo 4 — QR code e scelta del dominio

### Genera il QR code
Il QR deve puntare all'URL **pubblico** della pagina partecipante (`index.html`). Opzioni:

- **Da terminale** (nessun servizio esterno, nessun dato in giro):
  ```bash
  # macOS/Linux: installa qrencode (brew install qrencode / apt install qrencode)
  qrencode -o wifi-qr.png -s 10 -m 2 "https://wifi-aisalon.xyz"
  ```
- **Online**: un qualsiasi generatore di QR statico. Evita i QR "dinamici" con tracciamento: non servono e introducono un intermediario che vede chi scansiona. Un QR statico codifica solo l'URL.

Stampa il QR con un'etichetta sobria tipo **"WiFi ospiti — AI Salon"** e appendilo in sala.

### Scelta del dominio (è parte della lezione)
Usa un dominio **plausibile ma palesemente non ufficiale**, es. `wifi-aisalon.xyz`. Così, al reveal, puoi mostrare che:

- nessuno ha controllato l'URL prima di digitare la password;
- un dominio `.xyz` registrato in 5 minuti e un captive portal curato bastano a ingannare;
- la lezione non è "siete ingenui" ma "**verificate sempre l'URL** prima di inserire credenziali, soprattutto su reti e portali che non avete scelto voi".

> Il dominio civetta rende la lezione più onesta del semplice `*.pages.dev`: imita esattamente l'errore reale. Registra un dominio economico (es. su Cloudflare Registrar o simili) e puntalo alla Pages/Netlify del passo 2.

---

## Checklist pre-evento

- [ ] `wrangler deploy` eseguito, URL Worker annotato
- [ ] `/hit` e `/count` rispondono (test con `curl`)
- [ ] `COUNTER_URL` aggiornato in `index.html` **e** `dashboard.html`
- [ ] Pagine pubblicate; test end-to-end da smartphone riuscito
- [ ] Contatore azzerato dopo i test (vedi nota al passo 1)
- [ ] QR generato, stampato ed etichettato "WiFi"
- [ ] `dashboard.html` pronto sul portatile del palco, a schermo intero (F11)

## Nota etica

Esercizio educativo, da condurre con il consenso informato dell'organizzazione e un debrief chiaro al termine. Non raccoglie alcun dato: mostra solo **quante** persone avrebbero potuto essere compromesse, mai **chi**.
