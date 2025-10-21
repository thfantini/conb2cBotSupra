const endpoint = require('../config/endpoint');
const database = require('../config/database');
const whatsappService = require('../services/whatsappService');
const atendimentoService = require('../services/atendimentoService');
const validacaoService = require('../services/validacaoService');
const MENSAGENS = require('../utils/mensagens');

/**
 * Configurações do webhook
 */
const WEBHOOK_CONFIG = {
    USAR_NOVO_FLUXO: process.env.USAR_NOVO_FLUXO === 'true' || false,
    TIMEOUT_SESSAO: parseInt(process.env.TIMEOUT_SESSAO) || 30 * 60 * 1000, // 30 minutos
    VALIDAR_COM_API: process.env.VALIDAR_COM_API === 'true' || true
};

/**
 * Contador de mensagens processadas
 */
let mensagensProcessadas = 0;
let ultimaAtualizacao = new Date();

/**
 * Endpoint principal para receber webhooks da Evolution API
 * @param {Object} req - Request do Express
 * @param {Object} res - Response do Express
 */
async function receberMensagem(req, res) {
    try {
        console.log('📨 [WEBHOOK] Webhook recebido');
        console.log('📨 [WEBHOOK] Body:', JSON.stringify(req.body, null, 2));

        const webhookData = req.body;

        // Detectar formato do webhook (Evolution 2.3.6 vs versões anteriores)
        let mensagens = [];

        // Formato Evolution 2.3.6: { event, instance, data: { key, message, ... }, destination, ... }
        if (webhookData.event === 'messages.upsert' && webhookData.data && webhookData.data.key) {
            console.log('📌 [WEBHOOK] Formato detectado: Evolution API 2.3.6');
            mensagens = [webhookData.data];
        }
        // Formato anterior: { data: [ { key, message } ] } ou { data: { key, message } }
        else if (webhookData.data) {
            console.log('📌 [WEBHOOK] Formato detectado: Evolution API versão anterior');
            mensagens = Array.isArray(webhookData.data)
                ? webhookData.data
                : [webhookData.data];
        }
        // Estrutura inválida
        else {
            console.log('⚠️ [WEBHOOK] Estrutura inválida');
            console.log('⚠️ [WEBHOOK] Body recebido:', JSON.stringify(webhookData, null, 2));
            return res.status(400).json({
                success: false,
                error: 'Estrutura de webhook inválida'
            });
        }

        console.log(`📊 [WEBHOOK] Total de mensagens: ${mensagens.length}`);

        const resultados = [];

        for (const mensagem of mensagens) {
            try {
                const resultado = await processarMensagemWebhook(mensagem);
                resultados.push(resultado);
            } catch (error) {
                console.error('❌ [WEBHOOK] Erro ao processar mensagem:', error);
                resultados.push({
                    success: false,
                    error: error.message
                });
            }
        }

        mensagensProcessadas += mensagens.length;

        // Responder rapidamente ao webhook
        res.status(200).json({
            success: true,
            processadas: mensagens.length,
            resultados: resultados
        });

    } catch (error) {
        console.error('❌ [WEBHOOK] Erro fatal:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar webhook'
        });
    }
}

