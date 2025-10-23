/**
 * Serviço adaptador para diferentes formatos de mensagens recebidas via webhook
 * Suporta múltiplos fornecedores: Evolution API, Megazap, etc.
 */

/**
 * Formatos suportados:
 * 1 = Evolution API (formato padrão)
 * 2 = Megazap
 */
const MESSAGE_FORMATS = {
  EVOLUTION: '1',
  MEGAZAP: '2'
};

/**
 * Adapta mensagem do formato Evolution API para formato padrão interno
 * @param {Object} webhookData - Dados brutos do webhook Evolution
 * @returns {Array} Array de mensagens no formato padrão
 */
function adaptEvolutionFormat(webhookData) {
  console.log('[MessageAdapter] Adaptando formato Evolution API');

  let mensagens = [];

  // Formato Evolution API 2.3.6+
  if (webhookData.event === 'messages.upsert' && webhookData.data?.key) {
    console.log('[MessageAdapter] Detectado: Evolution API 2.3.6+');
    mensagens = [webhookData.data];
  }
  // Formatos anteriores do Evolution
  else if (webhookData.data) {
    console.log('[MessageAdapter] Detectado: Evolution API versão anterior');
    mensagens = Array.isArray(webhookData.data)
      ? webhookData.data
      : [webhookData.data];
  }

  // Extrair dados no formato padrão
  return mensagens.map(messageData => {
    const { key, message, messageTimestamp } = messageData;

    // Extrair texto da mensagem (suporte a vários tipos)
    const messageText =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.buttonsResponseMessage?.selectedButtonId ||
      message?.listResponseMessage?.title ||
      '';

    // Extrair telefone (remover sufixo do WhatsApp)
    const telefone = key?.remoteJid?.replace('@s.whatsapp.net', '') || '';

    return {
      telefone,
      messageText: messageText.trim(),
      messageId: key?.id || '',
      fromMe: key?.fromMe || false,
      timestamp: messageTimestamp || Date.now(),
      originalData: messageData
    };
  });
}

/**
 * Adapta mensagem do formato Megazap para formato padrão interno
 * @param {Object} webhookData - Dados brutos do webhook Megazap
 * @returns {Array} Array de mensagens no formato padrão
 */
function adaptMegazapFormat(webhookData) {
  console.log('[MessageAdapter] Adaptando formato Megazap');

  // Validar estrutura básica do Megazap
  if (!webhookData.contact || !webhookData.contact.key) {
    console.error('[MessageAdapter] Formato Megazap inválido: falta contact.key');
    return [];
  }

  // Extrair dados do formato Megazap
  const messageText = webhookData.text || '';
  const telefone = webhookData.contact.key || '';
  const messageId = webhookData.id?.toString() || '';
  const timestamp = Date.now();

  // Dados adicionais do Megazap
  const contactName = webhookData.contact?.name || '';
  const contactUid = webhookData.contact?.uid || null;
  const contactType = webhookData.contact?.type || '';
  const contactFields = webhookData.contact?.fields || {};
  const channelType = webhookData.channel?.type || '';
  const channelId = webhookData.channel?.id || '';
  const clienteId = webhookData.clienteId || null;
  const origin = webhookData.origin || '';

  console.log(`[MessageAdapter] Megazap - Telefone: ${telefone}, Nome: ${contactName}, Cliente ID: ${clienteId}`);

  return [{
    telefone,
    messageText: messageText.trim(),
    messageId,
    fromMe: false, // Assumindo que mensagens do webhook Megazap nunca são do bot
    timestamp,
    // Campos adicionais específicos do Megazap
    megazap: {
      contactName,
      contactUid,
      contactType,
      contactFields, // email, empresa, etc.
      channelType,
      channelId,
      clienteId,
      origin,
      messageType: webhookData.type
    },
    originalData: webhookData
  }];
}

/**
 * Adapta mensagem recebida para o formato padrão interno
 * com base na configuração MESSAGE_FORMAT do .env
 * @param {Object} webhookData - Dados brutos recebidos do webhook
 * @param {String} format - Formato configurado (1=Evolution, 2=Megazap)
 * @returns {Array} Array de mensagens no formato padrão
 */
function adaptMessageFormat(webhookData, format = null) {
  // Usar formato do .env se não for especificado
  const messageFormat = format || process.env.MESSAGE_FORMAT || MESSAGE_FORMATS.EVOLUTION;

  console.log(`[MessageAdapter] Formato configurado: ${messageFormat}`);

  try {
    switch (messageFormat) {
      case MESSAGE_FORMATS.EVOLUTION:
        return adaptEvolutionFormat(webhookData);

      case MESSAGE_FORMATS.MEGAZAP:
        return adaptMegazapFormat(webhookData);

      default:
        console.warn(`[MessageAdapter] Formato desconhecido: ${messageFormat}. Usando Evolution como padrão.`);
        return adaptEvolutionFormat(webhookData);
    }
  } catch (error) {
    console.error('[MessageAdapter] Erro ao adaptar formato de mensagem:', error);
    return [];
  }
}

/**
 * Detecta automaticamente o formato da mensagem (opcional)
 * @param {Object} webhookData - Dados brutos do webhook
 * @returns {String} Código do formato detectado
 */
function detectMessageFormat(webhookData) {
  // Detectar Megazap
  if (webhookData.contact?.key && webhookData.channel?.type) {
    return MESSAGE_FORMATS.MEGAZAP;
  }

  // Detectar Evolution (formato padrão)
  if (webhookData.event === 'messages.upsert' || webhookData.data?.key) {
    return MESSAGE_FORMATS.EVOLUTION;
  }

  // Padrão: Evolution
  return MESSAGE_FORMATS.EVOLUTION;
}

module.exports = {
  MESSAGE_FORMATS,
  adaptMessageFormat,
  adaptEvolutionFormat,
  adaptMegazapFormat,
  detectMessageFormat
};
