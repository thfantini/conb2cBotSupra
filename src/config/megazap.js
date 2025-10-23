/**
 * Configuração do Megazap
 *
 * Diferente do Evolution API que faz requisições HTTP,
 * este serviço apenas retorna JSONs formatados conforme
 * o padrão esperado pelo Megazap.
 */

require('dotenv').config();

/**
 * Envia mensagem de texto
 * @param {string} phoneNumber - Número do destinatário (mantido para compatibilidade futura)
 * @param {string} message - Mensagem a ser enviada
 * @param {Object} newTicket - Objeto opcional com departmentUUID e userUUID
 * @returns {Object} JSON formatado para Megazap
 */
function sendTextMessage(phoneNumber, message, newTicket = null) {
    try {
        console.log(`📱 [MEGAZAP] Gerando JSON de texto para ${phoneNumber}`);

        const payload = {
            type: "INFORMATION",
            text: message
        };

        // Adicionar newTicket se fornecido
        if (newTicket && (newTicket.departmentUUID || newTicket.userUUID)) {
            payload.newTicket = {
                departmentUUID: newTicket.departmentUUID || 1020,
                userUUID: newTicket.userUUID || 123456
            };
            console.log(`🎫 [MEGAZAP] Novo ticket incluído - Dept: ${payload.newTicket.departmentUUID}, User: ${payload.newTicket.userUUID}`);
        }

        console.log('✅ [MEGAZAP] JSON de texto gerado com sucesso');
        return {
            success: true,
            data: payload,
            error: null
        };

    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao gerar JSON de texto:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Envia documento (PDF, imagem, etc)
 * @param {string} phoneNumber - Número do telefone (mantido para compatibilidade futura)
 * @param {string} base64 - Arquivo em base64
 * @param {string} filename - Nome do arquivo
 * @param {string} message - Mensagem/caption (opcional)
 * @param {Object} newTicket - Objeto opcional com departmentUUID e userUUID
 * @returns {Object} JSON formatado para Megazap
 */
function sendDocument(phoneNumber, base64, filename, message = '', newTicket = null) {
    try {
        console.log(`📎 [MEGAZAP] Gerando JSON de documento para ${phoneNumber}: ${filename}`);

        // Limpar base64 (remover prefixos se houver)
        const base64Clean = base64
            .replace(/data:application\/pdf;base64,/g, '')
            .replace(/data:image\/[a-z]+;base64,/g, '')
            .replace(/\r?\n|\r/g, '')
            .trim();

        const payload = {
            type: "INFORMATION",
            text: message || '',
            attachments: [
                {
                    position: "AFTER",
                    type: "DOCUMENT",
                    name: filename,
                    base64: base64Clean
                }
            ]
        };

        // Adicionar newTicket se fornecido
        if (newTicket && (newTicket.departmentUUID || newTicket.userUUID)) {
            payload.newTicket = {
                departmentUUID: newTicket.departmentUUID || 1020,
                userUUID: newTicket.userUUID || 123456
            };
            console.log(`🎫 [MEGAZAP] Novo ticket incluído - Dept: ${payload.newTicket.departmentUUID}, User: ${payload.newTicket.userUUID}`);
        }

        console.log('✅ [MEGAZAP] JSON de documento gerado com sucesso');
        return {
            success: true,
            data: payload,
            error: null
        };

    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao gerar JSON de documento:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Envia pergunta com callback
 * @param {string} phoneNumber - Número do telefone (mantido para compatibilidade futura)
 * @param {string} message - Mensagem de pergunta
 * @param {string} endpoint - Endpoint de callback
 * @returns {Object} JSON formatado para Megazap
 */
function sendQuestion(phoneNumber, message, endpoint) {
    try {
        console.log(`❓ [MEGAZAP] Gerando JSON de pergunta para ${phoneNumber}`);
        console.log(`🔗 [MEGAZAP] Endpoint de callback: ${endpoint}`);

        const payload = {
            type: "QUESTION",
            text: message,
            callback: {
                endpoint: endpoint
            }
        };

        console.log('✅ [MEGAZAP] JSON de pergunta gerado com sucesso');
        return {
            success: true,
            data: payload,
            error: null
        };

    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao gerar JSON de pergunta:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Redireciona para menu
 * @param {string} phoneNumber - Número do telefone
 * @param {Object} menu - JSON do menu
 * @returns {Object} JSON formatado para Megazap
 */
function sendMenu(phoneNumber, menu) {
    try {
        console.log(`🔀 [MEGAZAP] Gerando JSON de Menu para ${phoneNumber}`);

        const payload = {
            type: "MENU",
            items: menu
        };

        console.log('[MEGAZAP] JSON de Menu gerado com sucesso');
        return {
            success: true,
            data: payload,
            error: null
        };

    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao gerar JSON de Menu:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Redireciona para menu
 * @param {string} phoneNumber - Número do telefone (mantido para compatibilidade futura)
 * @param {string|number} menu - UUID do menu
 * @returns {Object} JSON formatado para Megazap
 */
function sendDirectToMenu(phoneNumber, menu) {
    try {
        console.log(`🔀 [MEGAZAP] Gerando JSON de redirecionamento para ${phoneNumber}`);
        console.log(`📋 [MEGAZAP] Menu UUID: ${menu}`);

        const payload = {
            type: "DIRECT_TO_MENU",
            menuUUID: menu
        };

        console.log('✅ [MEGAZAP] JSON de redirecionamento gerado com sucesso');
        return {
            success: true,
            data: payload,
            error: null
        };

    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao gerar JSON de redirecionamento:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Envia mensagem com botões (para compatibilidade com Evolution)
 * No Megazap, pode ser mapeado como QUESTION ou outro tipo
 * @param {string} phoneNumber - Número do destinatário
 * @param {string} text - Texto da mensagem
 * @param {Array} buttons - Array de botões
 * @returns {Object} JSON formatado
 */
function sendButtonMessage(phoneNumber, text, buttons) {
    try {
        console.log(`🔘 [MEGAZAP] Gerando JSON de botões para ${phoneNumber}`);

        // No Megazap, podemos converter botões para uma mensagem informativa
        // com as opções listadas no texto
        let messageWithButtons = text + '\n\n';
        buttons.forEach((button, index) => {
            messageWithButtons += `${index + 1}. ${button.text || button.displayText}\n`;
        });

        const payload = {
            type: "INFORMATION",
            text: messageWithButtons.trim()
        };

        console.log('✅ [MEGAZAP] JSON de botões gerado como INFORMATION');
        return {
            success: true,
            data: payload,
            error: null
        };

    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao gerar JSON de botões:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Envia lista de opções (para compatibilidade com Evolution)
 * No Megazap, convertido para INFORMATION com texto formatado
 * @param {string} phoneNumber - Número do destinatário
 * @param {string} title - Título da lista
 * @param {string} description - Descrição da lista
 * @param {Array} sections - Seções da lista
 * @returns {Object} JSON formatado
 */
function sendListMessage(phoneNumber, title, description, sections) {
    try {
        console.log(`📋 [MEGAZAP] Gerando JSON de lista para ${phoneNumber}`);

        let messageText = `*${title}*\n\n${description}\n\n`;

        sections.forEach(section => {
            if (section.title) {
                messageText += `*${section.title}*\n`;
            }
            if (section.rows) {
                section.rows.forEach((row, index) => {
                    messageText += `${index + 1}. ${row.title}`;
                    if (row.description) {
                        messageText += ` - ${row.description}`;
                    }
                    messageText += '\n';
                });
            }
            messageText += '\n';
        });

        const payload = {
            type: "INFORMATION",
            text: messageText.trim()
        };

        console.log('✅ [MEGAZAP] JSON de lista gerado como INFORMATION');
        return {
            success: true,
            data: payload,
            error: null
        };

    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao gerar JSON de lista:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Formata número para padrão brasileiro (mantido para compatibilidade)
 * @param {string} phoneNumber - Número a ser formatado
 * @returns {string} Número formatado (13 dígitos: 55 + DDD + 9 + número)
 */
function formatPhoneNumber(phoneNumber) {
    // Remove caracteres não numéricos
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Cenário 1: 10 dígitos (DDD + 8 dígitos sem 9)
    // Ex: 3199999999 → 5531999999999
    if (cleaned.length === 10) {
        cleaned = '55' + cleaned.substring(0, 2) + '9' + cleaned.substring(2);
    }
    // Cenário 2: 11 dígitos (DDD + 9 + 8 dígitos)
    // Ex: 31999999999 → 5531999999999
    else if (cleaned.length === 11) {
        if (!cleaned.startsWith('55')) {
            cleaned = '55' + cleaned;
        }
    }
    // Cenário 3: 12 dígitos (55 + DDD + 8 dígitos sem 9)
    // Ex: 553199999999 → 5531999999999
    else if (cleaned.length === 12) {
        if (cleaned.startsWith('55') && cleaned.substring(4, 5) !== '9') {
            cleaned = cleaned.substring(0, 4) + '9' + cleaned.substring(4);
        }
    }
    // Cenário 4: 13 dígitos (já completo)
    // Ex: 5531999999999 → 5531999999999
    else if (cleaned.length === 13) {
        // Já está no formato correto
    }
    // Cenário 5: outros tamanhos, tentar adicionar 55 se não tiver
    else {
        if (!cleaned.startsWith('55')) {
            cleaned = '55' + cleaned;
        }
    }

    return cleaned;
}

/**
 * Testa configuração do Megazap
 * Como não há API HTTP, apenas valida se o módulo está funcionando
 * @returns {Promise<boolean>} Status da configuração
 */
async function testConnection() {
    try {
        console.log('✅ [MEGAZAP] Módulo Megazap carregado e funcionando');
        console.log('ℹ️  [MEGAZAP] Este módulo gera JSONs, não faz requisições HTTP');
        return true;
    } catch (error) {
        console.error('❌ [MEGAZAP] Erro ao testar módulo:', error.message);
        return false;
    }
}

module.exports = {
    sendTextMessage,
    sendDocument,
    sendQuestion,
    sendMenu,
    sendDirectToMenu,
    sendButtonMessage,
    sendListMessage,
    formatPhoneNumber,
    testConnection
};
