const database = require('../config/database');
const logger = require('../utils/logger');
const WhatsAppMessageService = require('../services/whatsappMessageService');
const EmailMessageService = require('../services/emailMessageService');

/**
 * Controller para gerenciar envio de mensagens para clientes autorizados
 * Micro-serviço independente para comunicação com clientes via WhatsApp e Email
 */
class WebhookMessagesController {

    /**
     * Envia mensagem para cliente autorizado
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async enviarMensagem(req, res) {
        try {
            const { cnpj, mensagem } = req.body;
            
            // Log da requisição (apenas em desenvolvimento)
            if (process.env.NODE_ENV === 'development') {
                console.log('📨 Solicitação de envio recebida:', JSON.stringify({
                    cnpj: cnpj,
                    tipoMensagem: mensagem?.texto ? 'texto' : 'imagem'
                }, null, 2));
            }

            // Validação básica da estrutura da requisição
            const validacaoRequisicao = WebhookMessagesController.validarRequisicao(req.body);
            if (!validacaoRequisicao.valida) {
                console.log(`⚠️ Requisição inválida: ${validacaoRequisicao.motivo}`);
                return res.status(400).json({
                    success: false,
                    error: validacaoRequisicao.motivo,
                    timestamp: new Date().toISOString()
                });
            }

            // Validação do cliente autorizado
            const clienteValido = await WebhookMessagesController.validarClienteAutorizado(cnpj);
            if (!clienteValido.autorizado) {
                console.log(`⚠️ Cliente não autorizado: ${clienteValido.motivo}`);
                return res.status(403).json({
                    success: false,
                    error: clienteValido.motivo,
                    timestamp: new Date().toISOString()
                });
            }

            const clienteData = clienteValido.dados;
            console.log(`📱 Processando envio para cliente: ${clienteData.email}`);

            // Preparação dos dados de envio
            const dadosEnvio = {
                cnpj: cnpj,
                email: clienteData.email,
                celular: clienteData.celular,
                mensagem: mensagem,
                timestamp: new Date().toISOString()
            };

            // Registra tentativa de envio no log
            console.log(`📤 Iniciando envio para: ${clienteData.celular} / ${clienteData.email}`);

            // Resultado consolidado do envio
            const resultadoEnvio = {
                cnpj: cnpj,
                cliente: {
                    email: clienteData.email,
                    celular: clienteData.celular
                },
                whatsapp: { status: 'pendente' },
                email: { status: 'pendente' },
                timestamp: dadosEnvio.timestamp
            };

            // Envio via WhatsApp
            try {
                console.log(`📱 Enviando via WhatsApp...`);
                const resultadoWhatsApp = await WhatsAppMessageService.enviarMensagem(dadosEnvio);
                resultadoEnvio.whatsapp = resultadoWhatsApp;
                
                if (resultadoWhatsApp.success) {
                    console.log(`✅ WhatsApp enviado com sucesso`);
                } else {
                    console.error(`❌ Falha no WhatsApp: ${resultadoWhatsApp.error}`);
                }
            } catch (errorWhatsApp) {
                console.error(`❌ Erro no serviço WhatsApp: ${errorWhatsApp.message}`);
                resultadoEnvio.whatsapp = {
                    success: false,
                    status: 'erro',
                    error: errorWhatsApp.message,
                    timestamp: new Date().toISOString()
                };
            }

            // Envio via Email
            try {
                console.log(`📧 Enviando via Email...`);
                const resultadoEmail = await EmailMessageService.enviarMensagem(dadosEnvio);
                resultadoEnvio.email = resultadoEmail;
                
                if (resultadoEmail.success) {
                    console.log(`✅ Email enviado com sucesso`);
                } else {
                    console.error(`❌ Falha no Email: ${resultadoEmail.error}`);
                }
            } catch (errorEmail) {
                console.error(`❌ Erro no serviço Email: ${errorEmail.message}`);
                resultadoEnvio.email = {
                    success: false,
                    status: 'erro',
                    error: errorEmail.message,
                    timestamp: new Date().toISOString()
                };
            }

            // Log do resultado consolidado
            const sucessoWhatsApp = resultadoEnvio.whatsapp.success;
            const sucessoEmail = resultadoEnvio.email.success;
            
            if (sucessoWhatsApp && sucessoEmail) {
                console.log(`✅ Envio completo realizado com sucesso para: ${cnpj}`);
            } else if (sucessoWhatsApp || sucessoEmail) {
                console.log(`⚠️ Envio parcial para: ${cnpj} - WhatsApp: ${sucessoWhatsApp ? 'OK' : 'FALHA'}, Email: ${sucessoEmail ? 'OK' : 'FALHA'}`);
            } else {
                console.error(`❌ Falha completa no envio para: ${cnpj}`);
            }

            // Resposta de sucesso
            return res.status(200).json({
                success: true,
                message: 'Mensagem processada com sucesso',
                data: resultadoEnvio,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Erro no controller de mensagens:', error);
            
            // Log detalhado em desenvolvimento
            if (process.env.NODE_ENV === 'development') {
                console.error('Stack trace:', error.stack);
            }

            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Valida estrutura da requisição de envio
     * @param {Object} body - Corpo da requisição
     * @returns {Object} Resultado da validação
     */
    static validarRequisicao(body) {
        try {
            // Verifica presença dos campos obrigatórios
            if (!body || !body.cnpj || !body.mensagem) {
                return {
                    valida: false,
                    motivo: 'Campos obrigatórios: cnpj e mensagem'
                };
            }

            const { cnpj, mensagem } = body;

            // Validação do CNPJ (formato básico)
            const cnpjLimpo = cnpj.replace(/\D/g, '');
            if (cnpjLimpo.length !== 14) {
                return {
                    valida: false,
                    motivo: 'CNPJ deve conter 14 dígitos'
                };
            }

            // Validação da mensagem
            if (!mensagem.texto && !mensagem.imagem) {
                return {
                    valida: false,
                    motivo: 'Mensagem deve conter texto ou imagem'
                };
            }

            // Validação específica do texto
            if (mensagem.texto && (!mensagem.texto.trim() || mensagem.texto.length > 4096)) {
                return {
                    valida: false,
                    motivo: 'Texto da mensagem deve ter entre 1 e 4096 caracteres'
                };
            }

            // Validação específica da imagem
            if (mensagem.imagem) {
                if (!mensagem.imagem.url && !mensagem.imagem.base64) {
                    return {
                        valida: false,
                        motivo: 'Imagem deve conter URL ou dados base64'
                    };
                }

                // Validação da URL se fornecida
                if (mensagem.imagem.url) {
                    try {
                        new URL(mensagem.imagem.url);
                    } catch {
                        return {
                            valida: false,
                            motivo: 'URL da imagem inválida'
                        };
                    }
                }
            }

            return {
                valida: true,
                motivo: 'Requisição válida'
            };

        } catch (error) {
            console.error('Erro na validação da requisição:', error);
            return {
                valida: false,
                motivo: 'Erro na validação dos dados'
            };
        }
    }

