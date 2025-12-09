import { FMPClient } from './fmp.js';

export async function analyzeStock(ticker, anthropicApiKey, fmpApiKey, budget, portfolio) {
  const fmp = new FMPClient(fmpApiKey);
  
  const systemPrompt = `
Sei un analista quantitativo senior + portfolio manager con esperienza in swing/position trading.

Devo valutare se **${ticker}** è un buon investimento.

## INPUT CHE TI FORNISCO

### 1. DATI DI MERCATO (DA TOOL)
Usa i dati forniti dai tool per l'analisi tecnica e fondamentale.
Non hai accesso a screenshot, basati sui dati numerici OHLC e snapshot.

### 2. BUDGET & CONTESTO
- **Budget allocabile per questo trade:** $${budget}
- **Portfolio Attuale:** ${JSON.stringify(portfolio)}
- **Data oggi:** ${new Date().toISOString().split('T')[0]}

---

## TUA ANALISI - STRUTTURA OBBLIGATORIA

USA I TOOL PER RACCOGLIERE I DATI.
Se un dato specifico non è disponibile via tool (es. news sentiment recente, analyst ratings specifici), usa la tua conoscenza pregressa o stima con prudenza, dichiarandolo esplicitamente.

### SECTION 1: COMPANY FUNDAMENTALS (Research profonda - 20 min)

**Business Model & Competitive Position**
- Cosa fa l'azienda, revenue streams principali
- Market cap attuale, industry positioning
- Competitive moat (se esiste)
- Leadership team (esperienza CEO, insider ownership)

**Financial Health**
- Revenue: trend recente (dagli utili se disponibili o knowledge)
- Profitability: margin overview
- Ratios chiave: P/E, P/S (se disponibili da snapshot)

**Recent Earnings (ultimo quarter - stima)**
- Beat/Miss/In-Line (se noto)
- Key metrics performance

### SECTION 2: TECHNICAL ANALYSIS DETTAGLIATA

**Chart Analysis (basata su dati OHLC forniti dai tool)**
Analizza i dati storici degli ultimi 30 giorni (o più se disponibili).

**Trend Identification:**
- Trend primario (Bullish/Bearish/Range)
- Volatilità recente

**Price Action & Levels:**
- **Prezzo attuale:** $... (da snapshot)
- **Range recente:** High/Low del periodo analizzato
- **Supporti chiave sotto prezzo:** Identifica minimi recenti significativi
- **Resistenze sopra prezzo:** Identifica massimi recenti significativi
- **Pattern tecnici:** Cerca pattern nei dati numerici (es. serie di massimi crescenti)

**Entry Point Evaluation:**
- Prezzo attuale vs entry ideale: è buon momento?
- Risk/Reward da questo livello

### SECTION 3: MARKET & SECTOR CONTEXT

**Sector Performance**
- Settore di appartenenza (da details)
- Performance relativa (dedotta)

**Competitive Landscape**
- Competitors principali
- Posizionamento

### SECTION 4: SENTIMENT ANALYSIS MULTI-SOURCE

**Analyst Coverage (Simulata)**
- Consensus rating stimato
- Sentiment generale

### SECTION 5: INVESTMENT SCORE & DECISION

**FINAL SCORE: X/10**

**Breakdown Dettagliato:**
- Fundamentals: X/10
- Technicals: X/10
- Sector Context: X/10
- Sentiment: X/10

**WEIGHTED SCORE LOGIC:**
- Technicals = 35%
- Fundamentals = 30%
- Sector Context = 20%
- Sentiment = 15%

**FINAL WEIGHTED SCORE: X.X/10**

**RECOMMENDATION: BUY / PASS / WATCHLIST**

**REASONING (3-5 righe chiare):**
[Perché BUY, PASS, o WATCHLIST - sii diretto e specifico]

**CONFIDENCE LEVEL: High / Medium / Low**

---

### SECTION 6: EXECUTION STRATEGY (SE BUY)

**Position Sizing**
- **Budget disponibile:** $${budget}
- **Shares consigliati:** [X] shares (Calcola in base al prezzo e risk management)
- **Capital allocation:** $...
- **Average cost target:** $...

**Entry Strategy**
Scegli LA MIGLIORE tra:
- **Option A: Market Order** (se momentum forte)
- **Option B: Limit Order** (se pullback atteso)
- **Option C: Scale In** (se incerto)

**Risk Management - CRITICAL**
- **Stop Loss:** $... (Rationale: livello tecnico)
- **Take Profit 1:** $...
- **Take Profit 2:** $...

**Exit Scenarios:**
- Quando uscire immediatamente?

---

## REGOLE CRITICHE
- **NESSUNA SPECULAZIONE:** Se non trovi dati, dillo.
- **SPECIFIC NUMBERS:** Prezzi esatti, date.
- **RISK/REWARD:** Ogni BUY deve avere un piano chiaro.

## SE SCORE < 7: Alternative Analysis
**COSA DEVE CAMBIARE PER DIVENTARE BUY:**
- Fundamentals/Technicals/Sentiment changes needed.
**WATCHLIST TRIGGER:**
- Prezzo alert.

IMPORTANTE PER L'OUTPUT:
Fornisci direttamente il report completo e dettagliato, strutturato come sopra. 
Unico testo continuo e ben formattato.

Formato Output Richiesto:

📊 [TICKER] - [Company Name]
💰 Prezzo: $[Prezzo attuale]
⭐ Rating: [Bullish/Neutral/Bearish]
💡 Raccomandazione: [BUY/PASS/WATCHLIST]

# ANALISI APPROFONDITA: ${ticker}

### SECTION 1: COMPANY FUNDAMENTALS
...
(continua con tutte le sezioni fino alla 6)
`;

  const tools = [
    {
      name: "get_realtime_snapshot",
      description: "Get real-time snapshot with current price, day's change, volume, and trading stats",
      input_schema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker symbol" }
        },
        required: ["ticker"]
      }
    },
    {
      name: "get_historical_prices",
      description: "Get historical OHLC price data for trend and performance analysis (last 30 days)",
      input_schema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker symbol" }
        },
        required: ["ticker"]
      }
    },
    {
      name: "get_ticker_details",
      description: "Get company information including name, market cap, sector, and exchange",
      input_schema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker symbol" }
        },
        required: ["ticker"]
      }
    }
  ];

  let messages = [
    { role: 'user', content: `Analizza ${ticker}` }
  ];

  // Loop per gestire le chiamate ai tool (max 3 turni per evitare timeout worker)
  for (let i = 0; i < 3; i++) {
    console.log(`[AI] Turn ${i+1} calling Anthropic...`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000, // Aumentato token per report lungo
        system: systemPrompt,
        messages: messages,
        tools: tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI] Anthropic API Error: ${response.status}`, errorText);
      throw new Error(`Anthropic API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`[AI] Anthropic response received. Stop reason: ${data.stop_reason}`);
    const message = data;
    
    // Aggiungi la risposta dell'assistente alla storia
    messages.push({ role: 'assistant', content: message.content });

    // Se stop_reason è tool_use, esegui i tool
    if (message.stop_reason === 'tool_use') {
      
      const toolPromises = message.content
        .filter(block => block.type === 'tool_use')
        .map(async (block) => {
            const toolName = block.name;
            const toolInput = block.input;
            
            console.log(`[AI] Calling tool: ${toolName} for ${toolInput.ticker}`);
            let result;
            try {
              if (toolName === 'get_realtime_snapshot') {
                const raw = await fmp.getRealtimeSnapshot(toolInput.ticker);
                result = raw ? {
                    price: raw.price,
                    changesPercentage: raw.changesPercentage,
                    change: raw.change,
                    dayLow: raw.dayLow,
                    dayHigh: raw.dayHigh,
                    marketCap: raw.marketCap,
                    volume: raw.volume,
                    pe: raw.pe, // Se disponibile
                    eps: raw.eps // Se disponibile
                } : { error: "No data" };
              } else if (toolName === 'get_historical_prices') {
                // Prendiamo 30 giorni
                const raw = await fmp.getHistoricalPrices(toolInput.ticker, 30);
                result = raw.map(d => ({ date: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume }));
              } else if (toolName === 'get_ticker_details') {
                const raw = await fmp.getTickerDetails(toolInput.ticker);
                result = raw ? {
                    companyName: raw.companyName,
                    sector: raw.sector,
                    industry: raw.industry,
                    description: raw.description ? raw.description.substring(0, 300) + "..." : "", 
                    exchange: raw.exchange,
                    website: raw.website,
                    ceo: raw.ceo
                } : { error: "No details" };
              } else {
                  result = { error: "Tool not found" };
              }
              console.log(`[AI] Tool ${toolName} completed.`);
            } catch (e) {
              console.error(`[AI] Tool ${toolName} failed:`, e);
              result = { error: e.message };
            }
  
            return {
               type: 'tool_result',
               tool_use_id: block.id,
               content: JSON.stringify(result)
            };
        });

      const toolResults = await Promise.all(toolPromises);
      
      // Costruiamo il messaggio di risposta con i risultati
      messages.push({ role: 'user', content: toolResults });
      
    } else {
      // Risposta finale (text)
      const contentText = message.content.find(b => b.type === 'text')?.text || '';
      
      // Restituisci direttamente il testo completo
      return contentText;
    }
  }
  
  throw new Error('Max turns reached without final response');
}

export async function parseTradeCommand(text, apiKey) {
  const prompt = `
Extract trading operation details from this text: "${text}"

Return ONLY a JSON object with these fields:
{
  "ticker": "string (stock symbol)",
  "operation": "BUY or SELL",
  "price": number,
  "quantity": number or null,
  "date": "YYYY-MM-DD or null"
}

If any required field (ticker, operation, price) is missing, set it to null.
Do not output any markdown formatting, just the JSON string.
`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
        throw new Error(`Anthropic API Error: ${response.status}`);
    }

    const data = await response.json();
    let jsonStr = data.content[0].text;
    
    // Pulisci eventuale markdown
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(jsonStr);

  } catch (error) {
    console.error('AI Parsing failed:', error);
    return null;
  }
}
