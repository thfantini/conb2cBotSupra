/**
 * Serviço de Mensagens - Factory/Selector
 *
 * Este módulo seleciona automaticamente o serviço de mensagens correto
 * (Evolution ou Megazap) baseado na variável MESSAGE_FORMAT do .env
 *
 * Uso:
 *   const messageService = require('./config/messageService');
 *   await messageService.sendTextMessage(phone, message);
 */

require('dotenv').config();

const evolutionService = require('./evolution');
const megazapService = require('./megazap');

/**
 * Formatos disponíveis
 */
const MESSAGE_FORMATS = {
    EVOLUTION: '1',
    MEGAZAP: '2'
};

/**
 * Obtém o formato de mensagem configurado
 * @returns {string} Formato configurado (1 ou 2)
 */
function getMessageFormat() {
    return process.env.MESSAGE_FORMAT || MESSAGE_FORMATS.EVOLUTION;
}

/**
 * Obtém o serviço de mensagens baseado no formato configurado
 * @returns {Object} Serviço (evolution ou megazap)
 */
function getMessageService() {
    const format = getMessageFormat();

    switch (format) {
        case MESSAGE_FORMATS.EVOLUTION:
            console.log('[MessageService] Usando Evolution API');
            return evolutionService;

        case MESSAGE_FORMATS.MEGAZAP:
            console.log('[MessageService] Usando Megazap');
            return megazapService;

        default:
            console.warn(`[MessageService] Formato desconhecido: ${format}. Usando Evolution API como padrão.`);
            return evolutionService;
    }
}

/**
 * Envia mensagem de texto
 * Delega para o serviço apropriado (Evolution ou Megazap)
 * @param {string} phoneNumber - Número do destinatário
 * @param {string} message - Mensagem a ser enviada
 * @param {Object} newTicket - Objeto opcional (apenas Megazap)
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendTextMessage(phoneNumber, message, newTicket = null) {
    const service = getMessageService();
    return await service.sendTextMessage(phoneNumber, message, newTicket);
}

/**
 * Envia documento (PDF, imagem, etc)
 * @param {string} phoneNumber - Número do telefone
 * @param {string} base64 - Arquivo em base64
 * @param {string} filename - Nome do arquivo
 * @param {string} message - Mensagem/caption (opcional)
 * @param {Object} newTicket - Objeto opcional (apenas Megazap)
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendDocument(phoneNumber, base64, filename, message = '', newTicket = null) {
    const service = getMessageService();
    return await service.sendDocument(phoneNumber, base64, filename, message, newTicket);
}

/**
 * Envia mensagem com botões
 * @param {string} phoneNumber - Número do destinatário
 * @param {string} text - Texto da mensagem
 * @param {Array} buttons - Array de botões
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendButtonMessage(phoneNumber, text, buttons) {
    const service = getMessageService();
    return await service.sendButtonMessage(phoneNumber, text, buttons);
}

/**
 * Envia lista de opções
 * @param {string} phoneNumber - Número do destinatário
 * @param {string} title - Título da lista
 * @param {string} description - Descrição da lista
 * @param {Array} sections - Seções da lista
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendListMessage(phoneNumber, title, description, sections) {
    const service = getMessageService();
    return await service.sendListMessage(phoneNumber, title, description, sections);
}

/**
 * Envia pergunta com callback (específico Megazap)
 * Para Evolution, envia como texto simples
 * @param {string} phoneNumber - Número do telefone
 * @param {string} message - Mensagem de pergunta
 * @param {string} endpoint - Endpoint de callback
 * @returns {Promise<Object>} Resultado
 */
async function sendQuestion(phoneNumber, message, endpoint) {
    const service = getMessageService();
    const format = getMessageFormat();

    if (format === MESSAGE_FORMATS.MEGAZAP && service.sendQuestion) {
        return await service.sendQuestion(phoneNumber, message, endpoint);
    } else {
        // Fallback para Evolution: envia como texto
        console.log('[MessageService] sendQuestion não suportado em Evolution, enviando como texto');
        return await service.sendTextMessage(phoneNumber, message);
    }
}

/**
 * Redireciona para menu (específico Megazap)
 * Para Evolution, não faz nada (retorna sucesso)
 * @param {string} phoneNumber - Número do telefone
 * @param {string|number} menu - UUID do menu
 * @returns {Promise<Object>} Resultado
 */
async function sendMenu(phoneNumber, menu) {
    const service = getMessageService();
    const format = getMessageFormat();

    if (format === MESSAGE_FORMATS.MEGAZAP && service.sendMenu) {
        return await service.sendMenu(phoneNumber, menu);
    } else {
        // Fallback para Evolution: não suportado
        console.log('[MessageService] sendMenu não suportado em Evolution');
        return {
            success: true,
            data: { message: 'sendMenu not supported in Evolution' },
            error: null
        };
    }
}

