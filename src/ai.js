import { FMPClient } from './fmp.js';

export async function analyzeStock(ticker, anthropicApiKey, fmpApiKey) {
  const fmp = new FMPClient(fmpApiKey);
  
  const systemPrompt = `
Sei un esperto analista finanziario. Analizza il titolo azionario ${ticker} (US Market).
Hai a disposizione dei tool per ottenere dati di mercato in tempo reale. USA I TOOL prima di rispondere.
Non inventare prezzi o dati, usa solo quelli forniti dai tool.

RISPONDI IN MODO ESTREMAMENTE CONCISO E RAPIDO.
Limita l'analisi espansa a 3-4 frasi essenziali.

Al termine dell'analisi, fornisci una risposta strutturata esattamente in questo formato (usa le emoji indicate):

📊 [TICKER] - [Company Name]
💰 Prezzo: $[Prezzo attuale]

⭐ Rating: [Bullish/Neutral/Bearish]

🔑 Punti Chiave:
• [Punto 1]
• [Punto 2]
• [Punto 3]

💡 Raccomandazione: [Breve raccomandazione]

---
EXPANDED_ANALYSIS
[Analisi molto sintetica in un unico paragrafo di massimo 50 parole]
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
    },
    {
      name: "get_related_companies",
      description: "Get similar/competitor companies for comparative analysis",
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
        max_tokens: 2000,
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
                    volume: raw.volume
                } : { error: "No data" };
              } else if (toolName === 'get_historical_prices') {
                // Riduciamo a 5 giorni e prendiamo solo close e date
                const raw = await fmp.getHistoricalPrices(toolInput.ticker, 5);
                result = raw.map(d => ({ date: d.date, close: d.close }));
              } else if (toolName === 'get_ticker_details') {
                const raw = await fmp.getTickerDetails(toolInput.ticker);
                result = raw ? {
                    companyName: raw.companyName,
                    sector: raw.sector,
                    description: raw.description ? raw.description.substring(0, 150) + "..." : "", 
                    exchange: raw.exchange
                } : { error: "No details" };
              } else if (toolName === 'get_related_companies') {
                 result = "Skipped";
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
      
      const parts = contentText.split('EXPANDED_ANALYSIS');
      const shortAnalysis = parts[0].trim();
      const expandedAnalysis = parts[1] ? parts[1].trim() : 'Dettagli non disponibili.';

      return {
        short: shortAnalysis,
        expanded: expandedAnalysis
      };
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