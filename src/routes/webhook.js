const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

/**
 * Configurações das rotas
 */
const ROUTES_CONFIG = {
    REQUIRE_AUTH: process.env.WEBHOOK_REQUIRE_AUTH === 'true' || false,
    LOG_REQUESTS: process.env.WEBHOOK_LOG_REQUESTS !== 'false' // true por padrão
};

/**
 * Middleware: Log de requisições (opcional)
 */
if (ROUTES_CONFIG.LOG_REQUESTS) {
    router.use(webhookController.logRequest);
}

/**
 * Middleware: Validação de token (opcional)
 * Ativa apenas se WEBHOOK_REQUIRE_AUTH=true no .env
 */
if (ROUTES_CONFIG.REQUIRE_AUTH) {
    router.use(webhookController.validarToken);
}

/**
 * @route POST /webhook/message
 * @desc Endpoint principal para receber mensagens do webhook Evolution API
 * @access Public (ou Private se WEBHOOK_REQUIRE_AUTH=true)
 * 
 * Body esperado:
 * {
 *   "data": {
 *     "key": {
 *       "remoteJid": "5531999999999@s.whatsapp.net",
 *       "fromMe": false,
 *       "id": "MESSAGE_ID"
 *     },
 *     "message": {
 *       "conversation": "Texto da mensagem"
 *     }
 *   }
 * }
 */
router.post('/message', webhookController.receberMensagem);

/**
 * @route GET /webhook/status
 * @desc Retorna status atual do webhook e estatísticas
 * @access Public
 * 
 * Resposta:
 * {
 *   "status": "online",
 *   "versao": "2.0.0",
 *   "fluxo": "novo (endpoint)" | "antigo (database)",
 *   "mensagensProcessadas": 123,
 *   "uptime": "2h 30m",
 *   "configuracoes": { ... }
 * }
 */
router.get('/status', webhookController.verificarStatus);

/**
 * @route GET /webhook/health
 * @desc Health check - verifica status de todos os serviços
 * @access Public
 * 
 * Resposta:
 * {
 *   "status": "healthy" | "degraded" | "error",
 *   "checks": {
 *     "database": "ok" | "erro",
 *     "apiExterna": "ok" | "erro",
 *     "evolutionAPI": "ok" | "erro"
 *   },
 *   "timestamp": "2025-01-10T12:00:00.000Z"
 * }
 */
router.get('/health', webhookController.healthCheck);

/**
 * @route GET /webhook
 * @desc Informações sobre o webhook
 * @access Public
 */
router.get('/', (req, res) => {
    res.json({
        name: 'WhatsApp Bot Webhook',
        version: '2.0.0',
        description: 'Webhook para receber mensagens da Evolution API',
        endpoints: {
            message: 'POST /webhook/message - Receber mensagens',
            status: 'GET /webhook/status - Status do sistema',
            health: 'GET /webhook/health - Health check',
            info: 'GET /webhook - Esta página'
        },
        documentation: process.env.DOCS_URL || 'Consulte o README.md',
        support: process.env.SUPPORT_EMAIL || 'suporte@empresa.com'
    });
});

/**
 * Middleware de erro - captura erros não tratados nas rotas
 */
router.use((error, req, res, next) => {
    console.error('❌ [ROUTES] Erro não tratado:', error);
    
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

/**
 * Rota 404 - endpoint não encontrado
 */
router.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint não encontrado',
        path: req.path,
        method: req.method,
        availableEndpoints: [
            'POST /webhook/message',
            'GET /webhook/status',
            'GET /webhook/health',
            'GET /webhook'
        ]
    });
});

module.exports = router;