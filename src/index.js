import { UserStorage } from './user-storage.js';
import { analyzeStock, parseTradeCommand } from './ai.js';
import { sendMessage, editMessage, answerCallback } from './telegram.js';

export { UserStorage };

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    try {
      const update = await request.json();
      ctx.waitUntil(handleUpdate(update, env));
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error:', error);
      return new Response('Error', { status: 500 });
    }
  }
};

async function handleUpdate(update, env) {
  if (update.message) {
    await handleMessage(update.message, env);
  }
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
  }
}

async function handleMessage(message, env) {
  const userId = message.from.id;
  const text = message.text;
  const chatId = message.chat.id;

  console.log(`User ${userId} sent: ${text}`);

  // Protezione Password
  if (env.BOT_PASSWORD) {
    const isAuthorized = await checkAuthorization(userId, env);

    if (!isAuthorized) {
        // Se l'utente invia la password corretta (testo esatto)
        if (text && text.trim() === env.BOT_PASSWORD) {
            await authorizeUser(userId, env);
            await sendMessage(chatId, '✅ Password corretta! Benvenuto.', env.TELEGRAM_BOT_TOKEN);
            
            // Mostra subito il messaggio di benvenuto
            await sendMessage(chatId, 
              `🤖 Stock Analysis Bot\n\n` +
              `Benvenuto! Sono il tuo assistente per l'analisi finanziaria.\n\n` +
              `Usa /help per vedere i comandi.`,
              env.TELEGRAM_BOT_TOKEN
            );
            return;
        }

        // Se l'utente invia /start, chiedi la password
        if (text === '/start') {
            await sendMessage(chatId, '🔒 Bot protetto. Inserisci la password per accedere:', env.TELEGRAM_BOT_TOKEN);
        }
        
        // Se invia altro o password errata, ignora silenziosamente ("non fa niente")
        return;
    }
  }

  // Comando logout (solo se password protection attiva)
  if (text === '/exit' && env.BOT_PASSWORD) {
      await deauthorizeUser(userId, env);
      await sendMessage(chatId, '🔒 Logout effettuato. A presto!', env.TELEGRAM_BOT_TOKEN);
      return;
  }

  if (text === '/start') {
    await sendMessage(chatId, 
      `🤖 Stock Analysis Bot\n\n` +
      `Benvenuto! Sono il tuo assistente per l'analisi finanziaria.\n\n` +
      `Usa /help per vedere i comandi.`,
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  if (text === '/help') {
    await sendMessage(chatId, 
      `🤖 Comandi:\n\n` +
      `📊 /analyze TICKER - Analisi AI\n` +
      `💼 /portfolio - Visualizza portfolio\n` +
      `💰 /setbudget AMOUNT - Imposta budget\n` +
      `🟢 /buy TICKER PRICE QTY - Acquista\n` +
      `🔴 /sell TICKER PRICE QTY - Vendi\n\n` +
      `O scrivi in linguaggio naturale:\n"Ho comprato 10 AAPL a 150"`,
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  if (text && text.startsWith('/setbudget')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await sendMessage(chatId, '❌ Specifica un importo. Es: /setbudget 10000', env.TELEGRAM_BOT_TOKEN);
      return;
    }
    
    const amount = parseFloat(parts[1]);
    if (isNaN(amount) || amount < 0) {
      await sendMessage(chatId, '❌ Importo non valido. Inserisci un numero positivo.', env.TELEGRAM_BOT_TOKEN);
      return;
    }

    await saveToKV(userId, 'budget', amount.toString(), env);
    await sendMessage(chatId, `✅ Budget impostato a $${amount.toFixed(2)}`, env.TELEGRAM_BOT_TOKEN);
    return;
  }

  if (text && text.startsWith('/analyze')) {
    const tickers = text.replace('/analyze', '').trim().split(/\s+/);
    if (tickers.length === 0 || tickers[0] === '') {
        await sendMessage(chatId, '❌ Inserisci un ticker. Es: /analyze AAPL', env.TELEGRAM_BOT_TOKEN);
        return;
    }
    
    const allowed = await checkRateLimit(userId, env);
    if (!allowed) {
        await sendMessage(chatId, '⏸️ Limite giornaliero raggiunto.', env.TELEGRAM_BOT_TOKEN);
        return;
    }

    await sendMessage(chatId, `🔍 Analisi AI in corso per ${tickers[0]} (Background Job)...`, env.TELEGRAM_BOT_TOKEN);
    
    try {
        const ticker = tickers[0].toUpperCase();
        
        // Recupera Budget
        const budget = await getFromKV(userId, 'budget', env) || 'Non impostato';

        // Recupera Portfolio
        const id = env.USER_STORAGE.idFromName(userId.toString());
        const stub = env.USER_STORAGE.get(id);
        const portResponse = await stub.fetch('https://fake-url/portfolio');
        const portfolio = await portResponse.json();

        // Pianifica analisi nel Durable Object via Alarm
        await stub.fetch('https://fake-url/schedule-analysis', {
            method: 'POST',
            body: JSON.stringify({
                ticker,
                chatId,
                budget,
                portfolio
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        await incrementRateLimit(userId, env);
        
    } catch (error) {
        console.error('Analysis error:', error);
        await sendMessage(chatId, `⚠️ Errore analisi: ${error.message}`, env.TELEGRAM_BOT_TOKEN);
    }
    return;
  }

  if (text === '/portfolio') {
    await showPortfolio(chatId, userId, env);
    return;
  }

  // Gestione /buy e /sell espliciti
  if (text && (text.startsWith('/buy') || text.startsWith('/sell'))) {
    // Rimuovi lo slash per farlo processare come testo naturale o regex
    // Es: "/buy AAPL 150" -> "buy AAPL 150"
    const cleanText = text.substring(1); // Rimuove '/' iniziale
    await handleTradeInput(chatId, userId, cleanText, env);
    return;
  }

  // Messaggio libero (non inizia con /)
  if (text && !text.startsWith('/')) {
    await handleTradeInput(chatId, userId, text, env);
    return;
  }

  await sendMessage(chatId, `❓ Comando non riconosciuto.`, env.TELEGRAM_BOT_TOKEN);
}

// Logica di conferma estratta per riutilizzo
async function handleTransactionConfirmation(chatId, userId, transaction, env) {
    console.log('Asking confirmation for:', transaction);
    const message = 
      `📝 Confermi questa operazione?\n\n` +
      `${transaction.type === 'BUY' ? '🟢 ACQUISTO' : '🔴 VENDITA'}\n` +
      `Ticker: ${transaction.ticker}\n` +
      `Quantità: ${transaction.quantity}\n` +
      `Prezzo: $${transaction.price.toFixed(2)}\n` +
      `Totale: $${(transaction.quantity * transaction.price).toFixed(2)}`;
  
    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Conferma', callback_data: `confirm_${JSON.stringify(transaction)}` },
        { text: '❌ Annulla', callback_data: 'cancel' }
      ]]
    };
  
    await sendMessage(chatId, message, env.TELEGRAM_BOT_TOKEN, { replyMarkup: keyboard });
}

async function handleTradeInput(chatId, userId, text, env) {
  console.log(`Processing trade input: ${text}`);
  let transaction = null;

  // Regex migliorata per supportare anche formato comando "buy AAPL 150 10"
  // Format: (buy|sell|comprato|venduto) (ticker) (price) (qty)?
  const cmdMatch = text.match(/(buy|sell|comprato|venduto|comprata|venduta)\s+([a-zA-Z0-9]+)\s+(\d+(?:\.\d+)?)(?:\s+(\d+))?/i);
  
  // Format inverso: (buy|sell) (qty) (ticker) a (price)
  const naturalMatch = text.match(/(buy|sell|comprato|venduto)\s+(\d+)\s+([A-Z]+)\s+(?:a|@)\s+(\d+(?:\.\d+)?)/i);

  if (cmdMatch) {
      console.log('Regex CMD Match found');
      // Es: buy AAPL 150 10
      transaction = {
          type: cmdMatch[1].match(/buy|comprato|comprata/i) ? 'BUY' : 'SELL',
          ticker: cmdMatch[2].toUpperCase(),
          price: parseFloat(cmdMatch[3]),
          quantity: cmdMatch[4] ? parseInt(cmdMatch[4]) : 1
      };
  } else if (naturalMatch) {
      console.log('Regex Natural Match found');
      // Es: comprato 10 AAPL a 150
      transaction = {
          type: naturalMatch[1].match(/buy|comprato/i) ? 'BUY' : 'SELL',
          quantity: parseInt(naturalMatch[2]),
          ticker: naturalMatch[3].toUpperCase(),
          price: parseFloat(naturalMatch[4])
      };
  }

  // Se Regex fallisce, usa AI
  if (!transaction) {
    console.log('Regex failed, trying AI...');
    try {
        const aiData = await parseTradeCommand(text, env.ANTHROPIC_API_KEY);
        if (aiData && aiData.ticker && aiData.operation && aiData.price) {
            transaction = {
                type: aiData.operation.toUpperCase(),
                ticker: aiData.ticker.toUpperCase(),
                price: aiData.price,
                quantity: aiData.quantity || 1,
                date: aiData.date
            };
        }
    } catch (e) {
        console.error('AI Parsing error', e);
    }
  }

  if (!transaction) {
    console.log('Transaction parsing failed completely.');
    await sendMessage(chatId, 
      `❌ Non ho capito l'operazione.\n\n` +
      `Usa i comandi interattivi:\n/buy o /sell\n\n` +
      `Oppure scrivi esplicitamente:\n` +
      `/buy AAPL 150 10`,
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  await handleTransactionConfirmation(chatId, userId, transaction, env);
}

async function handleCallback(callback, env) {
  const userId = callback.from.id;
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data;

  if (data === 'cancel') {
    await editMessage(chatId, messageId, '❌ Operazione annullata.', env.TELEGRAM_BOT_TOKEN);
    await answerCallback(callback.id, env.TELEGRAM_BOT_TOKEN);
    return;
  }

  if (data.startsWith('confirm_')) {
    const transaction = JSON.parse(data.replace('confirm_', ''));
    await saveTransaction(userId, transaction, env);
    await editMessage(chatId, messageId, 
      `✅ Operazione salvata!\n` +
      `${transaction.type} ${transaction.quantity}x ${transaction.ticker} @ $${transaction.price}`,
      env.TELEGRAM_BOT_TOKEN
    );
    await answerCallback(callback.id, env.TELEGRAM_BOT_TOKEN, 'Salvato!');
    return;
  }
  
  await answerCallback(callback.id, env.TELEGRAM_BOT_TOKEN);
}

async function checkAuthorization(userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  const response = await stub.fetch('https://fake-url/is-authorized');
  const data = await response.json();
  return data.authorized;
}

async function authorizeUser(userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  await stub.fetch('https://fake-url/authorize', { method: 'POST' });
}

async function deauthorizeUser(userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  await stub.fetch('https://fake-url/deauthorize', { method: 'POST' });
}

async function showPortfolio(chatId, userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  const response = await stub.fetch('https://fake-url/portfolio');
  const data = await response.json();

  if (data.positions.length === 0) {
    await sendMessage(chatId, `📊 Portfolio vuoto.`, env.TELEGRAM_BOT_TOKEN);
    return;
  }

  let message = `📊 <b>IL TUO PORTFOLIO</b>\n\n`;
  
  let totalValue = 0;
  let totalCost = 0;

  // Header Tabella (usiamo monospace per "simulare" colonne)
  message += `<pre>`;
  message += `TICKER |   P&L %  |   PROFIT\n`;
  message += `-------+----------+----------\n`;

  for (const pos of data.positions) {
    const isProfit = pos.profitLoss >= 0;
    const emoji = isProfit ? '🟢' : '🔴';
    const sign = isProfit ? '+' : '';
    
    // Tronchiamo i valori per stare nella riga
    const ticker = pos.ticker.padEnd(6, ' ');
    const plPerc = `${sign}${pos.profitLossPercent.toFixed(1)}%`.padStart(8, ' ');
    const plAbs = `${sign}$${Math.abs(pos.profitLoss).toFixed(0)}`.padStart(8, ' ');
    
    message += `${ticker} | ${plPerc} | ${plAbs} ${emoji}\n`;

    // Aggiungiamo riga dettagli sotto
    // message += `       ${pos.quantity}pz @ $${pos.currentPrice.toFixed(2)}\n`; 

    totalValue += pos.currentValue;
    totalCost += pos.totalCost;
  }
  
  message += `</pre>\n`;

  // Totali
  const totalPL = totalValue - totalCost;
  const totalPLPerc = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const totalEmoji = totalPL >= 0 ? '🚀' : '📉';

  message += `\n💰 <b>TOTALE: $${totalValue.toFixed(2)}</b>\n`;
  message += `P&L: ${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(2)} (${totalPL >= 0 ? '+' : ''}${totalPLPerc.toFixed(2)}%) ${totalEmoji}`;

  await sendMessage(chatId, message, env.TELEGRAM_BOT_TOKEN);
}

async function saveTransaction(userId, transaction, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  await stub.fetch('https://fake-url/transaction', {
    method: 'POST',
    body: JSON.stringify(transaction),
    headers: { 'Content-Type': 'application/json' }
  });
}

async function checkRateLimit(userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  const response = await stub.fetch('https://fake-url/rate-limit');
  const data = await response.json();
  return data.allowed;
}

async function incrementRateLimit(userId, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  await stub.fetch('https://fake-url/rate-limit/increment', { method: 'POST' });
}

async function saveToKV(userId, key, value, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  await stub.fetch('https://fake-url/kv', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getFromKV(userId, key, env) {
  const id = env.USER_STORAGE.idFromName(userId.toString());
  const stub = env.USER_STORAGE.get(id);
  const response = await stub.fetch(`https://fake-url/kv?key=${key}`);
  const data = await response.json();
  return data.value;
}