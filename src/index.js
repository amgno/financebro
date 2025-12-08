import { UserStorage } from './user-storage.js';
import { analyzeStock, parseTradeCommand } from './ai.js';

export { UserStorage };

export default {
  async fetch(request, env, ctx) {
    // Verifica che sia una richiesta POST (webhook Telegram)
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    try {
      // Ricevi l'update da Telegram
      const update = await request.json();
      
      // Gestisci l'update in background senza bloccare la risposta a Telegram
      ctx.waitUntil(handleUpdate(update, env));

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error:', error);
      return new Response('Error', { status: 500 });
    }
  }
};

// Gestisce un update da Telegram
async function handleUpdate(update, env) {
  // Messaggio normale
  if (update.message) {
    await handleMessage(update.message, env);
  }
  
  // Callback da bottoni inline
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
  }
}

// Gestisce messaggi di testo e comandi
async function handleMessage(message, env) {
  const userId = message.from.id;
  const text = message.text;
  const chatId = message.chat.id;

  console.log(`User ${userId} sent: ${text}`);

  // Comando /start
  if (text === '/start') {
    await sendMessage(chatId, 
      `🤖 Stock Analysis Bot\n\n` +
      `Benvenuto! Sono il tuo assistente per l'analisi finanziaria e la gestione del portfolio.\n\n` +
      `⚠️ DISCLAIMER: Questo bot fornisce analisi a scopo informativo e NON costituisce consulenza finanziaria.\n\n` +
      `Usa /help per vedere la lista completa dei comandi.`,
      env
    );
    return;
  }

  // Comando /help
  if (text === '/help') {
    await sendMessage(chatId, 
      `🤖 Stock Analysis Bot - Comandi\n\n` +
      `📊 Analisi Titoli:\n` +
      `/analyze TICKER - Analisi AI di un titolo\n` +
      `/analyze TICKER1 TICKER2 - Analisi multipla\n\n` +
      `💼 Portfolio:\n` +
      `/buy TICKER PRICE [QTY] [DATE] - Registra acquisto\n` +
      `/sell TICKER PRICE [QTY] [DATE] - Registra vendita\n` +
      `/portfolio - Visualizza portfolio\n` +
      `/history [TICKER] [LIMIT] - Storico operazioni\n\n` +
      `💡 Puoi anche usare linguaggio naturale:\n` +
      `"ho comprato AAPL a 150"\n` +
      `"analizza Apple"`,
      env
    );
    return;
  }

  // Comando /analyze
  if (text && text.startsWith('/analyze')) {
    const tickers = text.replace('/analyze', '').trim().split(/\s+/);
    if (tickers.length === 0 || tickers[0] === '') {
        await sendMessage(chatId, '❌ Inserisci almeno un ticker. Es: /analyze AAPL', env);
        return;
    }
    
    // Controlla rate limit
    const allowed = await checkRateLimit(userId, env);
    if (!allowed) {
        await sendMessage(chatId, '⏸️ Limite giornaliero raggiunto (20 analisi). Riprova domani.', env);
        return;
    }

    // Notifica utente
    await sendMessage(chatId, `🔍 Analisi AI in corso per ${tickers.join(', ')}...`, env);
    
    try {
        const ticker = tickers[0].toUpperCase();
        
        // Usa API Key FMP hardcoded temporaneamente o da variabile d'ambiente
        // Nota: L'utente ha fornito la chiave in chat, per sicurezza la mettiamo qui o meglio ancora in ENV
        // ENV var name: FMP_API_KEY
        const analysis = await analyzeStock(ticker, env.ANTHROPIC_API_KEY, env.FMP_API_KEY || 'Q2xs1jKWKU1RcbEGXxAKJgtxP5Q7tnM3');
        
        // Salva analisi espansa nel KV dello UserStorage
        await saveToKV(userId, `analysis_${ticker}`, analysis.expanded, env);
        
        // Bottoni
        const keyboard = {
            inline_keyboard: [[
                { text: '📊 Analisi completa', callback_data: `expand_${ticker}` }
            ]]
        };
        
        await sendMessage(chatId, analysis.short, env, keyboard);
        
        // Incrementa contatore
        await incrementRateLimit(userId, env);
        
    } catch (error) {
        console.error('Analysis error:', error);
        await sendMessage(chatId, '⚠️ Errore durante l\'analisi. Riprova più tardi.', env);
    }
    return;
  }

  // Comando /portfolio
  if (text === '/portfolio') {
    await showPortfolio(chatId, userId, env);
    return;
  }

  // Messaggio libero - parsing operazione
  if (text && !text.startsWith('/')) {
    await handleTradeInput(chatId, userId, text, env);
    return;
  }

  // Comando non riconosciuto
  await sendMessage(chatId, 
    `❓ Comando non riconosciuto.\nDigita /help per la lista comandi.`,
    env
  );
}

