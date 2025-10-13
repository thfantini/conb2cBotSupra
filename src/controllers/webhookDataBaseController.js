const whatsappService = require('../services/whatsappService');

/**
 * Controller para gerenciar webhooks da API Evolution
 */
class WebhookController {

    /**
     * Recebe e processa mensagens do webhook
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async receberMensagem(req, res) {
        try {
            const webhookData = req.body;
            
            // Log do webhook recebido (apenas em desenvolvimento)
            // if (process.env.NODE_ENV === 'development') {}
            console.log('receberMensagem > Webhook recebido:', JSON.stringify(webhookData, null, 2));
            

            // Valida estrutura básica do webhook
            if (!webhookData || !webhookData.data) {
                console.log('⚠️ Webhook inválido: estrutura incorreta');
                return res.status(400).json({
                    success: false,
                    error: 'Estrutura de webhook inválida'
                });
            }

            // Verifica se é evento de mensagem
            if (webhookData.event !== 'messages.upsert') {
                console.log(`Evento ignorado: ${webhookData.event}`);
                return res.status(200).json({
                    success: true,
                    message: 'Evento não processado'
                });
            }

            // Normaliza dados para array (Evolution API pode enviar objeto único ou array)
            let mensagens = webhookData.data;
            console.log('receberMensagem > mensagens:', mensagens);
            
            // Se não for array, converte para array com um elemento
            if (!Array.isArray(mensagens)) {
                mensagens = [mensagens];
                console.log('Convertendo objeto único para array de mensagens');
            }
            
            const resultados = [];
            console.log(`receberMensagem > Total de mensagens a processar: ${mensagens.length}`);

            for (const mensagem of mensagens) {
                try {
                    // Valida mensagem individual
                    const validacao = WebhookController.validarMensagem(mensagem);
                    
                    if (!validacao.valida) {
                        console.log(`⚠️ Mensagem ignorada: ${validacao.motivo}`);
                        resultados.push({
                            messageId: mensagem.key?.id || 'unknown',
                            status: 'ignorada',
                            motivo: validacao.motivo
                        });
                        continue;
                    }

                    // Processa mensagem válida
                    console.log(`Processando mensagem de: ${mensagem.key.remoteJid}`);
                    const resultado = await whatsappService.processarMensagem(mensagem);
                    
                    resultados.push({
                        messageId: mensagem.key.id,
                        status: resultado.success ? 'processada' : 'erro',
                        dados: resultado.data || resultado.error
                    });

                    console.log(`✅ Mensagem processada: ${mensagem.key.id}`);

                } catch (error) {
                    console.error(`❌ Erro ao processar mensagem individual:`, error);
                    resultados.push({
                        messageId: mensagem.key?.id || 'unknown',
                        status: 'erro',
                        erro: error.message
                    });
                }
            }

            // Resposta de sucesso
            return res.status(200).json({
                success: true,
                message: 'Webhook processado',
                processadas: resultados.filter(r => r.status === 'processada').length,
                ignoradas: resultados.filter(r => r.status === 'ignorada').length,
                erros: resultados.filter(r => r.status === 'erro').length,
                resultados: resultados
            });

        } catch (error) {
            console.error('❌ Erro no controller de webhook:', error);
            
            // Log detalhado em desenvolvimento
            if (process.env.NODE_ENV === 'development') {
                console.error('Stack trace:', error.stack);
            }

            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Valida se a mensagem deve ser processada
     * @param {Object} mensagem - Dados da mensagem
     * @returns {Object} Resultado da validação
     */
    static validarMensagem(mensagem) {
        try {
            // Verifica estrutura básica
            if (!mensagem || !mensagem.key || !mensagem.message) {
                return {
                    valida: false,
                    motivo: 'Estrutura de mensagem inválida'
                };
            }

            const { key, message, messageTimestamp } = mensagem;

            // Ignora mensagens do próprio bot
            if (key.fromMe) {
                return {
                    valida: false,
                    motivo: 'Mensagem enviada pelo bot'
                };
            }

            // Ignora mensagens de grupos
            if (key.remoteJid.includes('@g.us')) {
                return {
                    valida: false,
                    motivo: 'Mensagem de grupo'
                };
            }

            // Ignora status do WhatsApp
            if (key.remoteJid === 'status@broadcast') {
                return {
                    valida: false,
                    motivo: 'Status do WhatsApp'
                };
            }

            // Verifica se há conteúdo de texto
            const textoMensagem = message.conversation || 
                                 message.extendedTextMessage?.text || 
                                 message.buttonsResponseMessage?.selectedDisplayText ||
                                 message.listResponseMessage?.singleSelectReply?.selectedRowId;

            if (!textoMensagem || !textoMensagem.trim()) {
                return {
                    valida: false,
                    motivo: 'Mensagem sem texto válido'
                };
            }

            // Ignora mensagens muito antigas (mais de 5 minutos)
            if (messageTimestamp) {
                const agora = Math.floor(Date.now() / 1000);
                const idade = agora - messageTimestamp;
                
                if (idade > 300) { // 5 minutos
                    return {
                        valida: false,
                        motivo: 'Mensagem muito antiga'
                    };
                }
            }

            return {
                valida: true,
                motivo: 'Mensagem válida'
            };

        } catch (error) {
            console.error('Erro na validação da mensagem:', error);
            return {
                valida: false,
                motivo: 'Erro na validação'
            };
        }
    }

