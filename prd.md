# Product Requirements Document (PRD)
## Telegram Stock Analysis Bot with AI Integration

**Version:** 1.0  
**Date:** December 8, 2025  
**Author:** Magno

---

## 1. Executive Summary

A Telegram bot that provides AI-powered stock analysis using Anthropic's Claude API, with portfolio tracking capabilities. The bot analyzes US stock tickers on demand and maintains a user's trading portfolio through natural language commands.

---

## 2. Project Overview

### 2.1 Objectives
- Provide instant AI-powered stock analysis via Telegram
- Track user portfolio with buy/sell operations
- Deliver structured, actionable insights with expandable details
- Maintain low response times and user-friendly interactions

### 2.2 Scope

**Phase 1 (Current):**
- Stock analysis via Anthropic Claude Sonnet 4.5
- Portfolio management (buy/sell tracking)
- Multi-user support with isolated portfolios
- Basic commands and error handling

**Phase 2 (Future):**
- TradingView chart screenshots integration
- Automated browser login and capture
- Visual analysis enhancement

---

## 3. Technical Stack

### 3.1 Existing Infrastructure
- **Platform:** Cloudflare Workers
- **Database:** Durable Objects with SQLite
- **Bot Framework:** Telegram Bot API (already connected)
- **Basic scripts:** Message handling implemented

### 3.2 New Integrations
- **AI Provider:** Anthropic Claude API (Sonnet 4.5 model: `claude-sonnet-4-5-20250929`)
- **Secrets Management:** Cloudflare Secrets (for API keys and credentials)

### 3.3 Future Additions (Phase 2)
- Browser automation service (TBD: Browserless, AWS Lambda, or similar)
- TradingView integration for chart screenshots

---

## 4. Functional Requirements

### 4.1 Stock Analysis

#### 4.1.1 Single Stock Analysis
**Command:** `/analyze TICKER`

**Flow:**
1. User sends command with valid US stock ticker
2. Bot shows typing indicator
3. Bot calls Anthropic API with predefined prompt and ticker
4. Bot returns structured short analysis
5. Bot provides inline button "📊 Analisi completa" for expanded view

**Short Analysis Format:**
```
📊 [TICKER] - [Company Name]
💰 Prezzo: $XXX.XX

⭐ Rating: [Bullish/Neutral/Bearish]

🔑 Punti Chiave:
• [Key point 1]
• [Key point 2]
• [Key point 3]

💡 Raccomandazione: [Brief recommendation]
```

**Expanded Analysis:**
Triggered by inline button, provides comprehensive AI analysis including:
- Detailed fundamental analysis
- Market context and sector trends
- Risk factors
- Technical considerations (if relevant)
- Investment thesis

#### 4.1.2 Multiple Stock Analysis
**Command:** `/analyze TICKER1 TICKER2 TICKER3 ...`

**Flow:**
1. Bot processes each ticker sequentially
2. Sends short analysis for each stock separately
3. Each analysis includes its own "📊 Analisi completa" button

**Constraints:**
- Process one ticker at a time (no parallel requests)
- Maintain typing indicator between analyses
- Maximum recommended: 5 tickers per command (can be adjusted based on rate limits)

### 4.2 Portfolio Management

#### 4.2.1 Buy Operation
**Command:** `/buy TICKER PRICE [QUANTITY] [DATE]`

**Examples:**
- `/buy AAPL 150.50`
- `/buy AAPL 150.50 10`
- `/buy AAPL 150.50 10 2024-12-01`

**Natural Language Support:**
User can also write: "ho comprato AAPL a 150.50" or "bought AAPL at 150.50 on December 1st"

**Flow:**
1. Bot receives command
2. If using natural language, calls Anthropic API to extract structured data (ticker, price, quantity, date)
3. Validates required fields (ticker, price)
4. If missing required fields, responds with: "❌ Informazioni mancanti: [lista campi]"
5. Saves to database with:
   - user_id (Telegram user ID)
   - ticker
   - operation_type: "BUY"
   - quantity (default: 1 if not specified)
   - price
   - date (default: current date if not specified)
   - timestamp (auto-generated)
6. Confirms with message: "✅ Acquisto registrato: [quantity]x [TICKER] @ $[price]"

#### 4.2.2 Sell Operation
**Command:** `/sell TICKER PRICE [QUANTITY] [DATE]`

**Flow:**
Same as buy operation, but:
- operation_type: "SELL"
- Handles partial sales (sells specified quantity from existing holdings)
- If selling more than owned, warns user: "⚠️ Quantità venduta ([X]) supera possesso attuale ([Y])"
- Calculates P&L for the sold position