/**
 * Redireciona para menu (específico Megazap)
 * Para Evolution, não faz nada (retorna sucesso)
 * @param {string} phoneNumber - Número do telefone
 * @param {string|number} menu - UUID do menu
 * @returns {Promise<Object>} Resultado
 */
async function sendDirectToMenu(phoneNumber, menu) {
    const service = getMessageService();
    const format = getMessageFormat();

    if (format === MESSAGE_FORMATS.MEGAZAP && service.sendDirectToMenu) {
        return await service.sendDirectToMenu(phoneNumber, menu);
    } else {
        // Fallback para Evolution: não suportado
        console.log('[MessageService] sendDirectToMenu não suportado em Evolution');
        return {
            success: true,
            data: { message: 'Direct to menu not supported in Evolution' },
            error: null
        };
    }
}

/**
 * Formata número de telefone
 * @param {string} phoneNumber - Número a ser formatado
 * @returns {string} Número formatado
 */
function formatPhoneNumber(phoneNumber) {
    const service = getMessageService();
    return service.formatPhoneNumber(phoneNumber);
}

/**
 * Testa conexão/configuração do serviço ativo
 * @returns {Promise<boolean>} Status da conexão
 */
async function testConnection() {
    const service = getMessageService();
    const format = getMessageFormat();

    console.log(`[MessageService] Testando conexão - Formato: ${format}`);
    return await service.testConnection();
}

/**
 * Obtém informações sobre o serviço ativo
 * @returns {Object} Informações do serviço
 */
function getServiceInfo() {
    const format = getMessageFormat();
    const serviceName = format === MESSAGE_FORMATS.MEGAZAP ? 'Megazap' : 'Evolution API';

    return {
        format: format,
        serviceName: serviceName,
        isEvolution: format === MESSAGE_FORMATS.EVOLUTION,
        isMegazap: format === MESSAGE_FORMATS.MEGAZAP
    };
}

/**
 * Funções específicas do Evolution (para compatibilidade retroativa)
 */

/**
 * Configura webhook (apenas Evolution)
 * @param {string} webhookUrl - URL do webhook
 * @returns {Promise<Object>} Resultado
 */
async function setWebhook(webhookUrl) {
    const format = getMessageFormat();

    if (format === MESSAGE_FORMATS.EVOLUTION) {
        return await evolutionService.setWebhook(webhookUrl);
    } else {
        console.log('[MessageService] setWebhook não suportado em Megazap');
        return {
            success: false,
            data: null,
            error: 'setWebhook only supported in Evolution API'
        };
    }
}

/**
 * Verifica status da instância (apenas Evolution)
 * @returns {Promise<Object>} Status
 */
async function getInstanceStatus() {
    const format = getMessageFormat();

    if (format === MESSAGE_FORMATS.EVOLUTION) {
        return await evolutionService.getInstanceStatus();
    } else {
        console.log('[MessageService] getInstanceStatus não suportado em Megazap');
        return {
            success: true,
            data: { state: 'open' },
            error: null
        };
    }
}

/**
 * Conecta instância (apenas Evolution)
 * @returns {Promise<Object>} Resultado
 */
async function connectInstance() {
    const format = getMessageFormat();

    if (format === MESSAGE_FORMATS.EVOLUTION) {
        return await evolutionService.connectInstance();
    } else {
        console.log('[MessageService] connectInstance não suportado em Megazap');
        return {
            success: true,
            data: null,
            error: null
        };
    }
}

/**
 * Marca mensagem como lida (apenas Evolution)
 * @param {string} messageId - ID da mensagem
 * @param {string} remoteJid - JID do chat
 * @returns {Promise<Object>} Resultado
 */
async function markMessageAsRead(messageId, remoteJid) {
    const format = getMessageFormat();

    if (format === MESSAGE_FORMATS.EVOLUTION) {
        return await evolutionService.markMessageAsRead(messageId, remoteJid);
    } else {
        console.log('[MessageService] markMessageAsRead não suportado em Megazap');
        return {
            success: true,
            data: null,
            error: null
        };
    }
}

// Exportar API unificada
module.exports = {
    // Funções principais (compatíveis com ambos os serviços)
    sendTextMessage,
    sendDocument,
    sendButtonMessage,
    sendListMessage,
    sendQuestion,          // Específico Megazap, fallback Evolution
    sendMenu,              // Específico Megazap
    sendDirectToMenu,      // Específico Megazap
    formatPhoneNumber,
    testConnection,
    getServiceInfo,

    // Funções específicas Evolution
    setWebhook,
    getInstanceStatus,
    connectInstance,
    markMessageAsRead,

    // Utilidades
    MESSAGE_FORMATS,
    getMessageFormat,
    getMessageService,

    // Acesso direto aos serviços (para casos especiais)
    evolutionService,
    megazapService
};
