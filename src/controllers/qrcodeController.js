const QRCodeService = require('../services/qrcodeService');

/**
 * Controller para gerenciar QR Code e conexão WhatsApp
 */
class QRCodeController {

    /**
     * Obtém QR Code para conexão
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async obterQRCode(req, res) {
        try {
            console.log('📱 Solicitação de QR Code recebida');

            const resultado = await QRCodeService.obterQRCode();

            if (resultado.success) {
                return res.status(200).json({
                    success: true,
                    message: 'QR Code obtido com sucesso',
                    data: resultado.data,
                    timestamp: new Date().toISOString()
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: resultado.error,
                    message: 'Falha ao obter QR Code',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Erro no controller de QR Code:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Verifica status da conexão WhatsApp
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async verificarStatus(req, res) {
        try {
            console.log('🔍 Verificação de status solicitada');

            const resultado = await QRCodeService.verificarStatusConexao();

            if (resultado.success) {
                const statusCode = resultado.data.connected ? 200 : 202;
                
                return res.status(statusCode).json({
                    success: true,
                    message: resultado.data.connected ? 
                        'WhatsApp conectado' : 
                        'WhatsApp não conectado',
                    data: resultado.data,
                    timestamp: new Date().toISOString()
                });
            } else {
                return res.status(503).json({
                    success: false,
                    error: resultado.error,
                    message: 'Erro ao verificar status',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Erro na verificação de status:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Reinicia instância WhatsApp
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async reiniciarInstancia(req, res) {
        try {
            console.log('🔄 Solicitação de reinício de instância');

            const resultado = await QRCodeService.reiniciarInstancia();

            if (resultado.success) {
                return res.status(200).json({
                    success: true,
                    message: 'Instância reiniciada com sucesso',
                    data: resultado.data,
                    timestamp: new Date().toISOString()
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: resultado.error,
                    message: 'Falha ao reiniciar instância',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Erro ao reiniciar instância:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Desconecta instância WhatsApp
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async desconectar(req, res) {
        try {
            console.log('🔌 Solicitação de desconexão');

            const resultado = await QRCodeService.desconectarInstancia();

            if (resultado.success) {
                return res.status(200).json({
                    success: true,
                    message: 'Instância desconectada com sucesso',
                    data: resultado.data,
                    timestamp: new Date().toISOString()
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: resultado.error,
                    message: 'Falha ao desconectar instância',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Erro ao desconectar:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtém informações detalhadas da instância
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async obterInformacoes(req, res) {
        try {
            console.log('📋 Solicitação de informações da instância');

            const resultado = await QRCodeService.obterInformacoesInstancia();

            if (resultado.success) {
                return res.status(200).json({
                    success: true,
                    message: 'Informações obtidas com sucesso',
                    data: resultado.data,
                    timestamp: new Date().toISOString()
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: resultado.error,
                    message: 'Falha ao obter informações',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Erro ao obter informações:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Monitora conexão até estabelecer
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async monitorarConexao(req, res) {
        try {
            console.log('🕐 Iniciando monitoramento de conexão');

            const { maxTentativas = 30, intervalo = 2000 } = req.query;

            const resultado = await QRCodeService.monitorarConexao(
                parseInt(maxTentativas), 
                parseInt(intervalo)
            );

            if (resultado.success) {
                return res.status(200).json({
                    success: true,
                    message: 'Conexão estabelecida com sucesso',
                    data: resultado.data,
                    timestamp: new Date().toISOString()
                });
            } else {
                return res.status(408).json({
                    success: false,
                    error: resultado.error,
                    message: 'Timeout na conexão',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Erro no monitoramento:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Processo completo de conexão (reinicia + obtém QR)
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async iniciarConexao(req, res) {
        try {
            console.log('🚀 Iniciando processo completo de conexão');

            const resultado = await QRCodeService.iniciarProcessoConexao();

            if (resultado.success) {
                const statusCode = resultado.data.alreadyConnected ? 200 : 201;
                const message = resultado.data.alreadyConnected ? 
                    'WhatsApp já conectado' : 
                    'Processo de conexão iniciado - Escaneie o QR Code';

                return res.status(statusCode).json({
                    success: true,
                    message: message,
                    data: resultado.data,
                    timestamp: new Date().toISOString()
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: resultado.error,
                    message: 'Falha no processo de conexão',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Erro no processo de conexão:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Endpoint de teste para verificar disponibilidade
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    static async testarDisponibilidade(req, res) {
        try {
            const testData = {
                controller: 'QRCode funcionando',
                timestamp: new Date().toISOString(),
                instancia: process.env.EVOLUTION_INSTANCE_NAME,
                evolutionApi: process.env.EVOLUTION_API_URL,
                ambiente: process.env.NODE_ENV || 'development'
            };

            return res.status(200).json({
                success: true,
                message: 'Controller QRCode disponível',
                data: testData,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Erro no teste de disponibilidade:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Middleware para log de requisições específicas do QR Code
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next function
     */
    static logRequest(req, res, next) {
        const timestamp = new Date().toISOString();
        const ip = req.ip || req.connection.remoteAddress;
        
        console.log(`📊 [${timestamp}] QRCode: ${req.method} ${req.path} - IP: ${ip}`);
        
        // Log detalhado apenas em desenvolvimento
        if (process.env.NODE_ENV === 'development') {
            console.log(`📊 QRCode Query Params:`, req.query);
        }

        return next();
    }

    /**
     * Middleware para validação de token específico do QR Code
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next function
     */
    static validarTokenQR(req, res, next) {
        try {
            // Se não há token configurado, pula validação
            if (!process.env.WEBHOOK_TOKEN) {
                return next();
            }

            const token = req.headers['x-qr-token'] || 
                         req.query.token || 
                         req.body.token;

            if (!token || token !== process.env.WEBHOOK_TOKEN) {
                console.log('⚠️ Tentativa de acesso QR Code com token inválido');
                return res.status(401).json({
                    success: false,
                    error: 'Token de segurança inválido para QR Code',
                    timestamp: new Date().toISOString()
                });
            }

            return next();

        } catch (error) {
            console.error('❌ Erro na validação do token QR:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = QRCodeController;