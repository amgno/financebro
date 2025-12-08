export class FMPClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // Aggiornato base URL secondo la documentazione recente
    this.baseUrl = 'https://financialmodelingprep.com/stable';
  }

  async fetch(endpoint, params = {}) {
    // Rimuovi slash iniziale se presente per evitare doppi slash
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = new URL(`${this.baseUrl}/${cleanEndpoint}`);
    
    url.searchParams.append('apikey', this.apiKey);
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      // 403 spesso significa endpoint premium o key errata
      throw new Error(`FMP API Error: ${response.status}`);
    }

    return await response.json();
  }

  // 1. Get Real-Time Quote
  async getRealtimeSnapshot(ticker) {
    // Endpoint: /quote?symbol={symbol}
    const data = await this.fetch('quote', { symbol: ticker });
    return data && data.length > 0 ? data[0] : null;
  }

  // 2. Get Historical Price Data (Ultimi 30 giorni)
  async getHistoricalPrices(ticker, days = 5) {
    // Endpoint: /historical-price-eod/full?symbol={symbol}
    // Nota: l'endpoint historical-price-full potrebbe essere premium per dati vecchi, 
    // ma solitamente free per dati recenti.
    try {
        const data = await this.fetch('historical-price-eod/full', { 
            symbol: ticker,
            timeseries: days 
        });
        // FMP a volte ignora timeseries su questo endpoint, quindi filtriamo noi per sicurezza
        const history = data.historical || [];
        return history.slice(0, days);
    } catch (e) {
        console.warn('Historical data fetch failed', e);
        return [];
    }
  }

  // 3. Get Ticker Details (Company Profile)
  async getTickerDetails(ticker) {
    // Endpoint: /profile?symbol={symbol}
    const data = await this.fetch('profile', { symbol: ticker });
    return data && data.length > 0 ? data[0] : null;
  }

  // 4. Get Related Companies
  async getRelatedCompanies(ticker) {
     // FMP non ha un endpoint "stable" chiaro per peers nei docs free rapidi, 
     // ma proviamo stock-peers su v4 o simile se accessibile, altrimenti torniamo vuoto per sicurezza
     // URL: https://financialmodelingprep.com/api/v4/stock_peers?symbol=AAPL (spesso richiede premium o v4)
     // Proviamo invece la ricerca simili se peers fallisce, o saltiamo.
     // Per ora disabilitiamo per evitare errori 403 se non documentato in "stable" free
     return [];
  }
}