/**
 * Processa uma única mensagem do webhook
 * @param {Object} messageData - Dados da mensagem
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processarMensagemWebhook(messageData) {
    try {
        // Extrair dados da mensagem
        const { key, message, messageTimestamp } = messageData;
        
        if (!key || !message) {
            console.log('⚠️ [WEBHOOK] Mensagem sem key ou message');
            return { success: false, error: 'Dados incompletos' };
        }
        
        // Extrair informações
        const remoteJid = key.remoteJid;
        const messageId = key.id;
        const fromMe = key.fromMe;
        
        // Extrair texto da mensagem
        const messageText = message.conversation || 
                           message.extendedTextMessage?.text || 
                           message.buttonsResponseMessage?.selectedButtonId ||
                           message.listResponseMessage?.title ||
                           '';
        
        console.log('📱 [WEBHOOK] RemoteJid:', remoteJid);
        console.log('💬 [WEBHOOK] Texto:', messageText);
        console.log('🆔 [WEBHOOK] MessageId:', messageId);
        console.log('👤 [WEBHOOK] FromMe:', fromMe);
        
        // Validações iniciais
        const validacao = validarMensagemWebhook(remoteJid, messageText, fromMe);
        if (!validacao.valida) {
            console.log(`⚠️ [WEBHOOK] ${validacao.motivo}`);
            return { success: true, data: validacao.motivo };
        }
        
        const telefone = validacao.telefone;
        
        // Decidir qual fluxo usar
        if (WEBHOOK_CONFIG.USAR_NOVO_FLUXO && WEBHOOK_CONFIG.VALIDAR_COM_API) {
            // Novo fluxo com endpoint API
            return await processarComNovoFluxo(telefone, messageText, messageId);
        } else {
            // Fluxo antigo com database
            return await processarComFluxoAntigo(messageData);
        }
        
    } catch (error) {
        console.error('❌ [WEBHOOK] Erro ao processar mensagem:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Valida mensagem do webhook
 * @param {string} remoteJid - JID remoto
 * @param {string} messageText - Texto da mensagem
 * @param {boolean} fromMe - Se é do bot
 * @returns {Object} Resultado da validação
 */
function validarMensagemWebhook(remoteJid, messageText, fromMe) {
    // Ignorar mensagens do próprio bot
    if (fromMe) {
        return { valida: false, motivo: 'Mensagem do próprio bot' };
    }
    
    // Ignorar mensagens de grupos
    if (remoteJid.includes('@g.us')) {
        return { valida: false, motivo: 'Mensagem de grupo' };
    }
    
    // Ignorar status do WhatsApp
    if (remoteJid.includes('status@broadcast')) {
        return { valida: false, motivo: 'Status do WhatsApp' };
    }
    
    // Ignorar mensagens vazias
    if (!messageText || !messageText.trim()) {
        return { valida: false, motivo: 'Mensagem vazia' };
    }
    
    // Extrair telefone
    const telefone = remoteJid.replace('@s.whatsapp.net', '');
    
    // Validar formato do telefone
    if (!validacaoService.validarFormatoTelefone(telefone)) {
        return { valida: false, motivo: 'Formato de telefone inválido' };
    }
    
    return {
        valida: true,
        telefone: validacaoService.normalizarTelefoneWhatsApp(telefone),
        messageText: messageText.trim()
    };
}