#### 4.2.3 Portfolio View
**Command:** `/portfolio`

**Response Format:**
```
📊 Il Tuo Portfolio

💼 Posizioni Aperte:
• AAPL: 10 azioni @ media $150.50
  Valore: $1,505.00 | P&L: +$50 (+3.32%)
• MSFT: 5 azioni @ media $380.00
  Valore: $1,900.00 | P&L: -$25 (-1.30%)

💰 Totale Investito: $3,305.00
📈 Valore Corrente: $3,405.00
📊 P&L Totale: +$100.00 (+3.02%)
```

**Data Requirements:**
- Fetches current market prices via Anthropic Claude API (Claude can access real-time stock prices)
- Calculates average buy price for each ticker
- Shows unrealized gains/losses

#### 4.2.4 Transaction History
**Command:** `/history [TICKER] [LIMIT]`

**Examples:**
- `/history` - shows last 10 transactions
- `/history AAPL` - shows all AAPL transactions
- `/history 20` - shows last 20 transactions

**Response Format:**
```
📜 Storico Operazioni

🔹 2024-12-01: BUY 10x AAPL @ $150.50
🔹 2024-11-15: SELL 5x MSFT @ $380.00
🔹 2024-11-10: BUY 15x MSFT @ $375.00
...
```

### 4.3 Help and Information

#### 4.3.1 Help Command
**Command:** `/help` or `/start`

**Response:**
```
🤖 Stock Analysis Bot

📊 Analisi Titoli:
/analyze TICKER - Analisi AI di un titolo
/analyze TICKER1 TICKER2 - Analisi multipla

💼 Portfolio:
/buy TICKER PRICE [QTY] [DATE] - Registra acquisto
/sell TICKER PRICE [QTY] [DATE] - Registra vendita
/portfolio - Visualizza portfolio
/history [TICKER] [LIMIT] - Storico operazioni

💡 Puoi anche usare linguaggio naturale:
"ho comprato AAPL a 150"
"analizza Apple"

ℹ️ Mercati supportati: USA (NYSE, NASDAQ)
🤖 Powered by Claude Sonnet 4.5
```

### 4.4 Error Handling

#### 4.4.1 Invalid Ticker
**Scenario:** User enters non-existent or non-US ticker

**Response:**
```
❌ Ticker "[TICKER]" non trovato nei mercati USA

Forse cercavi:
• AAPL - Apple Inc.
• MSFT - Microsoft Corporation
• [Altri suggerimenti basati su similarità]

💡 Usa /help per vedere i mercati supportati
```

**Implementation:**
- Validate ticker via Anthropic Claude API call
- Claude will check if ticker exists and suggest similar valid tickers
- Cache valid tickers to reduce API calls

#### 4.4.2 API Failures
**Scenario:** Anthropic API returns error or times out

**Response:**
```
⚠️ Servizio temporaneamente non disponibile

L'analisi AI non è al momento disponibile. Riprova tra qualche istante.

Se il problema persiste, contatta il supporto.
```

**No automatic retry** - user must manually retry

#### 4.4.3 Missing Data in Commands
**Response:**
```
❌ Informazioni mancanti

Per registrare l'operazione servono:
✅ Ticker (es. AAPL)
✅ Prezzo (es. 150.50)
⚪ Quantità (opzionale, default: 1)
⚪ Data (opzionale, default: oggi)

Esempio: /buy AAPL 150.50 10 2024-12-01
```

#### 4.4.4 Rate Limiting
**Limit:** 20 analysis requests per user per day

**Response when exceeded:**
```
⏸️ Limite giornaliero raggiunto

Hai raggiunto il limite di 20 analisi giornaliere.
Il limite si resetta a mezzanotte UTC.

Richieste utilizzate: 20/20
Prossimo reset: tra [X] ore
```

**Implementation:**
- Track requests per user_id per day in database
- Reset counter at midnight UTC
- Admin users (configurable) have unlimited requests

---

## 5. Data Models

### 5.1 User Portfolio Table
```sql
CREATE TABLE portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    operation_type VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
    quantity DECIMAL(10,4) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    operation_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_ticker (user_id, ticker),
    INDEX idx_user_date (user_id, operation_date)
);
```

### 5.2 Rate Limiting Table
```sql
CREATE TABLE rate_limits (
    user_id INTEGER PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    last_reset DATE NOT NULL,
    INDEX idx_user_reset (user_id, last_reset)
);
```

