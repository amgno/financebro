import { analyzeStock } from './ai.js';
import { sendMessage } from './telegram.js';

// Durable Object: Storage isolato per ogni utente (SQLite)
export class UserStorage {
    constructor(state, env) {
      this.state = state;
      this.env = env;
      
      // Inizializza database SQLite
      this.sql = this.state.storage.sql;
      
      // Crea tabella transazioni se non esiste
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          ticker TEXT NOT NULL,
          quantity REAL NOT NULL,
          price REAL NOT NULL,
          operation_date TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      
      // Tabella per rate limiting (reset giornaliero)
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          date TEXT PRIMARY KEY,
          count INTEGER DEFAULT 0
        )
      `);

      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      // Tabella autorizzazioni (per password protection)
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS auth (
            authorized INTEGER DEFAULT 0
        )
      `);
      // Inserisce riga default se vuota - usando check count
      const count = this.sql.exec('SELECT count(*) as c FROM auth').one().c;
      if (count === 0) {
          this.sql.exec('INSERT INTO auth (authorized) VALUES (0)');
      }

      // Tabella sessioni per wizard interattivi (se necessaria in futuro)
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          user_id TEXT PRIMARY KEY,
          type TEXT,
          step TEXT,
          data TEXT
        )
      `);

      // Migrazione rapida per aggiungere operation_date se manca (fix per database esistenti)
      try {
        this.sql.exec('ALTER TABLE transactions ADD COLUMN operation_date TEXT');
      } catch (e) {
        // Ignora errore se la colonna esiste già (SQLite non ha ADD COLUMN IF NOT EXISTS nativo semplice)
      }
    }
  
    // Metodo chiamato dal Worker per gestire richieste
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;
  
      // GET /data - Leggi tutti i dati utente
      if (path === '/data' && request.method === 'GET') {
        const transactions = this.sql.exec(
          'SELECT * FROM transactions ORDER BY created_at DESC'
        ).toArray();
        
        return new Response(JSON.stringify({ transactions }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /schedule-analysis - Pianifica analisi in background
      if (path === '/schedule-analysis' && request.method === 'POST') {
        const payload = await request.json();
        
        // Salva lo stato del job pendente
        await this.state.storage.put('pending_analysis', payload);
        
        // Imposta l'alarm per scattare tra 100ms
        // Questo disaccoppia l'esecuzione dal Worker chiamante
        await this.state.storage.setAlarm(Date.now() + 100);
        
        return new Response('Scheduled', { status: 200 });
      }
  
      // POST /transaction - Aggiungi una transazione
      if (path === '/transaction' && request.method === 'POST') {
        const transaction = await request.json();
        
        const id = `tx_${Date.now()}`;
        const createdAt = new Date().toISOString();
        // Usa la data fornita o oggi come default
        const operationDate = transaction.date || new Date().toISOString().split('T')[0];
        
        this.sql.exec(
          `INSERT INTO transactions (id, type, ticker, quantity, price, operation_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id,
          transaction.type,
          transaction.ticker,
          transaction.quantity,
          transaction.price,
          operationDate,
          createdAt
        );
  
        return new Response(JSON.stringify({ 
          success: true, 
          transaction: { id, ...transaction, operation_date: operationDate, created_at: createdAt }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // GET /rate-limit - Verifica limite giornaliero
      if (path === '/rate-limit' && request.method === 'GET') {
        const today = new Date().toISOString().split('T')[0];
        // Usa prima toArray() per vedere se ci sono risultati
        const results = this.sql.exec(
          'SELECT count FROM rate_limits WHERE date = ?',
          today
        ).toArray();
        
        const count = results.length > 0 ? results[0].count : 0;
        const limit = 20; // Default limit
        
        return new Response(JSON.stringify({ 
          count, 
          limit, 
          remaining: Math.max(0, limit - count),
          allowed: count < limit
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /rate-limit/increment - Incrementa contatore
      if (path === '/rate-limit/increment' && request.method === 'POST') {
        const today = new Date().toISOString().split('T')[0];
        
        this.sql.exec(
          `INSERT INTO rate_limits (date, count) 
           VALUES (?, 1) 
           ON CONFLICT(date) DO UPDATE SET count = count + 1`,
          today
        );
        
        const newCount = this.sql.exec(
          'SELECT count FROM rate_limits WHERE date = ?',
          today
        ).one().count;

        return new Response(JSON.stringify({ count: newCount }), {
            headers: { 'Content-Type': 'application/json' }
        });
      }

      // KV Store per dati temporanei (es. analisi espansa)
      // GET /kv?key=...
      if (path === '/kv' && request.method === 'GET') {
        const key = url.searchParams.get('key');
        const results = this.sql.exec('SELECT value FROM settings WHERE key = ?', key).toArray();
        return new Response(JSON.stringify({ value: results.length > 0 ? results[0].value : null }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /kv
      if (path === '/kv' && request.method === 'POST') {
        const { key, value } = await request.json();
        this.sql.exec(
          `INSERT INTO settings (key, value) VALUES (?, ?) 
           ON CONFLICT(key) DO UPDATE SET value = ?`,
          key, value, value
        );
        return new Response('OK', { status: 200 });
      }

      // AUTH ENDPOINTS
      if (path === '/is-authorized' && request.method === 'GET') {
          // Usa .toArray() e controlla length invece di .one() che lancia eccezione se vuoto
          const rows = this.sql.exec('SELECT authorized FROM auth').toArray();
          const authorized = rows.length > 0 ? !!rows[0].authorized : false;
          
          return new Response(JSON.stringify({ authorized }), {
              headers: { 'Content-Type': 'application/json' }
          });
      }

      if (path === '/authorize' && request.method === 'POST') {
          // Upsert logica: se esiste aggiorna, altrimenti inserisci
          // Controlliamo prima se c'è una riga
          const rows = this.sql.exec('SELECT * FROM auth').toArray();
          if (rows.length === 0) {
              this.sql.exec('INSERT INTO auth (authorized) VALUES (1)');
          } else {
              this.sql.exec('UPDATE auth SET authorized = 1');
          }
          return new Response('OK', { status: 200 });
      }

      if (path === '/deauthorize' && request.method === 'POST') {
          this.sql.exec('UPDATE auth SET authorized = 0');
          return new Response('OK', { status: 200 });
      }

      // SESSION ENDPOINTS
      if (path === '/session' && request.method === 'GET') {
          const userId = url.searchParams.get('userId');
          const session = this.sql.exec('SELECT * FROM sessions WHERE user_id = ?', userId).one();
          return new Response(JSON.stringify(session || null), { headers: { 'Content-Type': 'application/json' }});
      }

      if (path === '/session' && request.method === 'POST') {
          const { userId, type, step, data } = await request.json();
          this.sql.exec(
            `INSERT INTO sessions (user_id, type, step, data) VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET type = ?, step = ?, data = ?`,
            userId, type, step, JSON.stringify(data),
            type, step, JSON.stringify(data)
          );
          return new Response('OK');
      }

      if (path === '/session' && request.method === 'DELETE') {
          const userId = url.searchParams.get('userId');
          this.sql.exec('DELETE FROM sessions WHERE user_id = ?', userId);
          return new Response('OK');
      }
  
      // GET /portfolio - Calcola portfolio corrente con P&L live
      if (path === '/portfolio' && request.method === 'GET') {
        const transactions = this.sql.exec(
          'SELECT * FROM transactions ORDER BY created_at ASC'
        ).toArray();
        
        // 1. Calcola posizioni base (Quantità e Prezzo Medio)
        let positions = this.calculatePositions(transactions);

        // Inizializza con valori default (Safe Mode)
        positions = positions.map(p => ({
            ...p,
            currentPrice: p.avgPrice,
            currentValue: p.totalCost,
            profitLoss: 0,
            profitLossPercent: 0
        }));

        if (positions.length > 0) {
            // 2. Recupera prezzi live da FMP
            try {
                const fmpKey = this.env.FMP_API_KEY;
                if (!fmpKey) {
                    throw new Error('FMP_API_KEY non configurata');
                }
                const tickers = positions.map(p => p.ticker).join(',');
                
                console.log(`[Portfolio] Fetching prices for: ${tickers}`);

                // Usa endpoint 'stable' e parametro 'symbol' come in fmp.js (che sappiamo funzionare)
                const fmpResponse = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${tickers}&apikey=${fmpKey}`);
                
                if (!fmpResponse.ok) {
                    const errText = await fmpResponse.text();
                    console.error(`[Portfolio] FMP Error ${fmpResponse.status}: ${errText}`);
                    throw new Error(`API Error: ${fmpResponse.status}`);
                }
                
                const quotes = await fmpResponse.json();
                
                if (!Array.isArray(quotes)) {
                    console.error('[Portfolio] Invalid API response format:', quotes);
                    throw new Error('Invalid API response');
                }

                // Mappa per accesso rapido
                const priceMap = {};
                quotes.forEach(q => priceMap[q.symbol] = q.price);
                
                console.log(`[Portfolio] Prices found:`, Object.keys(priceMap));

                // 3. Arricchisci posizioni con P&L reale
                positions = positions.map(p => {
                    const currentPrice = priceMap[p.ticker];
                    
                    if (currentPrice === undefined) {
                        console.warn(`[Portfolio] No price found for ${p.ticker}, using avgPrice`);
                        return p; // Mantiene i valori default (0 P&L)
                    }

                    const currentValue = p.quantity * currentPrice;
                    const profitLoss = currentValue - p.totalCost;
                    const profitLossPercent = p.avgPrice > 0 ? ((currentPrice - p.avgPrice) / p.avgPrice) * 100 : 0;

                    return {
                        ...p,
                        currentPrice,
                        currentValue,
                        profitLoss,
                        profitLossPercent
                    };
                });
            } catch (e) {
                console.error('[Portfolio] Error fetching prices:', e);
                // Continua con i valori di default
            }
        }
  
        return new Response(JSON.stringify({ positions }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
  
      return new Response('Not Found', { status: 404 });
    }
  
    // Calcola posizioni correnti dal log transazioni
    calculatePositions(transactions) {
      const positions = {};
  
      for (const tx of transactions) {
        if (!positions[tx.ticker]) {
          positions[tx.ticker] = {
            ticker: tx.ticker,
            quantity: 0,
            avgPrice: 0,
            totalCost: 0
          };
        }
  
        const pos = positions[tx.ticker];
  
        if (tx.type === 'BUY') {
          const newTotal = pos.totalCost + (tx.quantity * tx.price);
          const newQty = pos.quantity + tx.quantity;
          pos.avgPrice = newQty > 0 ? newTotal / newQty : 0;
          pos.quantity = newQty;
          pos.totalCost = newTotal;
        } else if (tx.type === 'SELL') {
          pos.quantity -= tx.quantity;
          pos.totalCost -= (tx.quantity * pos.avgPrice);
        }
      }
  
      // Rimuovi posizioni chiuse
      return Object.values(positions).filter(p => p.quantity > 0);
    }

    // Alarm Handler: Esegue l'analisi in background
    async alarm() {
      const job = await this.state.storage.get('pending_analysis');
      if (!job) return;
      
      const { ticker, chatId, budget, portfolio } = job;
      
      try {
        console.log(`[DO Alarm] Starting analysis for ${ticker}...`);
        
        // Nota: Le API Keys devono essere passate o accessibili via this.env
        // In Durable Objects, this.env contiene i bindings
        
        const fmpKey = this.env.FMP_API_KEY;
        const anthropicKey = this.env.ANTHROPIC_API_KEY;
        
        if (!fmpKey || !anthropicKey) {
            throw new Error('API Keys non configurate correttamente');
        }

        const analysisText = await analyzeStock(ticker, anthropicKey, fmpKey, budget, portfolio);
        
        await this.sendMessage(chatId, analysisText);
        
        // Pulizia job
        await this.state.storage.delete('pending_analysis');
        console.log(`[DO Alarm] Analysis completed for ${ticker}`);

      } catch (error) {
        console.error('[DO Alarm] Analysis failed:', error);
        await this.sendMessage(chatId, `⚠️ Errore durante l'analisi background: ${error.message}`);
      }
    }

    async sendMessage(chatId, text) {
      // Usa la funzione condivisa dal modulo telegram.js
      await sendMessage(chatId, text, this.env.TELEGRAM_BOT_TOKEN);
    }
  }