const express = require('express');
const WebhookMessagesController = require('../controllers/webhookMessagesController');

const router = express.Router();

/**
 * Middleware aplicado a todas as rotas do webhook-message
 */
router.use(WebhookMessagesController.logRequest);

/**
 * POST /webhook-message/enviar
 * Endpoint principal para enviar mensagens para clientes autorizados
 * Aplica validação de token antes do processamento
 */
router.post('/enviar', 
    WebhookMessagesController.validarToken,
    WebhookMessagesController.enviarMensagem
);

/**
 * GET /webhook-message/status
 * Verifica se o serviço de mensagens está ativo e funcionando
 * Não requer autenticação para facilitar monitoramento
 */
router.get('/status', WebhookMessagesController.verificarStatus);

/**
 * GET /webhook-message/health
 * Health check simplificado para load balancers
 */
router.get('/health', (req, res) => {
    res.status(200).json({ 
        service: 'webhook-messages',
        status: 'ok', 
        timestamp: Date.now() 
    });
});

/**
 * POST /webhook-message/teste
 * Endpoint para teste de envio (apenas desenvolvimento)
 * Útil para validar configurações de WhatsApp e Email
 */
if (process.env.NODE_ENV === 'development') {
    router.post('/teste', (req, res) => {
        try {
            const { cnpj, mensagem } = req.body;
            
            if (!cnpj || !mensagem) {
                return res.status(400).json({
                    success: false,
                    error: 'cnpj e mensagem são obrigatórios',
                    exemplo: {
                        cnpj: "02.968.465/0001-66",
                        mensagem: {
                            texto: "Mensagem de teste"
                        }
                    }
                });
            }

            console.log('🧪 Teste de envio solicitado:', {
                cnpj: cnpj,
                tipoMensagem: mensagem.texto ? 'texto' : 'imagem'
            });

            // Processa como requisição normal
            return WebhookMessagesController.enviarMensagem(req, res);

        } catch (error) {
            console.error('Erro no teste de mensagem:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    });
}

/**
 * GET /webhook-message/documentacao
 * Endpoint com documentação da API (apenas desenvolvimento)
 */
if (process.env.NODE_ENV === 'development') {
    router.get('/documentacao', (req, res) => {
        const documentacao = {
            service: 'webhook-messages',
            version: require('../../package.json').version,
            description: 'Micro-serviço para envio de mensagens para clientes autorizados',
            endpoints: {
                'POST /webhook-message/enviar': {
                    description: 'Envia mensagem para cliente autorizado',
                    auth: 'Token requerido (x-webhook-token header)',
                    body: {
                        cnpj: 'string (14 dígitos)',
                        mensagem: {
                            texto: 'string (opcional, máx 4096 chars)',
                            imagem: {
                                url: 'string (opcional)',
                                base64: 'string (opcional)',
                                legenda: 'string (opcional)'
                            }
                        }
                    },
                    response: {
                        success: 'boolean',
                        message: 'string',
                        data: {
                            cnpj: 'string',
                            cliente: { email: 'string', celular: 'string' },
                            whatsapp: { status: 'string' },
                            email: { status: 'string' }
                        }
                    }
                },
                'GET /webhook-message/status': {
                    description: 'Verifica status do serviço',
                    auth: 'Não requerida',
                    response: {
                        success: 'boolean',
                        message: 'string',
                        service: 'string',
                        timestamp: 'string'
                    }
                },
                'POST /webhook-message/teste': {
                    description: 'Teste de envio (apenas desenvolvimento)',
                    note: 'Mesmo formato do endpoint /enviar'
                }
            },
            rules: {
                authorization: 'Somente CNPJs registrados na view whapi_empresas com status=1',
                validation: 'Cliente deve possuir email e celular válidos',
                delivery: {
                    whatsapp: 'Enviado via Evolution API para o celular cadastrado',
                    email: 'Cópia enviada via SMTP para o email cadastrado'
                },
                formats: {
                    message_types: ['texto', 'imagem', 'texto_com_imagem'],
                    image_formats: ['url', 'base64']
                }
            },
            configuration: {
                required_env: [
                    'WEBHOOK_TOKEN',
                    'EVOLUTION_API_URL',
                    'EVOLUTION_API_KEY', 
                    'EVOLUTION_INSTANCE_NAME',
                    'SMTP_HOST',
                    'SMTP_USER',
                    'SMTP_PASS'
                ],
                database: {
                    table: 'whapi_empresas',
                    fields: ['cnpj', 'email', 'celular', 'status']
                }
            }
        };
        
        res.json(documentacao);
    });
}

/**
 * GET /webhook-message/validar-configuracao
 * Endpoint para validar configurações do serviço
 */
router.get('/validar-configuracao', (req, res) => {
    try {
        const configuracoes = {
            webhook_token: !!process.env.WEBHOOK_TOKEN,
            evolution_api: !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
            smtp_config: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
            company_name: !!process.env.COMPANY_NAME,
            database: !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)
        };

        const todasConfiguradas = Object.values(configuracoes).every(config => config);
        const statusCode = todasConfiguradas ? 200 : 500;

        return res.status(statusCode).json({
            success: todasConfiguradas,
            message: todasConfiguradas ? 'Todas as configurações OK' : 'Configurações incompletas',
            configurations: configuracoes,
            missing: Object.entries(configuracoes)
                .filter(([key, value]) => !value)
                .map(([key]) => key),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Erro na validação de configuração:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * Middleware de tratamento de erros específico para rotas de webhook-message
 */
router.use((error, req, res, next) => {
    console.error('❌ Erro na rota webhook-message:', error);
    
    // Log detalhado em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
        console.error('Request body:', req.body);
        console.error('Request headers:', req.headers);
    }

    return res.status(500).json({
        success: false,
        service: 'webhook-messages',
        error: 'Erro interno no serviço de mensagens',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    });
});

/**
 * Middleware para rotas não encontradas no webhook-message
 */
router.use('*', (req, res) => {
    console.log(`⚠️ Rota webhook-message não encontrada: ${req.method} ${req.path}`);
    
    return res.status(404).json({
        success: false,
        service: 'webhook-messages',
        error: 'Endpoint de webhook-message não encontrado',
        available_endpoints: [
            'POST /webhook-message/enviar',
            'GET /webhook-message/status',
            'GET /webhook-message/health',
            'GET /webhook-message/validar-configuracao'
        ].concat(
            process.env.NODE_ENV === 'development' ? [
                'POST /webhook-message/teste',
                'GET /webhook-message/documentacao'
            ] : []
        ),
        requested: `${req.method} ${req.path}`
    });
});

module.exports = router;