### 5.3 User Preferences (Optional, Future)
```sql
CREATE TABLE user_preferences (
    user_id INTEGER PRIMARY KEY,
    language VARCHAR(2) DEFAULT 'it',
    timezone VARCHAR(50) DEFAULT 'UTC',
    notifications_enabled BOOLEAN DEFAULT true
);
```

---

## 6. API Integration

### 6.1 Anthropic Claude API

#### 6.1.1 Stock Analysis Call
**Endpoint:** `https://api.anthropic.com/v1/messages`

**Request Structure:**
```javascript
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 2000, // Adjust based on analysis length
  "messages": [
    {
      "role": "user",
      "content": `${PREDEFINED_PROMPT}

Ticker to analyze: ${ticker}

Provide a structured analysis with:
1. Rating (Bullish/Neutral/Bearish)
2. 3-5 key points
3. Brief recommendation
4. Expanded analysis for detailed view`
    }
  ]
}
```

**Headers:**
```javascript
{
  "x-api-key": ANTHROPIC_API_KEY, // From Cloudflare Secrets
  "anthropic-version": "2023-06-01",
  "content-type": "application/json"
}
```

**Response Parsing:**
Parse Claude's response to extract:
- Short analysis (for immediate display)
- Extended analysis (for inline button expansion)

#### 6.1.2 Natural Language Parsing Call
**Purpose:** Extract structured data from natural language buy/sell commands

**Request Structure:**
```javascript
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 500,
  "messages": [
    {
      "role": "user",
      "content": `Extract trading operation details from this text: "${user_message}"

Return ONLY a JSON object with these fields:
{
  "ticker": "string (stock symbol)",
  "operation": "BUY or SELL",
  "price": number,
  "quantity": number or null,
  "date": "YYYY-MM-DD or null"
}

If any required field (ticker, operation, price) is missing, set it to null.`
    }
  ]
}
```

**Response:** Parse JSON from Claude's response

### 6.2 Polygon.io API Integration (Stock Data Tool for Claude)

**Provider:** Polygon.io  
**Free Tier:** 5 requests per minute  
**Base URL:** `https://api.polygon.io`  
**Authentication:** API Key in query parameter `?apiKey={POLYGON_API_KEY}`

#### 6.2.1 Overview

Polygon.io API will be integrated as a **tool** that Claude can call during stock analysis. This provides Claude with real-time and historical market data to generate data-driven insights.

**Key Benefits:**
- Real-time price data for accurate analysis
- Historical trends for technical analysis
- Company fundamentals for comprehensive evaluation
- Related companies for comparative analysis

#### 6.2.2 Available Endpoints as Tools for Claude

**1. Get Current Quote (Previous Day Aggregate)**
```
GET /v2/aggs/ticker/{ticker}/prev?apiKey={key}
```

**Returns:**
- Open, High, Low, Close prices
- Trading volume
- Volume-weighted average price (VWAP)
- Number of transactions
- Timestamp

**Use Case:** Get yesterday's full trading data + current price context

**Tool Definition:**
```javascript
{
  name: "get_current_quote",
  description: "Get previous day's OHLC data and current price context for a stock ticker",
  parameters: {
    ticker: {
      type: "string",
      description: "Stock ticker symbol (e.g., AAPL, MSFT)",
      required: true
    }
  }
}
```

---

**2. Get Real-Time Snapshot**
```
GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}?apiKey={key}
```

**Returns:**
- Current/last trade price
- Today's open, high, low
- Today's change and change percentage
- Current bid/ask prices
- Today's volume
- Previous close
- Updated timestamp

**Use Case:** Real-time market data for current trading day

**Tool Definition:**
```javascript
{
  name: "get_realtime_snapshot",
  description: "Get real-time snapshot with current price, day's change, volume, and trading stats",
  parameters: {
    ticker: {
      type: "string",
      description: "Stock ticker symbol",
      required: true
    }
  }
}
```

---

**3. Get Historical Price Data**
```
GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}?apiKey={key}
```

**Parameters:**
- `multiplier`: 1
- `timespan`: day, week, month
- `from`: Start date (YYYY-MM-DD)
- `to`: End date (YYYY-MM-DD)

**Returns:** Array of OHLCV data for each period

**Use Cases:**
- 30-day trend analysis
- 90-day quarterly performance
- 365-day yearly performance

**Tool Definition:**
```javascript
{
  name: "get_historical_prices",
  description: "Get historical OHLC price data for trend and performance analysis",
  parameters: {
    ticker: {
      type: "string",
      description: "Stock ticker symbol",
      required: true
    },
    days: {
      type: "number",
      description: "Number of days of history to fetch (default: 30, max: 365)",
      required: false,
      default: 30
    }
  }
}
```

