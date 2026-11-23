/**
 * Simulazione di security awareness. Nessun dato personale raccolto, salvato o trasmesso.
 * Conforme per design (nessun trattamento di dati personali).
 *
 * Contatore anonimo condiviso per l'esercizio di phishing "Guardie e Ladri".
 * Tiene UN SOLO numero: quante persone hanno premuto "Connettiti".
 *
 * Questo stesso progetto serve anche gli asset statici in ./public
 * (index.html, dashboard.html): Cloudflare li serve automaticamente e invoca
 * questo Worker SOLO per le richieste senza asset corrispondente, cioe' /hit e
 * /count. Pagine e contatore vivono quindi sulla stessa origine, senza CORS.
 *
 * Endpoint:
 *   POST /hit    -> incrementa il contatore di 1. Ignora qualsiasi body/header.
 *   GET  /count  -> restituisce { count: <numero> } per la pagina di proiezione.
 *
 * Per costruzione NON riceve, legge o registra alcun dato personale:
 *   - /hit non legge il body della richiesta;
 *   - non si loggano IP, user-agent, header o payload;
 *   - l'unico stato persistito e' un intero.
 *
 * Lo stato vive in un Durable Object: un contatore globale e consistente
 * (l'incremento e' atomico anche con molte richieste simultanee).
 */

// --- CORS permissivo: la pagina partecipante puo' chiamare da qualsiasi origine ---
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

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Instradiamo tutto a un'unica istanza del Durable Object:
    // un solo contatore globale condiviso da tutti i partecipanti.
    const id = env.COUNTER.idFromName("global");
    const stub = env.COUNTER.get(id);

    if (pathname === "/hit" && request.method === "POST") {
      // NB: non passiamo il body originale. Il DO ignora completamente l'input.
      return stub.fetch("https://do/increment", { method: "POST" });
    }

    if (pathname === "/count" && request.method === "GET") {
      return stub.fetch("https://do/count");
    }

    return json({ error: "not_found" }, 404);
  },
};

/**
 * Durable Object: custodisce l'intero contatore.
 */
export class Counter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/increment") {
      // Incremento atomico: leggi, +1, scrivi. Nessun dato della richiesta viene letto.
      let count = (await this.state.storage.get("count")) || 0;
      count += 1;
      await this.state.storage.put("count", count);
      return json({ count });
    }

    // /count
    const count = (await this.state.storage.get("count")) || 0;
    return json({ count });
  }
}