    /**
     * Valida se cliente está autorizado a receber mensagens
     * @param {string} cnpj - CNPJ do cliente
     * @returns {Promise<Object>} Resultado da validação
     */
    static async validarClienteAutorizado(cnpj) {
        try {
            // Formatação do CNPJ para consulta
            const cnpjFormatado = WebhookMessagesController.formatarCNPJ(cnpj);
            
            // Consulta na view whapi_empresas
            const query = `
                SELECT email, celular 
                FROM whapi_empresas 
                WHERE cnpj = ? AND status = 1
                LIMIT 1
            `;
            
            const resultado = await database.executeQuery(query, [cnpjFormatado]);

            if (!resultado.success) {
                console.error('Erro na consulta do cliente:', resultado.error);
                return {
                    autorizado: false,
                    motivo: 'Erro ao verificar autorização do cliente',
                    dados: null
                };
            }

            if (!resultado.data || resultado.data.length === 0) {
                return {
                    autorizado: false,
                    motivo: 'Cliente não encontrado ou não autorizado',
                    dados: null
                };
            }

            const clienteData = resultado.data[0];

            // Validação dos dados do cliente
            if (!clienteData.email || !clienteData.celular) {
                return {
                    autorizado: false,
                    motivo: 'Cliente não possui email ou celular cadastrado',
                    dados: null
                };
            }

            // Validação do formato do email
            const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteData.email);
            if (!emailValido) {
                return {
                    autorizado: false,
                    motivo: 'Email do cliente em formato inválido',
                    dados: null
                };
            }

            // Validação do formato do celular
            const celularLimpo = clienteData.celular.replace(/\D/g, '');
            if (celularLimpo.length < 10 || celularLimpo.length > 13) {
                return {
                    autorizado: false,
                    motivo: 'Celular do cliente em formato inválido',
                    dados: null
                };
            }

            return {
                autorizado: true,
                motivo: 'Cliente autorizado',
                dados: {
                    email: clienteData.email,
                    celular: clienteData.celular
                }
            };

        } catch (error) {
            console.error('Erro na validação do cliente:', error);
            return {
                autorizado: false,
                motivo: 'Erro interno na validação do cliente',
                dados: null
            };
        }
    }

    /**
     * Formata CNPJ para padrão XX.XXX.XXX/XXXX-XX
     * @param {string} cnpj - CNPJ apenas números
     * @returns {string} CNPJ formatado
     */
    static formatarCNPJ(cnpj) {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        return cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }

    /**
     * Endpoint para verificar status do serviço
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async verificarStatus(req, res) {
        try {
            // Verificar disponibilidade dos serviços
            const whatsappDisponivel = await WhatsAppMessageService.verificarDisponibilidade();
            const emailDisponivel = await EmailMessageService.verificarDisponibilidade();
            
            const statusGeral = whatsappDisponivel && emailDisponivel ? 'healthy' : 'partial';
            const statusCode = statusGeral === 'healthy' ? 200 : 503;

            return res.status(statusCode).json({
                success: statusGeral === 'healthy',
                message: 'Serviço de mensagens ativo',
                service: 'webhook-messages',
                status: statusGeral,
                services: {
                    whatsapp: {
                        available: whatsappDisponivel,
                        statistics: WhatsAppMessageService.obterEstatisticas()
                    },
                    email: {
                        available: emailDisponivel,
                        statistics: EmailMessageService.obterEstatisticas()
                    }
                },
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                version: require('../../package.json').version
            });
        } catch (error) {
            console.error('Erro ao verificar status do serviço:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    }

    /**
     * Middleware para validar token de segurança (reaproveitando lógica existente)
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
                console.log('⚠️ Tentativa de acesso com token inválido no serviço de mensagens');
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
     * Middleware para log de requisições específico do serviço
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next function
     */
    static logRequest(req, res, next) {
        const timestamp = new Date().toISOString();
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || 'Unknown';
        
        console.log(`📊 [${timestamp}] MESSAGES-SERVICE ${req.method} ${req.path} - IP: ${ip}`);
        
        // Log detalhado apenas em desenvolvimento
        if (process.env.NODE_ENV === 'development') {
            console.log(`📊 User-Agent:`, userAgent);
            if (req.body && Object.keys(req.body).length > 0) {
                // Log sanitizado do body
                const sanitizedBody = {
                    cnpj: req.body.cnpj ? req.body.cnpj.substring(0, 2) + '***' : undefined,
                    mensagem: req.body.mensagem ? {
                        tipo: req.body.mensagem.texto ? 'texto' : 'imagem',
                        tamanho: req.body.mensagem.texto?.length || 'N/A'
                    } : undefined
                };
                console.log(`📊 Body (sanitizado):`, sanitizedBody);
            }
        }

        return next();
    }
}

module.exports = WebhookMessagesController;