**Implementation:** Convert `days` parameter to date range automatically

---

**4. Get Ticker Details (Company Info)**
```
GET /v3/reference/tickers/{ticker}?apiKey={key}
```

**Returns:**
- Company name
- Market capitalization
- Primary exchange
- Currency
- Outstanding shares
- Share class shares outstanding
- Weighted shares outstanding
- Market description
- Ticker type (CS = Common Stock, etc.)
- Locale and primary exchange

**Use Case:** Fundamental company information

**Tool Definition:**
```javascript
{
  name: "get_ticker_details",
  description: "Get company information including name, market cap, sector, and exchange",
  parameters: {
    ticker: {
      type: "string",
      description: "Stock ticker symbol",
      required: true
    }
  }
}
```

---

**5. Get Daily Open/Close**
```
GET /v1/open-close/{ticker}/{date}?apiKey={key}
```

**Parameters:**
- `date`: YYYY-MM-DD format

**Returns:** Specific day's open, high, low, close, volume, pre/after market data

**Use Case:** Precise daily data for specific dates

**Tool Definition:**
```javascript
{
  name: "get_daily_ohlc",
  description: "Get specific trading day's open, high, low, close data",
  parameters: {
    ticker: {
      type: "string",
      description: "Stock ticker symbol",
      required: true
    },
    date: {
      type: "string",
      description: "Date in YYYY-MM-DD format (default: yesterday)",
      required: false
    }
  }
}
```

---

**6. Get Related Companies**
```
GET /v1/related-companies/{ticker}?apiKey={key}
```

**Returns:** List of similar companies based on:
- Same sector
- Similar market cap
- Business model similarities

**Use Case:** Comparative analysis with competitors/peers

**Tool Definition:**
```javascript
{
  name: "get_related_companies",
  description: "Get similar/competitor companies for comparative analysis",
  parameters: {
    ticker: {
      type: "string",
      description: "Stock ticker symbol",
      required: true
    }
  }
}
```

#### 6.2.3 Integration Flow with Claude

**Step-by-Step Process:**

1. **User Request:** `/analyze AAPL`

2. **Bot → Anthropic API Call:**
```javascript
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 2000,
  "messages": [
    {
      "role": "user",
      "content": `${PREDEFINED_ANALYSIS_PROMPT}

Ticker to analyze: AAPL

You have access to real-time market data tools. Use them to provide data-driven analysis.`
    }
  ],
  "tools": [
    // All 6 Polygon.io tools defined above
  ]
}
```

3. **Claude Decides Which Tools to Call:**
   - Example: Claude calls `get_realtime_snapshot`, `get_historical_prices(30)`, `get_ticker_details`

4. **Bot Executes Tool Calls:**
   - Makes actual HTTP requests to Polygon.io
   - Returns formatted results to Claude

5. **Claude Synthesizes Analysis:**
   - Uses real data in analysis
   - Cites specific numbers (current price, trend, volume)

6. **Bot Returns Final Response:**
   - Structured short analysis with real data
   - Inline button for expanded analysis

**Example Tool Call Flow:**
```
Claude: [calls get_realtime_snapshot(AAPL)]
Bot: Returns {"current_price": 195.50, "change_percent": 2.3, ...}

Claude: [calls get_historical_prices(AAPL, 30)]
Bot: Returns 30 days of OHLC data

Claude: [calls get_ticker_details(AAPL)]
Bot: Returns {"name": "Apple Inc.", "market_cap": 3000000000000, ...}

Claude: Generates analysis using this data
```

#### 6.2.4 Rate Limiting Strategy

**Challenge:** 5 requests/minute is restrictive for multiple concurrent users

**Solutions:**

**1. Aggressive Caching**
```javascript
const CACHE_DURATIONS = {
  realtime_snapshot: 5 * 60,      // 5 minutes
  current_quote: 5 * 60,          // 5 minutes
  historical_prices: 60 * 60,     // 1 hour
  ticker_details: 24 * 60 * 60,   // 24 hours
  daily_ohlc: 24 * 60 * 60,       // 24 hours
  related_companies: 7 * 24 * 60 * 60  // 7 days
};
```

**Cache Storage:** Cloudflare KV or Durable Object memory

**Cache Key Format:** `polygon:{endpoint}:{ticker}:{params}:{timestamp}`