/**
 * Processa mensagem com novo fluxo (endpoint + atendimentoService)
 * @param {string} telefone - Número do telefone
 * @param {string} messageText - Texto da mensagem
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processarComNovoFluxo(telefone, messageText, messageId) {
    console.log('🆕 [WEBHOOK] Usando NOVO FLUXO (endpoint + atendimentoService)');
    
    try {
        // 1. Verificar timeout de sessão
        const sessaoValida = atendimentoService.verificarTimeoutSessao(telefone);
        
        if (!sessaoValida) {
            console.log('⏱️ [WEBHOOK] Sessão expirou - reiniciando');
            await enviarMensagemTimeout(telefone);
        }
        
        // 2. Buscar cliente por telefone via API
        console.log('🔍 [WEBHOOK] Buscando cliente na API...');
        const clienteAPI = await endpoint.getClienteByCelular(telefone);
        
        // 3. Validar bloqueio
        if (clienteAPI.blocked) {
            console.log('🚫 [WEBHOOK] Cliente bloqueado');
            await enviarMensagemBloqueio(telefone, clienteAPI.error);
            
            // Registrar tentativa bloqueada
            await registrarAtendimentoBloqueado(
                messageId,
                clienteAPI.data?.data[0],
                messageText
            );
            
            return { 
                success: true, 
                status: 'bloqueado',
                data: 'Cliente bloqueado'
            };
        }
        
        // 4. Validar permissão
        if (clienteAPI.success && !clienteAPI.hasPermission) {
            console.log('⚠️ [WEBHOOK] Sem permissão de faturamento');
            await enviarMensagemSemPermissao(telefone, clienteAPI.error);
            
            // Registrar tentativa sem permissão
            await registrarAtendimentoSemPermissao(
                messageId,
                clienteAPI.data?.data[0],
                messageText
            );
            
            return { 
                success: true, 
                status: 'sem_permissao',
                data: 'Sem permissão de faturamento'
            };
        }
        
        // 5. Cliente válido - processar com atendimentoService
        console.log('✅ [WEBHOOK] Cliente válido - processando atendimento');
        
        const resultado = await atendimentoService.fluxoAtendimento(
            telefone,
            messageText,
            messageId
        );
        
        return {
            success: true,
            status: resultado.status,
            data: resultado
        };
        
    } catch (error) {
        console.error('❌ [WEBHOOK] Erro no novo fluxo:', error);
        
        // Enviar mensagem de erro ao cliente
        await enviarMensagemErro(telefone);
        
        return { 
            success: false, 
            error: error.message 
        };
    }
}

/**
 * Processa mensagem com fluxo antigo (database + whatsappService)
 * @param {Object} messageData - Dados da mensagem
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processarComFluxoAntigo(messageData) {
    console.log('📜 [WEBHOOK] Usando FLUXO ANTIGO (database + whatsappService)');
    
    try {
        // Usar o processamento existente do whatsappService
        const resultado = await whatsappService.processarMensagem(messageData);
        
        return {
            success: resultado.success,
            status: 'processado_antigo',
            data: resultado.data
        };
        
    } catch (error) {
        console.error('❌ [WEBHOOK] Erro no fluxo antigo:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

/**
 * Envia mensagem de timeout
 * @param {string} telefone - Número do telefone
 */
async function enviarMensagemTimeout(telefone) {
    const evolutionAPI = require('../config/evolution');
    await evolutionAPI.sendTextMessage(
        telefone,
        MENSAGENS.ENCERRAMENTO.TIMEOUT()
    );
}

/**
 * Envia mensagem de bloqueio
 * @param {string} telefone - Número do telefone
 * @param {string} mensagemPersonalizada - Mensagem personalizada
 */
async function enviarMensagemBloqueio(telefone, mensagemPersonalizada) {
    const evolutionAPI = require('../config/evolution');
    await evolutionAPI.sendTextMessage(
        telefone,
        mensagemPersonalizada || MENSAGENS.BLOQUEIO.CLIENTE_BLOQUEADO()
    );
}

/**
 * Envia mensagem de sem permissão
 * @param {string} telefone - Número do telefone
 * @param {string} mensagemPersonalizada - Mensagem personalizada
 */
async function enviarMensagemSemPermissao(telefone, mensagemPersonalizada) {
    const evolutionAPI = require('../config/evolution');
    await evolutionAPI.sendTextMessage(
        telefone,
        mensagemPersonalizada || MENSAGENS.PERMISSAO.SEM_PERMISSAO()
    );
}

/**
 * Envia mensagem de erro genérico
 * @param {string} telefone - Número do telefone
 */
async function enviarMensagemErro(telefone) {
    const evolutionAPI = require('../config/evolution');
    await evolutionAPI.sendTextMessage(
        telefone,
        '❌ Desculpe, ocorreu um erro temporário.\n\n' +
        'Por favor, tente novamente em alguns instantes.'
    );
}

/**
 * Registra atendimento bloqueado
 * @param {string} messageId - ID da mensagem
 * @param {Object} cliente - Dados do cliente
 * @param {string} mensagem - Mensagem enviada
 */
async function registrarAtendimentoBloqueado(messageId, cliente, mensagem) {
    if (!cliente) return;
    
    try {
        await database.registrarAtendimento({
            messageId: messageId,
            cliente: cliente.id || null,
            cnpj: cliente.cpfCnpj || null,
            conversa: [{
                tipo: 'cliente',
                data: new Date(),
                mensagem: mensagem
            }, {
                tipo: 'bot',
                data: new Date(),
                mensagem: 'Tentativa de atendimento - Cliente bloqueado',
                status: 'bloqueado'
            }]
        });
    } catch (error) {
        console.error('❌ Erro ao registrar atendimento bloqueado:', error);
    }
}

