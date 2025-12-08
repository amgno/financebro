# Stock Data API Integration

## Provider
**Financial Modeling Prep (FMP)**
- **Base URL:** `https://financialmodelingprep.com/stable`
- **Auth:** API Key query parameter (`?apikey=...`)

## Implementation Details

L'integrazione è gestita dalla classe `FMPClient` in `src/fmp.js` e utilizzata come tool per l'agente AI Claude in `src/ai.js`.

### Endpoints Utilizzati

1.  **Quote Real-Time**
    - **Endpoint:** `/quote?symbol={TICKER}`
    - **Scopo:** Ottenere prezzo attuale, variazioni percentuali, volume e market cap.
    - **Utilizzo:** Fornisce il contesto di prezzo immediato per l'analisi.

2.  **Historical Prices**
    - **Endpoint:** `/historical-price-eod/full?symbol={TICKER}`
    - **Scopo:** Ottenere lo storico dei prezzi (Open, High, Low, Close).
    - **Ottimizzazione:**
        - Richiediamo solo gli ultimi **5 giorni** per ridurre il payload.
        - Filtriamo i dati mantenendo solo `{ date, close }` prima di passarli all'AI.

3.  **Company Profile**
    - **Endpoint:** `/profile?symbol={TICKER}`
    - **Scopo:** Informazioni fondamentali (Settore, Industria, CEO, Descrizione).
    - **Ottimizzazione:** Tronchiamo la descrizione a 150 caratteri per risparmiare token.

### Strategia per Piano Free (Workers & API)

Per rientrare nei limiti di esecuzione dei Cloudflare Workers (10ms CPU time) e del piano free di Anthropic/FMP:

1.  **Parallelismo:** Le chiamate agli endpoint FMP vengono eseguite in parallelo (`Promise.all`) invece che sequenzialmente.
2.  **Data Minification:** I dati grezzi JSON di FMP vengono filtrati e ridotti al minimo essenziale prima di essere inviati al prompt di Claude.
3.  **Prompt Engineering:** Il prompt di sistema forza Claude a essere "estremamente conciso" per ridurre i tempi di generazione.
4.  **Fallback:** Se un tool fallisce, l'errore viene catturato e loggato, permettendo all'analisi di proseguire con i dati parziali disponibili.

