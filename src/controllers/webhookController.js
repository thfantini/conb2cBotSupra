const endpoint = require('../config/endpoint');
const database = require('../config/database');
const whatsappService = require('../services/whatsappService');
const atendimentoService = require('../services/atendimentoService');
const validacaoService = require('../services/validacaoService');
const messageFormatAdapter = require('../services/messageFormatAdapter');
const atendimentoMegaZap = require('../services/atendimentoMegaZap');
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

        // Usar o adaptador para converter o formato da mensagem
        const mensagensAdaptadas = messageFormatAdapter.adaptMessageFormat(webhookData);

        if (!mensagensAdaptadas || mensagensAdaptadas.length === 0) {
            console.log('⚠️ [WEBHOOK] Nenhuma mensagem válida encontrada');
            return res.status(400).json({
                success: false,
                webhook: process.env.MESSAGE_FORMAT,
                error: 'Estrutura de webhook inválida ou sem mensagens'
            });
        }

        console.log(`📊 [WEBHOOK] Total de mensagens: ${mensagensAdaptadas.length}`);

        const resultados = [];

        for (const mensagemAdaptada of mensagensAdaptadas) {
            try {
                const resultado = await processarMensagemWebhook(mensagemAdaptada);
                resultados.push(resultado);
            } catch (error) {
                console.error('❌ [WEBHOOK] Erro ao processar mensagem:', error);
                resultados.push({
                    success: false,
                    webhook: process.env.MESSAGE_FORMAT,
                    error: error.message
                });
            }
        }

        mensagensProcessadas += mensagensAdaptadas.length;

        // Verificar formato de resposta
        const messageFormat = process.env.MESSAGE_FORMAT || '1';

        // Megazap espera apenas o conteúdo de "data", sem wrapper
        if (messageFormat === '2') {
            console.log('📤 [WEBHOOK] Retornando resposta formato Megazap (apenas data)');

            // Se houver apenas 1 resultado, retornar diretamente o data
            if (resultados.length === 1 && resultados[0].success && resultados[0].data) {
                console.log('📤 [WEBHOOK] Retornando payload único para Megazap');
                return res.status(200).json(resultados[0].data);
            }

            // Se houver múltiplos resultados, retornar array de data
            const payloadsMegazap = resultados
                .filter(r => r.success && r.data)
                .map(r => r.data);

            console.log('📤 [WEBHOOK] Retornando array de payloads para Megazap');
            return res.status(200).json(payloadsMegazap.length === 1 ? payloadsMegazap[0] : payloadsMegazap);
        }

        // Evolution/padrão - retornar com wrapper completo
        console.log('📤 [WEBHOOK] Retornando resposta formato Evolution (com wrapper)');
        res.status(200).json({
            success: true,
            webhook: messageFormat,
            processadas: mensagensAdaptadas.length,
            resultados: resultados
        });

    } catch (error) {
        console.error('❌ [WEBHOOK] Erro fatal:', error);
        res.status(500).json({
            success: false,
            webhook: process.env.MESSAGE_FORMAT,
            error: 'Erro ao processar webhook'
        });
    }
}

/**
 * FLUXO PADRAO WHATSAPP
 * Processa uma única mensagem do webhook (já adaptada pelo messageFormatAdapter)
 * @param {Object} mensagemAdaptada - Dados da mensagem no formato padrão adaptado
 * @returns {Promise<Object>} Resultado do processamento

async function processarMensagemWebhook(mensagemAdaptada) {
    try {
        // Extrair dados da mensagem adaptada
        const { telefone, messageText, messageId, fromMe, originalData } = mensagemAdaptada;

        if (!telefone || !messageText) {
            console.log('⚠️ [WEBHOOK] Mensagem sem telefone ou texto');
            return { success: false, webhook: process.env.MESSAGE_FORMAT, error: 'Dados incompletos' };
        }

        console.log('📱 [WEBHOOK] Telefone:', telefone);
        console.log('💬 [WEBHOOK] Texto:', messageText);
        console.log('🆔 [WEBHOOK] MessageId:', messageId);
        console.log('👤 [WEBHOOK] FromMe:', fromMe);

        // Validações iniciais
        const validacao = validarMensagemWebhook(telefone, messageText, fromMe);
        if (!validacao.valida) {
            console.log(`⚠️ [WEBHOOK] ${validacao.motivo}`);
            return { success: true, webhook: process.env.MESSAGE_FORMAT, data: validacao.motivo };
        }

        const telefoneNormalizado = validacao.telefone;

        // Decidir qual fluxo usar
        if (WEBHOOK_CONFIG.USAR_NOVO_FLUXO && WEBHOOK_CONFIG.VALIDAR_COM_API) {
            // Novo fluxo com endpoint API
            return await processarComNovoFluxo(telefoneNormalizado, messageText, messageId);
        } else {
            // Fluxo antigo com database (usar dados originais se disponível)
            return await processarComFluxoAntigo(originalData || mensagemAdaptada);
        }

    } catch (error) {
        console.error('❌ [WEBHOOK] Erro ao processar mensagem:', error);
        return { success: false, webhook: process.env.MESSAGE_FORMAT, error: error.message };
    }
}
 */

