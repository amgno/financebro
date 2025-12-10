// Modulo condiviso per interazioni con Telegram Bot API

/**
 * Converte Markdown in HTML supportato da Telegram
 * @param {string} md - Testo in formato Markdown
 * @returns {string} - Testo formattato in HTML Telegram
 */
export function toTelegramHTML(md) {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;') // Escape HTML chars first
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')       // Bold
    .replace(/^\s*#+\s+(.*)$/gm, '<b>$1</b>')     // Headers -> Bold
    .replace(/__([^_]+)__/g, '<u>$1</u>')         // Underline
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')         // Italic
    .replace(/`([^`]+)`/g, '<code>$1</code>')     // Inline Code
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')// Block Code
    .replace(/^\s*-\s/gm, '• ');                  // Lists
}

/**
 * Invia un messaggio Telegram (con supporto chunking per messaggi lunghi)
 * @param {number} chatId - ID della chat Telegram
 * @param {string} text - Testo del messaggio
 * @param {string} botToken - Token del bot Telegram
 * @param {object} options - Opzioni aggiuntive (replyMarkup, parseMode)
 */
export async function sendMessage(chatId, text, botToken, options = {}) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const parseMode = options.parseMode || 'HTML';
  const replyMarkup = options.replyMarkup || null;
  
  // Se parseMode è HTML, applica formattazione Markdown -> HTML
  const formattedText = parseMode === 'HTML' ? toTelegramHTML(text) : text;
  
  const MAX_LENGTH = 4000;
  let remainingText = formattedText;
  
  while (remainingText.length > 0) {
    let chunk;
    
    if (remainingText.length <= MAX_LENGTH) {
      chunk = remainingText;
      remainingText = "";
    } else {
      let splitAt = remainingText.substring(0, MAX_LENGTH).lastIndexOf('\n');
      if (splitAt === -1) splitAt = MAX_LENGTH;
      chunk = remainingText.substring(0, splitAt);
      remainingText = remainingText.substring(splitAt).trim();
    }

    const body = { 
      chat_id: chatId, 
      text: chunk, 
      parse_mode: parseMode 
    };
    
    if (replyMarkup && remainingText.length === 0) {
      body.reply_markup = replyMarkup;
    }
    
    const response = await fetch(url, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(body) 
    });
    
    if (!response.ok) {
      console.error(`[Telegram] Send Error: ${response.status}`, await response.text());
      
      // Fallback: invia senza formattazione se ci sono errori HTML
      if (response.status === 400 && parseMode === 'HTML') {
        body.text = chunk.replace(/<[^>]*>/g, '');
        body.parse_mode = undefined;
        await fetch(url, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
      }
    }
  }
}

/**
 * Modifica un messaggio esistente
 * @param {number} chatId - ID della chat
 * @param {number} messageId - ID del messaggio da modificare
 * @param {string} text - Nuovo testo
 * @param {string} botToken - Token del bot
 */
export async function editMessage(chatId, messageId, text, botToken) {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
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

/**
 * Risponde a una callback query (bottone inline)
 * @param {string} callbackId - ID della callback query
 * @param {string} botToken - Token del bot
 * @param {string} text - Testo opzionale da mostrare
 */
export async function answerCallback(callbackId, botToken, text = '') {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  await fetch(url, { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ 
      callback_query_id: callbackId, 
      text: text 
    }) 
  });
}
