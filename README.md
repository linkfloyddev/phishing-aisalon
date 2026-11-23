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
- Il backend **per costruzione** non può ricevere né registrare dati personali: `/hit` ignora qualsiasi payload e incrementa soltanto. Non si loggano IP, user-agent o altro. *(Verificato: un `POST /hit` con un finto body `email=…&password=…` incrementa e basta, il body viene scartato.)*
- Lo stato persistito è un solo intero.

> È una simulazione **conforme per design**: nessun trattamento di dati personali.

## Architettura — un solo progetto, un solo dominio

Tutto è un **unico progetto Cloudflare** (un Worker che serve anche gli asset statici) pubblicato su **`aisalon.linkfloyd.top`**. Pagine e contatore stanno sulla **stessa origine**: niente CORS da configurare, niente URL da incollare nelle pagine.

| Percorso | Cosa | File |
|----------|------|------|
| `aisalon.linkfloyd.top/` | Pagina partecipante (captive portal), mobile-first | `public/index.html` |
| `aisalon.linkfloyd.top/dashboard` | Pagina di proiezione per il palco | `public/dashboard.html` |
| `POST /hit` · `GET /count` | Contatore anonimo (Durable Object, incremento atomico) | `worker.js` + `wrangler.toml` |

```
[Telefono partecipante]                         [Proiezione palco]
  aisalon.linkfloyd.top/        aisalon.linkfloyd.top/dashboard
         │                                        ▲
         │ POST /hit (nessun dato, solo "+1")     │ GET /count (polling 2,5s)
         ▼                                        │
      ┌───────────────── stesso Worker ──────────────────┐
      │  worker.js  →  Durable Object "Counter" (1 intero) │
      └────────────────────────────────────────────────────┘
```

---

## Passo 1 — Deploy (un solo comando)

Serve Node.js e un account Cloudflare (piano gratuito: Durable Object inclusi). La zona **`linkfloyd.top` dev'essere nel tuo account Cloudflare** (lo è, visto che il dominio è tuo).

```bash
npx wrangler login     # apre il browser, autorizza l'account
npx wrangler deploy    # pubblica Worker + asset + contatore
```

Al termine Wrangler:
- pubblica il progetto `aisalon` (disponibile anche su `https://aisalon.<tuo-account>.workers.dev` per i test rapidi);
- grazie a `routes` in `wrangler.toml`, crea **DNS + certificato** per **`aisalon.linkfloyd.top`** automaticamente.

Dopo qualche minuto di propagazione DNS:

```bash
curl https://aisalon.linkfloyd.top/count            # -> {"count":0}
curl -X POST https://aisalon.linkfloyd.top/hit      # -> {"count":1}
```

E nel browser: `https://aisalon.linkfloyd.top/` (portale) e `https://aisalon.linkfloyd.top/dashboard` (proiezione).

> **Se il dominio non si crea da CLI** (es. zona non trovata): rimuovi il blocco `routes` da `wrangler.toml`, rifai `wrangler deploy`, poi dalla **dashboard Cloudflare → Workers & Pages → `aisalon` → Settings → Domains & Routes → Add → Custom Domain** inserisci `aisalon.linkfloyd.top`. Cloudflare crea DNS e certificato.

### Non serve configurare alcun URL
Le pagine chiamano `/hit` e `/count` sulla **stessa origine** (`COUNTER_URL = ""` nei due file). Non devi incollare nessun indirizzo: una volta online il tutto funziona. *(Dovessi un giorno separare il contatore su un altro dominio, imposta `COUNTER_URL` a quell'URL assoluto in `public/index.html` e `public/dashboard.html`.)*

---

## Passo 2 — Prova end-to-end (prima dell'evento)

1. Apri `https://aisalon.linkfloyd.top/` dallo smartphone, compila email/password fittizie, premi *Connettiti* → spinner ~2,5 s → *"Connessione non riuscita"*.
2. Su un altro schermo apri `https://aisalon.linkfloyd.top/dashboard`: il numero sale entro ~2,5 s.
3. **Azzera il contatore dopo i test** (vedi sotto) così all'evento parte da 0.

### Reset del contatore
Il numero è cumulativo. Per ripartire da zero cambia il nome dell'istanza del Durable Object in `worker.js`:

```js
const id = env.COUNTER.idFromName("global");   // -> es. idFromName("evento-2026")
```

Ogni nome è un contatore separato che parte da 0. Rifai `npx wrangler deploy`.

### Sviluppo/test in locale
```bash
npx wrangler dev        # http://127.0.0.1:8787  (portale, /dashboard, /hit, /count)
```

---

## Passo 3 — QR code e la lezione sul dominio

### Genera il QR code
Il QR deve puntare alla pagina partecipante: **`https://aisalon.linkfloyd.top/`**.

```bash
# qrencode (brew install qrencode / apt install qrencode) — nessun servizio esterno
qrencode -o wifi-qr.png -s 10 -m 2 "https://aisalon.linkfloyd.top/"
```

Usa un **QR statico** (codifica solo l'URL): evita i QR "dinamici" con tracciamento, introducono un intermediario che vede chi scansiona e non servono. Stampa il QR con un'etichetta sobria tipo **"WiFi ospiti — AI Salon"** e appendilo in sala.

### Il dominio è parte della lezione
`aisalon.linkfloyd.top` è un sottodominio **tuo**, plausibile ma **non ufficiale** dell'evento: perfetto per il debrief. Al reveal puoi mostrare che:

- nessuno ha controllato l'URL prima di digitare la password;
- un sottodominio qualsiasi + un captive portal curato bastano a ingannare;
- la lezione non è "siete ingenui" ma **"verificate sempre l'URL prima di inserire credenziali"**, soprattutto su reti/portali che non avete scelto voi.

> Vuoi rendere l'inganno ancora più realistico? Registra un dominio civetta economico (es. `wifi-aisalon.xyz`) e, dalla dashboard, aggiungilo come **secondo Custom Domain** dello stesso progetto `aisalon`: il QR punterà a quello, il backend resta identico.

---

## Checklist pre-evento

- [ ] `npx wrangler deploy` eseguito senza errori
- [ ] `https://aisalon.linkfloyd.top/` e `/dashboard` raggiungibili
- [ ] `/hit` e `/count` rispondono (`curl`)
- [ ] Test end-to-end da smartphone riuscito (spinner → "non riuscita"; numero sale)
- [ ] Contatore azzerato dopo i test (nuovo `idFromName`)
- [ ] QR generato, stampato ed etichettato "WiFi"
- [ ] `/dashboard` pronto sul portatile del palco, a schermo intero (F11)

## Nota etica

Esercizio educativo, da condurre con il consenso informato dell'organizzazione e un debrief chiaro al termine. Non raccoglie alcun dato: mostra solo **quante** persone avrebbero potuto essere compromesse, mai **chi**.
