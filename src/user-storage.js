// Durable Object: Storage isolato per ogni utente (SQLite)
export class UserStorage {
    constructor(state, env) {
      this.state = state;
      this.env = env;
      
      // Inizializza database SQLite
      this.sql = this.state.storage.sql;
      
      // Crea tabella se non esiste
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          ticker TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          price REAL NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
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
  
      // POST /transaction - Aggiungi una transazione
      if (path === '/transaction' && request.method === 'POST') {
        const transaction = await request.json();
        
        const id = `tx_${Date.now()}`;
        const createdAt = new Date().toISOString();
        
        this.sql.exec(
          `INSERT INTO transactions (id, type, ticker, quantity, price, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          id,
          transaction.type,
          transaction.ticker,
          transaction.quantity,
          transaction.price,
          createdAt
        );
  
        return new Response(JSON.stringify({ 
          success: true, 
          transaction: { id, ...transaction, created_at: createdAt }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
  
      // GET /portfolio - Calcola portfolio corrente
      if (path === '/portfolio' && request.method === 'GET') {
        const transactions = this.sql.exec(
          'SELECT * FROM transactions ORDER BY created_at ASC'
        ).toArray();
        
        // Calcola posizioni (logica semplificata)
        const positions = this.calculatePositions(transactions);
  
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
  }