    /**
     * Verifica status do webhook
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async verificarStatus(req, res) {
        try {
            return res.status(200).json({
                success: true,
                message: 'Webhook ativo e funcionando',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: process.env.NODE_ENV || 'development'
            });

        } catch (error) {
            console.error('Erro ao verificar status:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    }

    /**
     * Valida configuração do webhook
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async validarConfiguracao(req, res) {
        try {
            const { token } = req.query;
            
            // Verifica token de segurança se configurado
            if (process.env.WEBHOOK_TOKEN && token !== process.env.WEBHOOK_TOKEN) {
                return res.status(401).json({
                    success: false,
                    error: 'Token inválido'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Webhook configurado corretamente',
                endpoints: {
                    mensagens: '/webhook/mensagem',
                    status: '/webhook/status',
                    validacao: '/webhook/validar'
                }
            });

        } catch (error) {
            console.error('Erro na validação de configuração:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    }

    /**
     * Middleware para validar token de segurança
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next function
     */
    static validarToken(req, res, next) {
        try {
            // Se não há token configurado, pula validação
            if (!process.env.WEBHOOK_TOKEN) {
                return next();
            }

            const token = req.headers['x-webhook-token'] || 
                         req.query.token || 
                         req.body.token;

            if (!token || token !== process.env.WEBHOOK_TOKEN) {
                console.log('⚠️ Tentativa de acesso com token inválido');
                return res.status(401).json({
                    success: false,
                    error: 'Token de segurança inválido'
                });
            }

            return next();

        } catch (error) {
            console.error('Erro na validação do token:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    }

    /**
     * Middleware para log de requisições
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next function
     */
    static logRequest(req, res, next) {
        const timestamp = new Date().toISOString();
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || 'Unknown';
        
        console.log(`📊 [${timestamp}] ${req.method} ${req.path} - IP: ${ip}`);
        
        // Log detalhado apenas em desenvolvimento
        if (process.env.NODE_ENV === 'development') {
            console.log(`📊 Headers:`, req.headers);
            console.log(`📊 User-Agent:`, userAgent);
        }

        return next();
    }

    /**
     * Endpoint de teste para verificar conectividade
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async testarConectividade(req, res) {
        try {
            const testData = {
                webhook: 'funcionando',
                timestamp: new Date().toISOString(),
                servidor: {
                    nodejs: process.version,
                    memoria: process.memoryUsage(),
                    uptime: process.uptime()
                },
                ambiente: process.env.NODE_ENV || 'development'
            };

            return res.status(200).json({
                success: true,
                message: 'Conectividade OK',
                data: testData
            });

        } catch (error) {
            console.error('Erro no teste de conectividade:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    }
}

module.exports = WebhookController;