/**
 * FLUXO PADRAO WHATSAPP > MEGAZAP
 * Processa uma única mensagem do webhook (já adaptada pelo messageFormatAdapter)
 * @param {Object} mensagemAdaptada - Dados da mensagem no formato padrão adaptado
 * @returns {Promise<Object>} Resultado do processamento
*/

async function processarMensagemWebhook(mensagemAdaptada) {
    const { telefone, messageText, messageId, megazap } = mensagemAdaptada;
    
    // Verificar formato
    const messageFormat = process.env.MESSAGE_FORMAT || '1';
    
    if (messageFormat === '2' && megazap) {
        // Usar fluxo Megazap unificado
        return await atendimentoMegaZap.fluxoAtendimentoMegazap(
            telefone, messageText, messageId, megazap
        );
    } else {
        // Usar fluxo Evolution (padrão)
        return await atendimentoService.fluxoAtendimento(
            telefone, messageText, messageId
        );
    }
}


/**
 * Valida mensagem do webhook
 * @param {string} telefone - Telefone (já pode estar limpo ou com sufixos)
 * @param {string} messageText - Texto da mensagem
 * @param {boolean} fromMe - Se é do bot
 * @returns {Object} Resultado da validação
 */
function validarMensagemWebhook(telefone, messageText, fromMe) {
    // Ignorar mensagens do próprio bot
    if (fromMe) {
        return { valida: false, motivo: 'Mensagem do próprio bot' };
    }

    // Limpar telefone de possíveis sufixos do WhatsApp
    const telefoneLimpo = telefone.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('status@broadcast', '');

    // Ignorar mensagens de grupos
    if (telefone.includes('@g.us')) {
        return { valida: false, motivo: 'Mensagem de grupo' };
    }

    // Ignorar status do WhatsApp
    if (telefone.includes('status@broadcast')) {
        return { valida: false, motivo: 'Status do WhatsApp' };
    }

    // Ignorar mensagens vazias
    if (!messageText || !messageText.trim()) {
        return { valida: false, motivo: 'Mensagem vazia' };
    }

    // Validar formato do telefone
    if (!validacaoService.validarFormatoTelefone(telefoneLimpo)) {
        return { valida: false, motivo: 'Formato de telefone inválido' };
    }

    return {
        valida: true,
        telefone: validacaoService.normalizarTelefoneWhatsApp(telefoneLimpo),
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
                webhook: process.env.MESSAGE_FORMAT,
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
                webhook: process.env.MESSAGE_FORMAT,
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
            webhook: process.env.MESSAGE_FORMAT,
            status: resultado.status,
            data: resultado
        };
        
    } catch (error) {
        console.error('❌ [WEBHOOK] Erro no novo fluxo:', error);
        
        // Enviar mensagem de erro ao cliente
        await enviarMensagemErro(telefone);
        
        return { 
            success: false, 
            webhook: process.env.MESSAGE_FORMAT,
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
            webhook: process.env.MESSAGE_FORMAT,
            status: 'processado_antigo',
            data: resultado.data
        };
        
    } catch (error) {
        console.error('❌ [WEBHOOK] Erro no fluxo antigo:', error);
        return { 
            success: false, 
            webhook: process.env.MESSAGE_FORMAT,
            error: error.message 
        };
    }
}

/**
 * Envia mensagem de timeout
 * @param {string} telefone - Número do telefone
 */
async function enviarMensagemTimeout(telefone) {
    const getMessageFormat = process.env.MESSAGE_FORMAT;
    if(getMessageFormat==1){
        const evolutionAPI = require('../config/evolution');
        await evolutionAPI.sendTextMessage(
            telefone,
            MENSAGENS.ENCERRAMENTO.TIMEOUT()
        );
    }
}

/**
 * Envia mensagem de bloqueio
 * @param {string} telefone - Número do telefone
 * @param {string} mensagemPersonalizada - Mensagem personalizada
 */
async function enviarMensagemBloqueio(telefone, mensagemPersonalizada) {
    const getMessageFormat = process.env.MESSAGE_FORMAT;
    if(getMessageFormat==1){
        const evolutionAPI = require('../config/evolution');
        await evolutionAPI.sendTextMessage(
            telefone,
            mensagemPersonalizada || MENSAGENS.BLOQUEIO.CLIENTE_BLOQUEADO()
        );
    }
}

/**
 * Envia mensagem de sem permissão
 * @param {string} telefone - Número do telefone
 * @param {string} mensagemPersonalizada - Mensagem personalizada
 */
async function enviarMensagemSemPermissao(telefone, mensagemPersonalizada) {
    const getMessageFormat = process.env.MESSAGE_FORMAT;
    if(getMessageFormat==1){
        const evolutionAPI = require('../config/evolution');
        await evolutionAPI.sendTextMessage(
            telefone,
            mensagemPersonalizada || MENSAGENS.PERMISSAO.SEM_PERMISSAO()
        );
    }
}

/**
 * Envia mensagem de erro genérico
 * @param {string} telefone - Número do telefone
 */
async function enviarMensagemErro(telefone) {
    const getMessageFormat = process.env.MESSAGE_FORMAT;
    if(getMessageFormat==1){
        const evolutionAPI = require('../config/evolution');
        await evolutionAPI.sendTextMessage(
            telefone,
            '❌ Desculpe, ocorreu um erro temporário.\n\n' +
            'Por favor, tente novamente em alguns instantes.'
        );
    }
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
                webhook: process.env.MESSAGE_FORMAT,
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