**2. Request Queue Implementation**
```javascript
class PolygonRateLimiter {
  constructor() {
    this.requestsThisMinute = [];
    this.maxRequestsPerMinute = 5;
  }

  async makeRequest(endpoint, params) {
    // Check cache first
    const cacheKey = this.buildCacheKey(endpoint, params);
    const cached = await KV.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Wait if rate limit reached
    await this.waitForAvailableSlot();

    // Make request
    const response = await fetch(`${POLYGON_BASE_URL}${endpoint}`, {
      headers: { /* ... */ }
    });

    // Track request
    this.requestsThisMinute.push(Date.now());

    // Cache result
    await this.cacheResponse(cacheKey, response);

    return response;
  }

  async waitForAvailableSlot() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove requests older than 1 minute
    this.requestsThisMinute = this.requestsThisMinute.filter(
      time => time > oneMinuteAgo
    );

    if (this.requestsThisMinute.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requestsThisMinute[0];
      const waitTime = 60000 - (now - oldestRequest) + 1000; // +1s buffer
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}
```

**3. Smart Tool Usage Limits**
- **Maximum 3 tool calls** per analysis to stay within rate limits
- **Priority order** for Claude's tool selection:
  1. `get_realtime_snapshot` (most valuable for current analysis)
  2. `get_historical_prices` (trend context)
  3. `get_ticker_details` (fundamental info)
  4. Others as needed

**4. Batch Processing for Portfolio**
- When user requests `/portfolio`, batch all ticker requests
- Use cached data if available (up to 1 hour old is acceptable)
- If rate limit hit, display: "⚠️ Prezzi di mercato temporaneamente non disponibili. Ultimi dati: [timestamp]"

**5. Fallback Strategy**
```javascript
async function getStockPrice(ticker) {
  try {
    // Try Polygon.io
    return await polygon.getRealtimeSnapshot(ticker);
  } catch (error) {
    if (error.code === 'RATE_LIMIT') {
      // Use cache even if expired
      const staleCache = await getStaleCache(ticker);
      if (staleCache) {
        return {
          ...staleCache,
          _warning: "Using cached data due to rate limit"
        };
      }
    }
    throw error;
  }
}
```

#### 6.2.5 Error Handling

**Error Scenarios:**

1. **Rate Limit Exceeded (429)**
   - Use cached data if available
   - Queue request for later
   - Inform user of delay

2. **Invalid Ticker (404)**
   - Return error to Claude
   - Claude suggests alternatives via ticker validation

3. **API Timeout**
   - Retry once with exponential backoff
   - If fails, proceed without that data point

4. **Invalid API Key (401)**
   - Log critical error
   - Notify admin
   - Use fallback mock data for testing

**Error Response Format:**
```javascript
{
  error: true,
  code: "RATE_LIMIT" | "NOT_FOUND" | "TIMEOUT" | "AUTH_ERROR",
  message: "Human-readable error message",
  cached_data: {...} // If available
}
```

#### 6.2.6 Cost and Performance Optimization

**Cost:** Polygon.io free tier is 100% free (no credit card required)

**Performance Tips:**
1. **Parallel Requests:** Don't wait for sequential tool calls if under rate limit
2. **Prefetch Common Tickers:** Cache popular stocks (AAPL, MSFT, GOOGL, etc.) proactively
3. **Batch Cache Warming:** During low-traffic periods, refresh cache for active portfolio tickers
4. **CDN-like Caching:** Cache at edge (Cloudflare KV) for <50ms access times

**Monitoring:**
- Track cache hit rate (target: >80%)
- Monitor rate limit hits per day
- Alert if rate limit hit rate > 10%

#### 6.2.7 Portfolio Valuation Implementation

**For `/portfolio` command:**

```javascript
async function getPortfolioValuation(userTickers) {
  const prices = {};
  
  for (const ticker of userTickers) {
    try {
      const snapshot = await polygon.getRealtimeSnapshot(ticker);
      prices[ticker] = {
        current: snapshot.last_trade.price,
        change_percent: snapshot.todaysChangePerc,
        timestamp: snapshot.updated
      };
    } catch (error) {
      // Use cached data or skip
      const cached = await getCachedPrice(ticker);
      if (cached) {
        prices[ticker] = {
          ...cached,
          _cached: true,
          _cache_age: getCacheAge(cached.timestamp)
        };
      }
    }
  }
  
  return prices;
}
```

**Display Format:**
```
📊 Il Tuo Portfolio

💼 Posizioni Aperte:
• AAPL: 10 azioni @ media $150.50
  Prezzo attuale: $195.50 (+2.3% oggi)
  Valore: $1,955.00 | P&L: +$450 (+29.9%)

💰 Totale Investito: $3,305.00
📈 Valore Corrente: $3,755.00
📊 P&L Totale: +$450.00 (+13.6%)

ℹ️ Prezzi aggiornati 2 min fa
```

