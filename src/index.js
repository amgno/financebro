import { UserStorage } from './user-storage.js';

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
      
      // Gestisci l'update
      await handleUpdate(update, env);

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
      `🤖 Benvenuto!\n\n` +
      `Sono il tuo bot di trading personale.\n` +
      `Prova questi comandi:\n\n` +
      `/help - Lista comandi\n` +
      `/portfolio - Il tuo portafoglio\n\n` +
      `Oppure scrivi direttamente:\n` +
      `"comprato 100 AAPL a 150$"`,
      env
    );
    return;
  }

  // Comando /help
  if (text === '/help') {
    await sendMessage(chatId, 
      `📚 Comandi disponibili:\n\n` +
      `/start - Messaggio di benvenuto\n` +
      `/portfolio - Mostra il tuo portafoglio\n` +
      `/help - Questa lista\n\n` +
      `Puoi anche scrivere direttamente le tue operazioni,\n` +
      `ad esempio: "comprato 50 MSFT a 380$"`,
      env
    );
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
  // Parsing semplificato (in produzione useresti Claude API)
  const buyMatch = text.match(/comprat[oa]\s+(\d+)\s+([A-Z]+)\s+a\s+(\d+(?:\.\d+)?)/i);
  const sellMatch = text.match(/vendut[oa]\s+(\d+)\s+([A-Z]+)\s+a\s+(\d+(?:\.\d+)?)/i);

  let transaction = null;

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
      text: text
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