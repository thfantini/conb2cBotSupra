const axios = require('axios');
require('dotenv').config();

/**
 * Configuração da API Evolution
 */
const evolutionConfig = {
    baseURL: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instanceName: process.env.EVOLUTION_INSTANCE_NAME,
    timeout: 30000
};

/**
 * Cliente HTTP configurado para API Evolution
 */
const evolutionAPI = axios.create({
    baseURL: evolutionConfig.baseURL,
    timeout: evolutionConfig.timeout,
    headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionConfig.apiKey
    }
});

/**
 * Envia mensagem de texto via WhatsApp
 * @param {string} phoneNumber - Número do destinatário (formato: 5531999999999)
 * @param {string} message - Mensagem a ser enviada
 * @returns {Promise} Resultado do envio
 */
async function sendTextMessage(phoneNumber, message) {
    try {
        const payload = {
            number: phoneNumber,
            text: message
        };

        const response = await evolutionAPI.post(
            `/message/sendText/${evolutionConfig.instanceName}`,
            payload
        );

        return {
            success: true,
            data: response.data,
            error: null
        };
    } catch (error) {
        console.error('Erro ao enviar mensagem de texto:', error.response?.data || error.message);
        return {
            success: false,
            data: null,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Envia mensagem com botões (menu de opções)
 * @param {string} phoneNumber - Número do destinatário
 * @param {string} text - Texto da mensagem
 * @param {Array} buttons - Array de botões
 * @returns {Promise} Resultado do envio
*/
async function sendButtonMessage(phoneNumber, text, buttons) {
    try {
        const payload = {
            number: phoneNumber,
            title: 'Title Button',
            description: 'Description Button',
            footer: 'Footer Button',
            buttons: buttons.map((button, index) => ({
                type: button.type,
                displayText: button.text,
                id: button.id
            }))
        };

        console.log('sendButtonMessage');
        console.log(payload);

        const response = await evolutionAPI.post(
            `/message/sendButtons/${evolutionConfig.instanceName}`,
            payload
        );

        return {
            success: true,
            data: response.data,
            error: null
        };

    } catch (error) {
        //console.error('Erro ao enviar mensagem com botões:', error.response?.data || error.message);
        console.error('❌ Erro ao enviar botões:', error.message);
        console.error('❌ Response:', error.response?.data);
        return {
            success: false,
            data: null,
            error: error.response?.data?.message || error.message
        };
    }
}


/**
 * Envia mensagem com botões
 * @param {string} phoneNumber - Número do telefone
 * @param {string} text - Texto da mensagem
 * @param {Array} buttons - Array de botões [{id, text}]
 * @returns {Promise<Object>} Resultado do envio

async function sendButtonMessage(phoneNumber, text, buttons) {
    try {
        console.log(`🔘 Enviando mensagem com botões para ${phoneNumber}`);
        
        const numberFormatted = phoneNumber.replace(/\D/g, '');
        
        // Formatar botões para estrutura da Evolution API
        const buttonsFormatted = buttons.map(btn => ({
            buttonId: btn.id,
            buttonText: {
                displayText: btn.text
            },
            type: 1
        }));
        
        const payload = {
            number: numberFormatted,
            options: {
                delay: 1200,
                presence: 'composing'
            },
            buttonMessage: {
                text: text,
                buttons: buttonsFormatted,
                footerText: ''
            }
        };
        
        const response = await evolutionAPI.post(
            `/message/sendButtons/${evolutionConfig.instanceName}`,
            payload
        );

        if (response.data) {
            console.log('✅ Mensagem com botões enviada');
            return {
                success: true,
                data: response.data,
                error: null
            };
        }

        return {
            success: false,
            data: null,
            error: 'Resposta inválida da API'
        };

    } catch (error) {
        console.error('❌ Erro ao enviar botões:', error.message);
        console.error('❌ Response:', error.response?.data);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}
*/

/**
 * Envia lista de opções
 * @param {string} phoneNumber - Número do destinatário
 * @param {string} title - Título da lista
 * @param {string} description - Descrição da lista
 * @param {Array} sections - Seções da lista
 * @returns {Promise} Resultado do envio
 */
async function sendListMessage(phoneNumber, title, description, sections) {
    try {
        const payload = {
            number: phoneNumber,
            listMessage: {
                title: title,
                description: description,
                buttonText: "Ver opções",
                listType: 1,
                sections: sections
            }
        };

        const response = await evolutionAPI.post(
            `/message/sendList/${evolutionConfig.instanceName}`,
            payload
        );

        return {
            success: true,
            data: response.data,
            error: null
        };
    } catch (error) {
        console.error('Erro ao enviar lista:', error.response?.data || error.message);
        return {
            success: false,
            data: null,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Envia documento (PDF, imagem, etc)
 * @param {string} phoneNumber - Número do telefone
 * @param {string} base64 - Arquivo em base64
 * @param {string} filename - Nome do arquivo
 * @param {string} caption - Legenda (opcional)
 * @returns {Promise<Object>} Resultado do envio

async function sendDocument(phoneNumber, base64, filename, caption = '') {
    try {
        console.log(`📎 Enviando documento para ${phoneNumber}: ${filename}`);

        const payload = {
            number: phoneNumber,
            mediatype: 'document',
            mimetype: 'application/pdf',
            caption: caption,
            fileName: filename,
            media: base64
        };

        const response = await evolutionAPI.post(
            `/message/sendMedia/${evolutionConfig.instanceName}`,
            payload
        );

        console.log('Payload:', JSON.stringify({
            number: numberFormatted,
            options: { delay: 1200, presence: 'composing' },
            mediaMessage: {
                mediatype: 'document',
                fileName: filename,
                media: base64Formatted.substring(0, 100) + '...',
                caption: caption
            }
        }, null, 2));

        if (response.data) {
            console.log('✅ Documento enviado com sucesso');
            return {
                success: true,
                data: response.data,
                error: null
            };
        }

        return {
            success: false,
            data: null,
            error: 'Resposta inválida da API'
        };

    } catch (error) {
        console.error('❌ Erro ao enviar documento:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}
*/

/**
 * Envia documento (PDF, imagem, etc)
 * @param {string} phoneNumber - Número do telefone
 * @param {string} base64 - Arquivo em base64
 * @param {string} filename - Nome do arquivo
 * @param {string} caption - Legenda (opcional)
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendDocument(phoneNumber, base64, filename, caption = '') {
    try {
        console.log(`📎 Enviando documento para ${phoneNumber}: ${filename}`);
        
        // Formatar número
        //const numberFormatted = phoneNumber.replace(/\D/g, '');
        
        // Limpar base64 (remover quebras de linha e prefixos)
        const base64Clean = base64
            .replace(/data:application\/pdf;base64,/g, '')
            .replace(/\r?\n|\r/g, '')
            .trim();
        
        const payload = {
            number: phoneNumber,
            mediatype: 'document',
            media: base64Clean,
            fileName: filename,
            caption: caption || ''
        };
        
        const response = await evolutionAPI.post(`/message/sendMedia/${evolutionConfig.instanceName}`, payload);

        if (response.data) {
            console.log('✅ Documento enviado com sucesso');
            return {
                success: true,
                data: response.data,
                error: null
            };
        }

        return {
            success: false,
            data: null,
            error: 'Resposta inválida da API'
        };

    } catch (error) {
        console.error('❌ Erro ao enviar documento:', error.message);
        console.error('❌ Response data:', JSON.stringify(error.response?.data, null, 2));
        return {
            success: false,
            data: null,
            error: error.response?.data?.response?.message || error.message
        };
    }
}


/**
 * Configura webhook para receber mensagens
 * @param {string} webhookUrl - URL do webhook
 * @returns {Promise} Resultado da configuração
 */
async function setWebhook(webhookUrl) {
    try {
        const payload = {
            webhook: webhookUrl,
            events: [
                'MESSAGE_RECEIVED',
                'MESSAGE_SENT',
                'CONNECTION_UPDATE'
            ]
        };

        const response = await evolutionAPI.post(
            `/webhook/set/${evolutionConfig.instanceName}`,
            payload
        );

        return {
            success: true,
            data: response.data,
            error: null
        };
    } catch (error) {
        console.error('Erro ao configurar webhook:', error.response?.data || error.message);
        return {
            success: false,
            data: null,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Verifica status da instância
 * @returns {Promise} Status da instância
 */
async function getInstanceStatus() {
    //console.log(`${evolutionConfig.baseURL}/instance/connectionState/${evolutionConfig.instanceName}`);
    try {
        const response = await evolutionAPI.get(
            `/instance/connectionState/${evolutionConfig.instanceName}`
        );

        return {
            success: true,
            data: response.data,
            error: null
        };
    } catch (error) {
        console.error('Erro ao verificar status da instância:', error.response?.data || error.message);
        return {
            success: false,
            data: null,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Conecta a instância do WhatsApp
 * @returns {Promise} Resultado da conexão
 */
async function connectInstance() {
    try {
        const response = await evolutionAPI.post(
            `/instance/connect/${evolutionConfig.instanceName}`
        );

        return {
            success: true,
            data: response.data,
            error: null
        };
    } catch (error) {
        console.error('Erro ao conectar instância:', error.response?.data || error.message);
        return {
            success: false,
            data: null,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Marca mensagem como lida
 * @param {string} messageId - ID da mensagem
 * @param {string} remoteJid - JID do chat
 * @returns {Promise} Resultado da operação
 */
async function markMessageAsRead(messageId, remoteJid) {
    try {
        const payload = {
            readMessages: [{
                id: messageId,
                fromMe: false,
                remoteJid: remoteJid
            }]
        };

        const response = await evolutionAPI.post(
            `/chat/markMessageAsRead/${evolutionConfig.instanceName}`,
            payload
        );

        return {
            success: true,
            data: response.data,
            error: null
        };
    } catch (error) {
        console.error('Erro ao marcar mensagem como lida:', error.response?.data || error.message);
        return {
            success: false,
            data: null,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Testa conectividade com a API Evolution
 * @returns {Promise} Status da conexão
 */
async function testConnection() {
    try {
        const status = await getInstanceStatus();
        if (status.success) {
            console.log('✅ Conexão com API Evolution estabelecida com sucesso');
            return true;
        } else {
            console.error('❌ Falha na conexão com API Evolution:', status.error);
            return false;
        }
    } catch (error) {
        console.error('❌ Erro na conexão com API Evolution:', error.message);
        return false;
    }
}

/**
 * Formata número para padrão brasileiro
 * @param {string} phoneNumber - Número a ser formatado
 * @returns {string} Número formatado
 */
function formatPhoneNumber(phoneNumber) {
    // Remove caracteres não numéricos
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Adiciona código do país se não existir
    if (!cleaned.startsWith('55')) {
        cleaned = '55' + cleaned;
    }
    
    // Adiciona 9 no celular se necessário (padrão brasileiro)
    if (cleaned.length === 12 && cleaned.substring(4, 5) !== '9') {
        cleaned = cleaned.substring(0, 4) + '9' + cleaned.substring(4);
    }
    
    return cleaned;
}

module.exports = {
    evolutionAPI,
    sendTextMessage,
    sendDocument,
    sendButtonMessage,
    sendListMessage,
    setWebhook,
    getInstanceStatus,
    connectInstance,
    markMessageAsRead,
    testConnection,
    formatPhoneNumber
};