#### 6.2.8 Security Considerations

**API Key Storage:**
- Store in Cloudflare Secrets: `POLYGON_API_KEY`
- Never log API key in error messages
- Rotate key quarterly

**Request Validation:**
- Sanitize ticker symbols before API calls
- Validate date formats
- Reject suspicious patterns

**Rate Limit Protection:**
- Implement per-user request tracking
- Prevent abuse with user-level rate limits
- Block malicious IPs via Cloudflare WAF

#### 6.2.9 Testing Strategy

**Unit Tests:**
- Mock Polygon.io responses
- Test rate limiter logic
- Verify cache expiration

**Integration Tests:**
- Real API calls with test ticker (AAPL)
- Verify all 6 endpoints
- Test error handling

**Load Tests:**
- Simulate 50 concurrent users
- Verify rate limiter prevents API violations
- Measure cache effectiveness

### 6.3 Ticker Validation via Claude API

### 6.3 Ticker Validation via Claude API

**Purpose:** Validate ticker and suggest alternatives for invalid entries

**Request Structure:**
```javascript
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 500,
  "messages": [
    {
      "role": "user",
      "content": `Is "${ticker}" a valid US stock ticker (NYSE or NASDAQ)?

Return ONLY a JSON object:
{
  "valid": true/false,
  "ticker": "CORRECTED_TICKER", // standardized version if valid
  "company_name": "Full company name" // if valid
  "suggestions": ["TICKER1", "TICKER2"] // if invalid, suggest similar
}

If the ticker is invalid, provide up to 3 similar valid US stock tickers.`
    }
  ]
}
```

**Response:** Parse JSON to determine validity and get suggestions

**Caching Strategy:**
- Cache valid tickers indefinitely (they rarely become invalid)
- Store in Durable Object or KV storage for quick lookup

---

## 7. User Experience Flow

### 7.1 New User Onboarding
1. User starts bot with `/start`
2. Bot sends welcome message with `/help` content
3. User can immediately start analyzing or tracking portfolio

### 7.2 Typical Analysis Flow
```
User: /analyze AAPL
Bot: [typing indicator]
Bot: [Sends structured short analysis with inline button]
User: [Clicks "📊 Analisi completa"]
Bot: [Edits message to show full analysis]
```

### 7.3 Portfolio Management Flow
```
User: /buy AAPL 150.50 10
Bot: ✅ Acquisto registrato: 10x AAPL @ $150.50

User: /portfolio
Bot: [Shows current portfolio with P&L]

User: /sell AAPL 155.00 5
Bot: ✅ Vendita registrata: 5x AAPL @ $155.00
     💰 P&L su questa vendita: +$22.50 (+2.99%)
```

---

## 8. Security and Privacy

### 8.1 Secrets Management
**Store in Cloudflare Secrets:**
- `TELEGRAM_BOT_TOKEN`
- `ANTHROPIC_API_KEY`
- `POLYGON_API_KEY` (Polygon.io for stock data)
- `TRADINGVIEW_USERNAME` (Phase 2)
- `TRADINGVIEW_PASSWORD` (Phase 2)

### 8.2 Data Privacy
- User portfolio data is isolated per user_id
- No sharing of portfolio data between users
- No external logging of sensitive data (prices, quantities)
- User can request data deletion (future GDPR compliance)

### 8.3 Input Validation
- Sanitize all user inputs before database insertion
- Validate ticker symbols against allowed list
- Validate numeric inputs (price, quantity) for reasonable ranges
- Prevent SQL injection through parameterized queries

---

## 9. Performance Requirements

### 9.1 Response Times
- Bot command acknowledgment: < 500ms
- Stock analysis (short): < 8 seconds (including API call)
- Portfolio view: < 2 seconds
- Database operations: < 200ms

### 9.2 Rate Limiting
- **User-level:** 20 analysis requests per day per user
- **Global:** No hard limit (Cloudflare Workers scales automatically)
- **API calls:** Respect Anthropic and stock API rate limits

### 9.3 Scalability
- Durable Objects handle per-user state
- SQLite in Durable Objects supports thousands of operations per user
- Cloudflare Workers auto-scale based on demand

---

## 10. Error Recovery and Logging

### 10.1 Error Scenarios
1. **Anthropic API timeout:** Inform user, log error
2. **Invalid ticker:** Suggest alternatives, log search
3. **Database error:** Generic error message, log details
4. **Rate limit exceeded:** Inform user with reset time
5. **Malformed command:** Show help with examples

