# FinanceBro - Stock Analysis & Portfolio Bot

Bot Telegram basato su Cloudflare Workers per l'analisi finanziaria automatizzata e la gestione del portfolio. Utilizza l'intelligenza artificiale (Anthropic Claude) per generare report di investimento e interpretare comandi di trading, integrando dati di mercato in tempo reale da Financial Modeling Prep (FMP).

## Architettura

Il progetto è sviluppato in Node.js e distribuito sull'ecosistema Cloudflare:

*   **Cloudflare Workers:** Gestione serverless delle richieste webhook di Telegram.
*   **Durable Objects:** Gestione dello stato persistente (SQLite), code di background (Alarms) e coerenza dei dati utente.
*   **Integrazioni Esterne:**
    *   **Telegram Bot API:** Interfaccia utente principale.
    *   **Anthropic API (Claude 3.5 Sonnet):** Motore di analisi finanziaria e parsing del linguaggio naturale.
    *   **Financial Modeling Prep (FMP) API:** Fonte dati per quotazioni real-time, storici prezzi e profili aziendali.

## Funzionalità

### 1. Analisi Finanziaria AI
Il comando `/analyze [TICKER]` avvia un processo di analisi multi-step:
1.  Il Worker delega il task al Durable Object tramite il sistema di *Alarm* per gestire esecuzioni a lunga durata.
2.  L'AI raccoglie dati di mercato (prezzo, variazioni, market cap, P/E) e storici (OHLC 30 giorni) tramite *Tool Use*.
3.  Viene generato un report strutturato che include:
    *   Analisi dei fondamentali (Business model, salute finanziaria).
    *   Analisi tecnica (Trend, supporti/resistenze).
    *   Score pesato (Tecnica 35%, Fondamentali 30%, Settore 20%, Sentiment 15%).
    *   Raccomandazione operativa (BUY/PASS/WATCHLIST) con strategia di esecuzione e gestione rischio.

### 2. Gestione Portfolio e Trading
Il sistema traccia le posizioni e calcola il P&L in tempo reale.
*   **Inserimento Ordini:** Supporta comandi strutturati (`/buy AAPL 150 10`) e linguaggio naturale (`Ho comprato 10 azioni Apple a 150 dollari`). L'AI effettua il parsing se il pattern matching fallisce.
*   **Portfolio Tracker:** Il comando `/portfolio` restituisce una tabella con le posizioni aperte, calcolando profitto/perdita basandosi sui prezzi di mercato correnti recuperati da FMP.
*   **Budgeting:** Il comando `/setbudget` definisce il capitale disponibile, influenzando i suggerimenti di position sizing dell'AI.

### 3. Sicurezza e Rate Limiting
*   **Autenticazione:** Supporto opzionale per password di accesso (`BOT_PASSWORD`) per limitare l'uso del bot.
*   **Rate Limiting:** Sistema basato su SQLite interno al Durable Object per limitare il numero di analisi AI giornaliere per utente.

## Configurazione

Il progetto richiede le seguenti variabili d'ambiente (configurabili in `wrangler.toml` o dashboard Cloudflare):

| Variabile | Descrizione |
| :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Token ottenuto da @BotFather |
| `ANTHROPIC_API_KEY` | Chiave API per l'accesso ai modelli Claude |
| `FMP_API_KEY` | Chiave API Financial Modeling Prep |
| `BOT_PASSWORD` | (Opzionale) Password per proteggere l'accesso al bot |

## Sviluppo e Deploy

### Prerequisiti
*   Node.js
*   Account Cloudflare

### Installazione Dipendenze
```bash
npm install
```

### Deploy
Il deploy su Cloudflare Workers si esegue tramite Wrangler:

```bash
npx wrangler deploy
```

## Struttura del Codice

*   `src/index.js`: Router principale e gestione webhook.
*   `src/user-storage.js`: Implementazione Durable Object. Gestisce SQLite, code di background e logica di business persistente.
*   `src/ai.js`: Interfaccia con Anthropic API. Gestisce il prompt engineering, lo streaming della risposta e l'esecuzione dei tool.
*   `src/fmp.js`: Client HTTP per le API di Financial Modeling Prep.
*   `src/telegram.js`: Utility per la formattazione dei messaggi e gestione chiamate API Telegram.
