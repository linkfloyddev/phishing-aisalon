/**
 * Simulazione di security awareness. Nessun dato personale raccolto, salvato o trasmesso.
 * Conforme per design (nessun trattamento di dati personali).
 *
 * Contatore anonimo condiviso per l'esercizio di phishing "Guardie e Ladri".
 * Tiene DUE SOLI numeri:
 *   - views : quante persone hanno APERTO il portale (POST /view al caricamento)
 *   - hits  : quante persone hanno INSERITO le credenziali (POST /hit al submit)
 *
 * Questo stesso progetto serve anche gli asset statici in ./public
 * (index.html, dashboard.html). Cloudflare serve gli asset automaticamente e
 * invoca questo Worker per le richieste senza asset corrispondente (le API qui
 * sotto). Pagine e contatore vivono quindi sulla stessa origine, senza CORS.
 *
 * Endpoint:
 *   POST /view   -> +1 a views.  Solo same-origin (la pagina). Ignora body/header.
 *   POST /hit    -> +1 a hits.   Solo same-origin (la pagina). Ignora body/header.
 *   GET  /count  -> { views, hits } per la pagina di proiezione.
 *   POST /reset  -> azzera views e hits. Richiede header x-reset-token == RESET_TOKEN.
 *
 * Per costruzione NON riceve, legge o registra alcun dato personale:
 *   - /view e /hit non leggono il body della richiesta;
 *   - non si loggano IP, user-agent, header o payload;
 *   - l'unico stato persistito sono due interi.
 *
 * GUARD same-origin: /view e /hit sono accettati solo se la richiesta proviene
 * dalla stessa origine della pagina (header Sec-Fetch-Site / Origin / Referer).
 * Un `curl -X POST` nudo non ha questi header -> 403. Serve a evitare che il
 * contatore venga gonfiato da fuori; non e' una misura di sicurezza sui dati
 * (non ci sono dati), ma integrita' del conteggio.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

// Accetta solo richieste che arrivano dalla stessa origine della pagina.
// Un curl nudo (senza Sec-Fetch-Site / Origin / Referer) viene rifiutato.
function isSameOrigin(request) {
  const url = new URL(request.url);
  const host = url.host;

  // 1) Fetch Metadata: il piu' affidabile per i browser moderni.
  const sfs = request.headers.get("Sec-Fetch-Site");
  if (sfs) return sfs === "same-origin";

  // 2) Fallback: Origin deve combaciare con l'host della pagina.
  const origin = request.headers.get("Origin");
  if (origin) {
    try { return new URL(origin).host === host; } catch (e) { return false; }
  }

  // 3) Ultimo fallback: Referer deve combaciare con l'host della pagina.
  const referer = request.headers.get("Referer");
  if (referer) {
    try { return new URL(referer).host === host; } catch (e) { return false; }
  }

  // Nessun header di contesto (es. curl nudo): rifiutato.
  return false;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Un'unica istanza del Durable Object: un contatore globale condiviso.
    const id = env.COUNTER.idFromName("global");
    const stub = env.COUNTER.get(id);

    if (pathname === "/view" && request.method === "POST") {
      if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
      // NB: non passiamo il body originale. Il DO ignora completamente l'input.
      return stub.fetch("https://do/inc?field=views", { method: "POST" });
    }

    if (pathname === "/hit" && request.method === "POST") {
      if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
      return stub.fetch("https://do/inc?field=hits", { method: "POST" });
    }

    if (pathname === "/count" && request.method === "GET") {
      return stub.fetch("https://do/count");
    }

    if (pathname === "/reset" && request.method === "POST") {
      const token = request.headers.get("x-reset-token");
      // Confronto costante-ish: se il secret non e' impostato, nega sempre.
      if (!env.RESET_TOKEN || token !== env.RESET_TOKEN) {
        return json({ error: "forbidden" }, 403);
      }
      return stub.fetch("https://do/reset", { method: "POST" });
    }

    // Nessuna API: lascia che siano gli asset statici a rispondere.
    // (Con la configurazione [assets] di Cloudflare gli asset sono serviti
    //  automaticamente; questo fallback copre il caso run_worker_first.)
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: "not_found" }, 404);
  },
};

/**
 * Durable Object: custodisce i due interi (views, hits).
 */
export class Counter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/inc") {
      const field = url.searchParams.get("field") === "hits" ? "hits" : "views";
      // Incremento atomico: leggi, +1, scrivi. Nessun dato della richiesta viene letto.
      let n = (await this.state.storage.get(field)) || 0;
      n += 1;
      await this.state.storage.put(field, n);
      return json(await this.snapshot());
    }

    if (pathname === "/reset") {
      await this.state.storage.put("views", 0);
      await this.state.storage.put("hits", 0);
      return json({ views: 0, hits: 0 });
    }

    // /count
    return json(await this.snapshot());
  }

  async snapshot() {
    const views = (await this.state.storage.get("views")) || 0;
    const hits = (await this.state.storage.get("hits")) || 0;
    return { views, hits };
  }
}
