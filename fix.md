# Analisi Codebase - Report di Pulizia e Ottimizzazione

## 📋 Indice
1. [Codice Duplicato](#codice-duplicato)
2. [Inconsistenze e Bug](#inconsistenze-e-bug)
3. [Codice Inutilizzato](#codice-inutilizzato)
4. [Problemi di Architettura](#problemi-di-architettura)
5. [Raccomandazioni di Refactoring](#raccomandazioni-di-refactoring)

---

## 🔄 Codice Duplicato

### 1. **Logica di Invio Messaggi Telegram**

**Problema:** La funzione `sendMessage` è implementata in **due posti diversi**:

- **`src/index.js`** (linea ~290)
- **`src/user-storage.js`** (metodo `sendMessage` nel Durable Object, linea ~350)

**Codice Duplicato:**
```javascript
// In src/index.js
async function sendMessage(chatId, text, env, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

// In src/user-storage.js (con logica aggiuntiva per chunking)
async sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const formattedText = toTelegramHTML(text);
  const MAX_LENGTH = 4000;
  // ... logica di chunking ...
}
```

**Soluzione:** Creare un modulo `src/telegram.js` con funzioni condivise.

---

### 2. **Conversione Markdown → HTML Telegram**

**Problema:** La funzione `toTelegramHTML` è definita inline dentro `sendMessage` nel Durable Object, ma potrebbe essere riutilizzata altrove.

**Codice:**
```javascript
const toTelegramHTML = (md) => {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    // ... altre regex ...
};
```

**Soluzione:** Estrarre in `src/telegram.js` come funzione esportata.

---

### 3. **Gestione Sessioni Interattive**

**Problema:** I metodi `getSession`, `setSession`, `clearSession` in `src/index.js` chiamano sempre il Durable Object, ma non sono mai usati (la logica interattiva è commentata/non implementata).

**Codice Morto:**
```javascript
async function getSession(userId, env) { /* ... */ }
async function setSession(userId, type, step, data, env) { /* ... */ }
async function clearSession(userId, env) { /* ... */ }
```

**Soluzione:** Rimuovere o completare l'implementazione.

---

## 🐛 Inconsistenze e Bug

### 1. **Tabella `sessions` Mancante nel Schema**

**Bug Critico:** In `src/index.js` ci sono endpoint per gestire sessioni (`/session`), ma **la tabella non è mai creata** nel costruttore del Durable Object.

**Codice Mancante:**
```javascript
// MANCA QUESTA TABELLA in src/user-storage.js constructor
this.sql.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    user_id TEXT PRIMARY KEY,
    type TEXT,
    step TEXT,
    data TEXT
  )
`);
```

**Impatto:** Chiamate a `getSession()` falliranno con errore SQLite.

---

### 2. **Doppia Gestione della Password**

**Problema:** La logica di autorizzazione è nel Durable Object (`/authorize`, `/is-authorized`), ma la password di confronto è in `env.BOT_PASSWORD` (ambiente Worker).

**Confusione:**
- Se `BOT_PASSWORD` è vuoto, il bot è pubblico
- Se è settato, usa `authorizeUser()` che salva un flag nel DO, ma **non verifica la password nel DO**

**Codice Attuale:**
```javascript
// In src/index.js
if (text && text.trim() === env.BOT_PASSWORD) {
  await authorizeUser(userId, env); // ← Salva flag nel DO
  // ...
}
```

**Problema:** Se il Worker viene riavviato con `BOT_PASSWORD` diversa, gli utenti già autorizzati restano tali (flag nel DO persiste).

**Soluzione:** Decidere se:
- Password nel DO (più sicuro)
- O checksum della password nel DO per validazione

---

### 3. **Endpoint `/portfolio` con Prezzi Live Fragile**

**Bug Potenziale:** Se FMP API fallisce (403, rate limit, etc.), il codice fallback mantiene prezzi a zero ma **non avvisa l'utente**.

**Codice Problematico:**
```javascript
positions = positions.map(p => ({
  ...p,
  currentPrice: p.avgPrice,  // ← Usa prezzo medio invece del live
  currentValue: p.totalCost, // ← P&L = 0
  profitLoss: 0,
  profitLossPercent: 0
}));
```

**Soluzione:** Aggiungere un warning nel messaggio portfolio se i prezzi sono fallback.

---

### 4. **Hardcoded API Key in `user-storage.js`**

**Vulnerabilità:**
```javascript
const fmpKey = this.env.FMP_API_KEY || 'Q2xs1jKWKU1RcbEGXxAKJgtxP5Q7tnM3';
```

**Problema:** Se `FMP_API_KEY` non è in `env`, usa una chiave pubblica hardcoded che potrebbe:
- Non funzionare
- Essere revocata
- Esporre la chiave nel codice sorgente pubblico

**Soluzione:** Rimuovere fallback, lanciare errore se manca.

---

## 🗑️ Codice Inutilizzato

### 1. **File `src/polygon.js` Non Usato**

**Problema:** La classe `PolygonClient` è **mai importata** in nessun file.

**Evidenza:**
- `src/ai.js` usa `FMPClient`, non Polygon
- Nessun `import { PolygonClient }` nel codebase

**Soluzione:** Rimuovere `src/polygon.js` o sostituire FMP con Polygon se preferito.

---

### 2. **Tool Non Usati in `analyzeStock()`**

**Problema:** I tool definiti in `src/ai.js` per Claude sono solo 3:
- `get_realtime_snapshot`
- `get_historical_prices`
- `get_ticker_details`

Ma `FMPClient` ha anche `getRelatedCompanies()` che **non è esposto come tool**.

**Codice Morto:**
```javascript
// In src/fmp.js
async getRelatedCompanies(ticker) {
  return []; // ← SEMPRE VUOTO
}
```

**Soluzione:** Rimuovere metodo o implementare tool.

---

### 3. **Prompt `promptai.md` vs System Prompt in `ai.js`**

**Problema:** Esiste un file `promptai.md` con un prompt dettagliato, ma **non è mai caricato nel codice**.

**Codice Attuale:**
```javascript
// src/ai.js usa un prompt hardcoded diverso
const systemPrompt = `Sei un analista quantitativo...`;
```

**Soluzione:** Decidere quale prompt usare e unificare.

---

### 4. **Funzione `handleInteractiveStep` Mai Chiamata**

**Problema:** Esiste una funzione completa per wizard interattivi (`WAIT_TICKER`, `WAIT_PRICE`, `WAIT_QTY`), ma **non è mai invocata** in `handleMessage`.

**Codice Orfano (linea ~90-140 in `src/index.js`):**
```javascript
async function handleInteractiveStep(chatId, userId, text, session, env) {
  // ... 50+ righe di codice mai eseguito ...
}
```

**Soluzione:** Rimuovere o integrare nel flusso principale.

---

## 🏗️ Problemi di Architettura

### 1. **Mixing Concerns: Worker + Durable Object**

**Problema:** La logica di business è divisa tra:
- **Worker** (`src/index.js`): parsing comandi, validazione
- **Durable Object** (`src/user-storage.js`): storage + esecuzione alarm (analisi)

**Confusione:**
- Portfolio con prezzi live è nel DO (alarm handler)
- Ma la chiamata FMP API è **sia nel DO che nel Worker** (via FMPClient)

**Soluzione:** Centralizzare tutta la logica FMP nel DO o creare un service layer.

---

### 2. **Stream vs Non-Stream API Calls**

**Problema:** In `src/ai.js` c'è una funzione `fetchAndAccumulateStream` custom per gestire streaming Anthropic API, ma è usata solo qui e **non è testabile/riutilizzabile**.

**Codice Complesso (120+ righe):**
```javascript
async function fetchAndAccumulateStream(url, options) {
  // ... parsing SSE events manuale ...
}
```

**Soluzione:** Valutare librerie esistenti (es. `eventsource-parser`) o estrarre in un modulo dedicato.

---

### 3. **Error Handling Inconsistente**

**Problema:**
- Alcune funzioni loggano errori (`console.error`) e silenziosamente falliscono
- Altre propagano eccezioni
- Nessuna strategia unificata di retry

**Esempi:**
```javascript
// In src/fmp.js
async getHistoricalPrices(ticker, days = 5) {
  try {
    // ...
  } catch (e) {
    console.warn('Historical data fetch failed', e);
    return []; // ← Silenzioso
  }
}

// In src/ai.js
if (!response.ok) {
  throw new Error(`Anthropic API Error: ${response.status}`); // ← Esplicito
}
```

**Soluzione:** Definire una error handling strategy (es. `Result<T, E>` pattern).

---

## ✅ Raccomandazioni di Refactoring

### Priority 1: Critici

1. **Creare `src/telegram.js`**
   ```javascript
   export async function sendMessage(chatId, text, botToken, options = {}) { }
   export function toTelegramHTML(markdown) { }
   export async function editMessage(chatId, messageId, text, botToken) { }
   export async function answerCallback(callbackId, text, botToken) { }
   ```

2. **Fix Tabella Sessions**
   ```javascript
   // Aggiungere in src/user-storage.js constructor
   this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (...)`);
   ```

3. **Rimuovere Hardcoded API Key**
   ```javascript
   const fmpKey = this.env.FMP_API_KEY;
   if (!fmpKey) throw new Error('FMP_API_KEY not configured');
   ```

---

### Priority 2: Performance

4. **Ottimizzare Dati Storici**
   ```javascript
   // In src/fmp.js, ridurre da 5 a 1 giorno se non servono trend
   async getHistoricalPrices(ticker, days = 1) {
     // ...
   }
   ```

5. **Cache FMP Responses**
   ```javascript
   // In src/user-storage.js, cachare quote per 5 min
   const cacheKey = `fmp:${ticker}`;
   const cached = await this.state.storage.get(cacheKey);
   if (cached && cached.timestamp > Date.now() - 300000) {
     return cached.data;
   }
   ```

---

### Priority 3: Pulizia

6. **Rimuovere Codice Morto**
   - Eliminare `src/polygon.js`
   - Eliminare `handleInteractiveStep` e session helpers se non usati
   - Eliminare `getRelatedCompanies` da `FMPClient`

7. **Unificare Prompts**
   - Decidere tra `promptai.md` e prompt in `ai.js`
   - Caricarlo come asset statico o env var

8. **Standardizzare Error Messages**
   ```javascript
   // Creare src/errors.js
   export class APIError extends Error {
     constructor(provider, status, message) {
       super(`[${provider}] ${status}: ${message}`);
       this.provider = provider;
       this.status = status;
     }
   }
   ```

---

## 📊 Metriche Codebase

| Metrica | Valore | Note |
|---------|--------|------|
| **File Totali** | 12 | Include config e docs |
| **Linee di Codice** | ~1200 | Esclusi commenti |
| **Duplicazioni Stimate** | ~15% | Telegram API, error handling |
| **Codice Inutilizzato** | ~20% | Polygon.js, interactive wizard |
| **Test Coverage** | 0% | Nessun test presente |
| **Debt Tecnico** | **Alto** | Serve refactoring priorità 1-2 |

---

## 🎯 Piano d'Azione Consigliato

### Fase 1: Stabilità (1-2 giorni)
- [ ] Fix tabella sessions
- [ ] Rimuovere hardcoded API key
- [ ] Testare flusso completo `/analyze` → alarm → sendMessage

### Fase 2: Pulizia (1 giorno)
- [ ] Creare `src/telegram.js`
- [ ] Rimuovere `src/polygon.js`
- [ ] Eliminare codice wizard interattivo non usato

### Fase 3: Ottimizzazione (2-3 giorni)
- [ ] Implementare cache FMP responses
- [ ] Unificare error handling
- [ ] Aggiungere unit test per funzioni critiche

---

## 🔍 Conclusioni

La codebase è **funzionale ma necessita refactoring** per:
- Ridurre duplicazioni (~15%)
- Rimuovere codice morto (~20%)
- Migliorare manutenibilità

**Rischio Attuale:** Medio - Il bot funziona ma bug latenti (sessions, password, cache) potrebbero emergere in produzione.

**Raccomandazione:** Iniziare da Priority 1, poi iterare su Priority 2-3 in base a feedback utenti.