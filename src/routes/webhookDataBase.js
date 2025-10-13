const express = require('express');
const WebhookController = require('../controllers/webhookController');

const router = express.Router();

/**
 * Middleware aplicado a todas as rotas do webhook
 */
router.use(WebhookController.logRequest);

/**
 * POST /webhook/mensagem
 * Endpoint principal para receber mensagens da API Evolution
 * Aplica validação de token antes do processamento
 */
router.post('/mensagem', 
    WebhookController.validarToken,
    WebhookController.receberMensagem
);

/**
 * GET /webhook/status
 * Verifica se o webhook está ativo e funcionando
 * Não requer autenticação para facilitar monitoramento
 */
router.get('/status', WebhookController.verificarStatus);

/**
 * GET /webhook/validar
 * Valida configuração do webhook
 * Requer token de segurança se configurado
 */
router.get('/validar', WebhookController.validarConfiguracao);

/**
 * GET /webhook/teste
 * Endpoint de teste para verificar conectividade
 * Útil para testes de infraestrutura
 */
router.get('/teste', WebhookController.testarConectividade);

/**
 * POST /webhook/teste-mensagem
 * Endpoint para simular recebimento de mensagem (apenas desenvolvimento)
 * Útil para testes sem precisar enviar via WhatsApp
 */
if (process.env.NODE_ENV === 'development') {
    router.post('/teste-mensagem', (req, res) => {
        try {
            const { phoneNumber, message } = req.body;
            
            if (!phoneNumber || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'phoneNumber e message são obrigatórios'
                });
            }

            // Simula estrutura do webhook Evolution
            const webhookSimulado = {
                event: 'messages.upsert',
                data: [{
                    key: {
                        id: `TEST_${Date.now()}`,
                        remoteJid: `${phoneNumber}@s.whatsapp.net`,
                        fromMe: false
                    },
                    message: {
                        conversation: message
                    },
                    messageTimestamp: Math.floor(Date.now() / 1000)
                }]
            };

            // Simula requisição para o controller
            req.body = webhookSimulado;
            return WebhookController.receberMensagem(req, res);

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
 * GET /webhook/health
 * Health check simplificado para load balancers
 */
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

/**
 * Middleware de tratamento de erros específico para rotas de webhook
 */
router.use((error, req, res, next) => {
    console.error('❌ Erro na rota de webhook:', error);
    
    // Log detalhado em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
        console.error('Request body:', req.body);
        console.error('Request headers:', req.headers);
    }

    return res.status(500).json({
        success: false,
        error: 'Erro interno no webhook',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    });
});

/**
 * Middleware para rotas não encontradas no webhook
 */
router.use('*', (req, res) => {
    console.log(`⚠️ Rota de webhook não encontrada: ${req.method} ${req.path}`);
    
    return res.status(404).json({
        success: false,
        error: 'Endpoint de webhook não encontrado',
        available_endpoints: [
            'POST /webhook/mensagem',
            'GET /webhook/status',
            'GET /webhook/validar',
            'GET /webhook/teste',
            'GET /webhook/health'
        ],
        requested: `${req.method} ${req.path}`
    });
});

module.exports = router;