### 10.2 Logging Strategy
**Log to Cloudflare Workers Analytics:**
- Error events with context (user_id, command, error type)
- API response times
- Rate limit hits
- Successful operations count

**Do NOT log:**
- User portfolio details
- Specific prices or quantities
- Personal identifiable information beyond user_id

---

## 11. Testing Requirements

### 11.1 Unit Tests
- Ticker validation logic
- Natural language parsing
- Portfolio calculations (average price, P&L)
- Rate limiting logic

### 11.2 Integration Tests
- Anthropic API calls with mock responses
- Database operations (CRUD for portfolio)
- Telegram webhook handling
- End-to-end command flows

### 11.3 Manual Testing Checklist
- [ ] `/analyze` with valid ticker
- [ ] `/analyze` with invalid ticker
- [ ] `/analyze` with multiple tickers
- [ ] `/buy` with all parameters
- [ ] `/buy` with missing parameters
- [ ] `/buy` with natural language
- [ ] `/sell` partial position
- [ ] `/sell` more than owned (edge case)
- [ ] `/portfolio` with positions
- [ ] `/portfolio` with no positions
- [ ] `/history` with various filters
- [ ] Rate limiting triggers correctly
- [ ] Inline button for expanded analysis
- [ ] Error messages are user-friendly
- [ ] Response times are acceptable

---

## 12. Deployment

### 12.1 Environment Setup
1. Configure Cloudflare Secrets (all API keys)
2. Deploy Durable Objects class
3. Deploy Worker with webhook handler
4. Set Telegram webhook URL to Worker endpoint
5. Initialize database schema in Durable Object

### 12.2 Monitoring
- Set up Cloudflare Workers Analytics
- Monitor error rates
- Track API usage and costs
- Alert on high error rates or API failures

### 12.3 Rollback Plan
- Keep previous Worker version deployed
- Can rollback via Cloudflare dashboard in seconds
- Database schema changes should be backwards compatible

---

## 13. Future Enhancements (Phase 2)

### 13.1 TradingView Integration
**Goal:** Enhance analysis with visual chart data

**Requirements:**
1. Automated browser service (Puppeteer/Playwright)
2. TradingView account with credentials
3. Screenshot workflow:
   - Login to TradingView
   - Navigate to ticker page
   - Set timeframe to 1D
   - Capture screenshot
   - Send image to Anthropic API with analysis prompt
   - Include visual analysis in response

**Technical Considerations:**
- Browser service must be external to Cloudflare Workers (not supported natively)
- Options: AWS Lambda, Google Cloud Functions, or managed service like Browserless.io
- Screenshot storage: temporary (in-memory or Cloudflare R2 for <1 hour)
- Add image to Anthropic API call as base64 or URL

### 13.2 Additional Features (Backlog)
- Price alerts: notify user when ticker reaches target price
- Dividend tracking
- Multi-currency support
- Sector/industry comparison
- Scheduled portfolio summaries (daily/weekly)
- Export portfolio to CSV
- Integration with real brokers (read-only API)

---

## 14. Success Metrics

### 14.1 Key Performance Indicators (KPIs)
- Daily active users (DAU)
- Average analyses per user per day
- Portfolio tracking adoption rate (% of users using /buy or /sell)
- User retention (7-day, 30-day)
- Average response time
- Error rate (< 2%)
- API cost per user per month

### 14.2 User Satisfaction
- Positive feedback via Telegram reactions
- Feature requests tracking
- Bug reports response time

---

## 15. Development Roadmap

### Phase 1: Core Functionality (Weeks 1-3)
**Week 1:**
- Database schema implementation
- Basic command handlers (/start, /help)
- Anthropic API integration for analysis

**Week 2:**
- Portfolio management (/buy, /sell, /portfolio, /history)
- Natural language parsing for operations
- Error handling and validation

**Week 3:**
- Rate limiting implementation
- Inline button for expanded analysis
- Testing and bug fixes
- Documentation

### Phase 2: TradingView Integration (Weeks 4-6)
**Week 4:**
- Browser automation service setup
- TradingView login and navigation logic

**Week 5:**
- Screenshot capture and integration
- Image upload to Anthropic API
- Visual analysis enhancement

**Week 6:**
- Testing and refinement
- Performance optimization
- Final deployment

---

## 16. Dependencies and Risks

### 16.1 External Dependencies
- **Anthropic API:** Critical for analysis and natural language parsing
  - Risk: API downtime, rate limit changes, cost increases
  - Mitigation: Error handling, user communication, retry logic, cost monitoring
  