// Gestisce input di operazioni in linguaggio naturale
async function handleTradeInput(chatId, userId, text, env) {
  let transaction = null;

  // Prima prova il parsing locale veloce (fallback e speed)
  const buyMatch = text.match(/comprat[oa]\s+(\d+)\s+([A-Z]+)\s+a\s+(\d+(?:\.\d+)?)/i);
  const sellMatch = text.match(/vendut[oa]\s+(\d+)\s+([A-Z]+)\s+a\s+(\d+(?:\.\d+)?)/i);

  if (buyMatch) {
    transaction = {
      type: 'BUY',
      quantity: parseInt(buyMatch[1]),
      ticker: buyMatch[2].toUpperCase(),
      price: parseFloat(buyMatch[3])
    };
  } else if (sellMatch) {
    transaction = {
      type: 'SELL',
      quantity: parseInt(sellMatch[1]),
      ticker: sellMatch[2].toUpperCase(),
      price: parseFloat(sellMatch[3])
    };
  }

  // Se non matcha regex, usa AI
  if (!transaction) {
    // await sendMessage(chatId, '🤔 Elaborazione ordine con AI...', env); // Optional
    try {
        const aiData = await parseTradeCommand(text, env.ANTHROPIC_API_KEY);
        if (aiData && aiData.ticker && aiData.operation && aiData.price) {
            transaction = {
                type: aiData.operation.toUpperCase(),
                ticker: aiData.ticker.toUpperCase(),
                price: aiData.price,
                quantity: aiData.quantity || 1, // Default 1
                date: aiData.date // Optional
            };
        }
    } catch (e) {
        console.error('AI Parsing error', e);
    }
  }

  if (!transaction) {
    await sendMessage(chatId, 
      `❌ Non ho capito l'operazione.\n\n` +
      `Prova così:\n` +
      `"comprato 100 AAPL a 150$"\n` +
      `"venduto 50 MSFT a 380$"`,
      env
    );
    return;
  }

  // Mostra conferma con bottoni
  const message = 
    `📝 Confermi questa operazione?\n\n` +
    `${transaction.type === 'BUY' ? '🟢 ACQUISTO' : '🔴 VENDITA'}\n` +
    `Ticker: ${transaction.ticker}\n` +
    `Quantità: ${transaction.quantity}\n` +
    `Prezzo: $${transaction.price.toFixed(2)}\n` +
    `Totale: $${(transaction.quantity * transaction.price).toFixed(2)}`;

  const keyboard = {
    inline_keyboard: [[
      { 
        text: '✅ Conferma', 
        callback_data: `confirm_${JSON.stringify(transaction)}` 
      },
      { 
        text: '❌ Annulla', 
        callback_data: 'cancel' 
      }
    ]]
  };

  await sendMessage(chatId, message, env, keyboard);
}

// Gestisce click sui bottoni
async function handleCallback(callback, env) {
  const userId = callback.from.id;
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data;

  // Annulla
  if (data === 'cancel') {
    await editMessage(chatId, messageId, '❌ Operazione annullata.', env);
    await answerCallback(callback.id, env);
    return;
  }

  // Conferma transazione
  if (data.startsWith('confirm_')) {
    const transaction = JSON.parse(data.replace('confirm_', ''));
    
    // Salva nel Durable Object
    await saveTransaction(userId, transaction, env);

    await editMessage(chatId, messageId, 
      `✅ Operazione salvata!\n\n` +
      `${transaction.type === 'BUY' ? '🟢 ACQUISTO' : '🔴 VENDITA'}\n` +
      `${transaction.ticker}: ${transaction.quantity} @ $${transaction.price}`,
      env
    );
    await answerCallback(callback.id, 'Salvato!', env);
    return;
  }
  
  // Espandi analisi
  if (data.startsWith('expand_')) {
    const ticker = data.replace('expand_', '');
    const expandedText = await getFromKV(userId, `analysis_${ticker}`, env);
    
    if (expandedText) {
        await editMessage(chatId, messageId, 
            `📊 ${ticker} - Analisi Completa\n\n${expandedText}`, 
            env
        );
    } else {
        await answerCallback(callback.id, 'Analisi scaduta o non trovata.', env);
    }
    return;
  }

  await answerCallback(callback.id, env);
}

// Mostra il portfolio
async function showPortfolio(chatId, userId, env) {
  // Ottieni Durable Object per questo utente
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  
  // Chiedi il portfolio
  const response = await stub.fetch('https://fake-url/portfolio');
  const data = await response.json();

  if (data.positions.length === 0) {
    await sendMessage(chatId, 
      `📊 Portfolio vuoto\n\n` +
      `Inizia ad aggiungere operazioni!\n` +
      `Es: "comprato 100 AAPL a 150$"`,
      env
    );
    return;
  }

  // Formatta il portfolio
  let message = `📊 Il tuo Portfolio\n\n`;
  
  for (const pos of data.positions) {
    message += `${pos.ticker}\n`;
    message += `  Quantità: ${pos.quantity}\n`;
    message += `  Prezzo medio: $${pos.avgPrice.toFixed(2)}\n`;
    message += `  Investimento: $${pos.totalCost.toFixed(2)}\n\n`;
  }

  await sendMessage(chatId, message, env);
}

// Salva una transazione nel Durable Object
async function saveTransaction(userId, transaction, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  
  await stub.fetch('https://fake-url/transaction', {
    method: 'POST',
    body: JSON.stringify(transaction),
    headers: { 'Content-Type': 'application/json' }
  });
}

// Verifica rate limit
async function checkRateLimit(userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  
  const response = await stub.fetch('https://fake-url/rate-limit');
  const data = await response.json();
  return data.allowed;
}

// Incrementa rate limit
async function incrementRateLimit(userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  
  await stub.fetch('https://fake-url/rate-limit/increment', {
    method: 'POST'
  });
}

// Salva valore temporaneo (KV)
async function saveToKV(userId, key, value, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  
  await stub.fetch('https://fake-url/kv', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
    headers: { 'Content-Type': 'application/json' }
  });
}

// Leggi valore temporaneo (KV)
async function getFromKV(userId, key, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  
  const response = await stub.fetch(`https://fake-url/kv?key=${key}`);
  const data = await response.json();
  return data.value;
}

// === UTILITY TELEGRAM API ===

// Invia un messaggio
async function sendMessage(chatId, text, env, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// Modifica un messaggio esistente
async function editMessage(chatId, messageId, text, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML'
    })
  });
}

// Rispondi a un callback (fa sparire l'icona di caricamento)
async function answerCallback(callbackId, text = '', env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackId,
      text: text
    })
  });
}