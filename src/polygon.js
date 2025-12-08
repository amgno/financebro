export class PolygonClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.polygon.io';
  }

  async fetch(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append('apiKey', this.apiKey);
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }

    const response = await fetch(url.toString());
    
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    
    if (!response.ok) {
      throw new Error(`Polygon API Error: ${response.status}`);
    }

    return await response.json();
  }

  // 1. Get Real-Time Snapshot (Aggregato giorno precedente + snapshot corrente)
  async getRealtimeSnapshot(ticker) {
    // Prova snapshot, se fallisce (es. 403 free tier), usa previous close
    try {
        // Nota: Endpoint snapshot spesso richiede piano starter ($29/mo)
        return await this.fetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
    } catch (e) {
        console.warn(`Snapshot failed for ${ticker} (${e.message}), falling back to previous close`);
        return this.getPreviousClose(ticker);
    }
  }

  // 2. Get Previous Close (Fallback o dati ieri)
  async getPreviousClose(ticker) {
    return await this.fetch(`/v2/aggs/ticker/${ticker}/prev`);
  }

  // 3. Get Historical Price Data
  async getHistoricalPrices(ticker, days = 30) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const from = fromDate.toISOString().split('T')[0];

    return await this.fetch(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
      sort: 'asc',
      limit: 365
    });
  }

  // 4. Get Ticker Details (Company Info)
  async getTickerDetails(ticker) {
    return await this.fetch(`/v3/reference/tickers/${ticker}`);
  }

  // 5. Get Related Companies
  async getRelatedCompanies(ticker) {
    return await this.fetch(`/v1/related-companies/${ticker}`);
  }
}