- **Polygon.io API:** Critical for stock data (prices, historical, company info)
  - Risk: Rate limit (5 req/min), API downtime, free tier removal
  - Mitigation: Aggressive caching, request queue, fallback to cached data, alternative API as backup (Yahoo Finance, Alpha Vantage)
  
- **Telegram API:** Platform dependency
  - Risk: Bot API changes or downtime
  - Mitigation: Follow Telegram updates, version locking, graceful degradation

### 16.2 Technical Risks
- **Cloudflare Workers CPU limits:** Complex calculations may hit limits
  - Mitigation: Offload heavy computation to Durable Objects
  
- **SQLite storage limits:** Durable Objects have storage constraints
  - Mitigation: Periodic data cleanup, archive old transactions

- **Browser automation (Phase 2):** Added complexity and cost
  - Mitigation: Start with Phase 1, evaluate necessity based on user feedback

---

## 17. Cost Estimation

### 17.1 Monthly Costs (Estimated for 100 Active Users)
- **Cloudflare Workers:** Free tier sufficient (10M requests/day)
- **Durable Objects:** ~$5-10/month (based on usage)
- **Anthropic API:** ~$50-100/month
  - Analysis with tool calls: 20 requests/user/day * 100 users * $0.003/1K tokens avg = ~$60/month
  - Natural language parsing: ~2 requests/user/day * 100 users = ~$6/month
  - Portfolio valuation: Handled by Polygon.io (not Claude)
- **Polygon.io API:** $0/month (free tier: 5 requests/minute)
- **Total:** ~$55-110/month

**Cost Optimization Notes:**
- Polygon.io free tier provides significant cost savings vs using Claude for price fetching
- Aggressive caching (5 min for prices, 24h for ticker details) minimizes API calls
- Rate limiting (20 analyses/user/day) controls Anthropic API costs

### 17.2 Scaling Considerations
- Costs scale linearly with user count
- Anthropic API is main cost driver
- Polygon.io free tier (5 req/min) sufficient for ~300 requests/hour with caching
- If Polygon.io rate limit becomes bottleneck, consider:
  - Upgrading to paid tier ($29-199/month for higher limits)
  - More aggressive caching strategies
  - Alternative free APIs as fallback (Yahoo Finance, Alpha Vantage)
- Monitor usage patterns to optimize
- Consider implementing stricter rate limits if costs exceed budget

---

## 18. Compliance and Legal

### 18.1 Disclaimers
**Required message in /start and /help:**
```
⚠️ DISCLAIMER
Questo bot fornisce analisi a scopo informativo e NON costituisce consulenza finanziaria. 
Le decisioni di investimento sono a tuo rischio. 
Consulta sempre un professionista prima di investire.
```

### 18.2 Data Retention
- Portfolio data: retained indefinitely unless user requests deletion
- Analysis history: not stored (live only)
- Rate limit data: reset daily
- Logs: retained for 30 days

### 18.3 Terms of Service (Future)
- Users agree to disclaimer on first use
- No guarantees on analysis accuracy
- Right to modify or discontinue service
- Data usage policy

---

## 19. Support and Maintenance

### 19.1 User Support
- In-bot command: `/support` - provides contact information
- Email support: (to be configured)
- Response time: 24-48 hours

### 19.2 Maintenance Windows
- Database migrations: scheduled during low-usage hours (2-4 AM UTC)
- Worker updates: zero-downtime deployments via Cloudflare
- Monitoring: 24/7 automated alerts for critical errors

---

## 20. Appendix

### 20.1 Predefined Analysis Prompt
*To be provided separately by Magno*

The prompt should guide Claude to provide:
1. Clear rating (Bullish/Neutral/Bearish)
2. Concise key points (3-5 bullets)
3. Brief recommendation
4. Comprehensive expanded analysis

### 20.2 Command Reference (Quick)
```
/analyze TICKER          - Analyze stock
/buy TICKER PRICE        - Record purchase
/sell TICKER PRICE       - Record sale
/portfolio               - View portfolio
/history                 - View transactions
/help                    - Show help
```

### 20.3 Glossary
- **Ticker:** Stock symbol (e.g., AAPL for Apple)
- **P&L:** Profit and Loss
- **Durable Object:** Cloudflare's stateful serverless primitive
- **Rate Limiting:** Restricting number of requests per time period
- **Inline Button:** Telegram UI element for user interaction

---

## Document History
- **v1.0** - December 8, 2025 - Initial PRD creation

---

**END OF PRD**