/**
 * Registra atendimento sem permissão
 * @param {string} messageId - ID da mensagem
 * @param {Object} cliente - Dados do cliente
 * @param {string} mensagem - Mensagem enviada
 */
async function registrarAtendimentoSemPermissao(messageId, cliente, mensagem) {
    if (!cliente) return;
    
    try {
        await database.registrarAtendimento({
            messageId: messageId,
            cliente: cliente.id || null,
            cnpj: cliente.cpfCnpj || null,
            conversa: [{
                tipo: 'cliente',
                data: new Date(),
                mensagem: mensagem
            }, {
                tipo: 'bot',
                data: new Date(),
                mensagem: 'Tentativa de atendimento - Sem permissão de faturamento',
                status: 'sem_permissao'
            }]
        });
    } catch (error) {
        console.error('❌ Erro ao registrar atendimento sem permissão:', error);
    }
}

/**
 * Verifica status do webhook
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
function verificarStatus(req, res) {
    const uptime = process.uptime();
    const uptimeFormatado = Math.floor(uptime / 3600) + 'h ' + 
                           Math.floor((uptime % 3600) / 60) + 'm';
    
    res.json({
        status: 'online',
        versao: '2.0.0',
        fluxo: WEBHOOK_CONFIG.USAR_NOVO_FLUXO ? 'novo (endpoint)' : 'antigo (database)',
        mensagensProcessadas: mensagensProcessadas,
        uptime: uptimeFormatado,
        ultimaAtualizacao: ultimaAtualizacao,
        configuracoes: {
            validarComAPI: WEBHOOK_CONFIG.VALIDAR_COM_API,
            timeoutSessao: WEBHOOK_CONFIG.TIMEOUT_SESSAO / 1000 + 's'
        }
    });
}

/**
 * Middleware de log de requisições
 * @param {Object} req - Request
 * @param {Object} res - Response
 * @param {Function} next - Next
 */
function logRequest(req, res, next) {
    const timestamp = new Date().toISOString();
    console.log(`📥 [${timestamp}] ${req.method} ${req.path}`);
    next();
}

/**
 * Middleware de validação de token
 * @param {Object} req - Request
 * @param {Object} res - Response
 * @param {Function} next - Next
 */
function validarToken(req, res, next) {
    const token = req.headers.authorization || req.query.token;
    const expectedToken = process.env.WEBHOOK_TOKEN;
    
    // Se não há token configurado, pular validação
    if (!expectedToken) {
        return next();
    }
    
    if (token === expectedToken || token === `Bearer ${expectedToken}`) {
        return next();
    }
    
    console.log('🚫 Token inválido ou ausente');
    res.status(401).json({
        success: false,
        error: 'Token inválido ou ausente'
    });
}

/**
 * Health check
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
async function healthCheck(req, res) {
    try {
        // Testar conexão com banco
        const dbOk = await database.testConnection();
        
        // Testar conexão com API
        const apiOk = WEBHOOK_CONFIG.VALIDAR_COM_API 
            ? await endpoint.testConnection()
            : true;
        
        const evolutionAPI = require('../config/evolution');
        const evolutionOk = await evolutionAPI.testConnection();
        
        const todosOk = dbOk && apiOk && evolutionOk;
        
        res.status(todosOk ? 200 : 503).json({
            status: todosOk ? 'healthy' : 'degraded',
            checks: {
                database: dbOk ? 'ok' : 'erro',
                apiExterna: apiOk ? 'ok' : 'erro',
                evolutionAPI: evolutionOk ? 'ok' : 'erro'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            error: error.message
        });
    }
}

module.exports = {
    receberMensagem,
    verificarStatus,
    healthCheck,
    logRequest,
    validarToken
};