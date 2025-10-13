const express = require('express');
const QRCodeController = require('../controllers/qrcodeController');

const router = express.Router();

/**
 * Middleware aplicado a todas as rotas do QR Code
 */
router.use(QRCodeController.logRequest);

/**
 * GET /qrcode
 * Obtém QR Code para conexão WhatsApp
 * Aplica validação de token antes do processamento
 */
router.get('/', 
    QRCodeController.validarTokenQR,
    QRCodeController.obterQRCode
);

/**
 * POST /qrcode/conectar
 * Inicia processo completo de conexão (reinicia instância + obtém QR)
 * Endpoint principal para iniciar nova conexão
 */
router.post('/conectar', 
    QRCodeController.validarTokenQR,
    QRCodeController.iniciarConexao
);

/**
 * GET /qrcode/status
 * Verifica status atual da conexão WhatsApp
 * Não requer autenticação para facilitar monitoramento
 */
router.get('/status', QRCodeController.verificarStatus);

/**
 * POST /qrcode/reiniciar
 * Reinicia a instância WhatsApp para gerar novo QR Code
 * Requer token de segurança
 */
router.post('/reiniciar', 
    QRCodeController.validarTokenQR,
    QRCodeController.reiniciarInstancia
);

/**
 * POST /qrcode/desconectar
 * Desconecta a instância WhatsApp
 * Requer token de segurança
 */
router.post('/desconectar', 
    QRCodeController.validarTokenQR,
    QRCodeController.desconectar
);

/**
 * GET /qrcode/informacoes
 * Obtém informações detalhadas da instância
 * Útil para debug e monitoramento
 */
router.get('/informacoes', 
    QRCodeController.validarTokenQR,
    QRCodeController.obterInformacoes
);

/**
 * GET /qrcode/monitorar
 * Monitora conexão até estabelecer ou atingir timeout
 * Query params: maxTentativas, intervalo
 */
router.get('/monitorar', 
    QRCodeController.validarTokenQR,
    QRCodeController.monitorarConexao
);

/**
 * GET /qrcode/teste
 * Endpoint de teste para verificar disponibilidade do controller
 * Útil para testes de infraestrutura
 */
router.get('/teste', QRCodeController.testarDisponibilidade);

/**
 * POST /qrcode/obter
 * Método alternativo POST para obter QR Code
 * Útil para clientes que preferem POST
 */
router.post('/obter', 
    QRCodeController.validarTokenQR,
    QRCodeController.obterQRCode
);

/**
 * GET /qrcode/health
 * Health check simplificado para load balancers
 */
router.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        service: 'qrcode',
        timestamp: Date.now() 
    });
});

/**
 * Endpoints adicionais apenas em desenvolvimento
 */
if (process.env.NODE_ENV === 'development') {
    
    /**
     * GET /qrcode/debug
     * Endpoint de debug com informações detalhadas
     */
    router.get('/debug', (req, res) => {
        try {
            const debugInfo = {
                environment: process.env.NODE_ENV,
                evolutionApi: process.env.EVOLUTION_API_URL,
                instanceName: process.env.EVOLUTION_INSTANCE_NAME,
                webhookToken: process.env.WEBHOOK_TOKEN ? 'configurado' : 'não configurado',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                routes: [
                    'GET /qrcode - Obter QR Code',
                    'POST /qrcode/conectar - Iniciar conexão',
                    'GET /qrcode/status - Status da conexão',
                    'POST /qrcode/reiniciar - Reiniciar instância',
                    'POST /qrcode/desconectar - Desconectar',
                    'GET /qrcode/informacoes - Informações da instância',
                    'GET /qrcode/monitorar - Monitorar conexão',
                    'GET /qrcode/teste - Teste de disponibilidade'
                ]
            };

            return res.status(200).json({
                success: true,
                message: 'Informações de debug do QR Code',
                data: debugInfo
            });

        } catch (error) {
            console.error('Erro no debug:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    });

    /**
     * POST /qrcode/simular-conexao
     * Simula processo de conexão para testes
     */
    router.post('/simular-conexao', (req, res) => {
        try {
            console.log('🧪 Simulando processo de conexão...');
            
            const simulacao = {
                qrcode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                instanceName: process.env.EVOLUTION_INSTANCE_NAME,
                message: 'QR Code simulado para testes',
                timestamp: new Date().toISOString(),
                simulado: true
            };

            return res.status(201).json({
                success: true,
                message: 'Simulação de conexão iniciada',
                data: simulacao
            });

        } catch (error) {
            console.error('Erro na simulação:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro interno do servidor'
            });
        }
    });
}

/**
 * Middleware de tratamento de erros específico para rotas de QR Code
 */
router.use((error, req, res, next) => {
    console.error('❌ Erro na rota de QR Code:', error);
    
    // Log detalhado em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
        console.error('Request body:', req.body);
        console.error('Request headers:', req.headers);
        console.error('Request query:', req.query);
    }

    return res.status(500).json({
        success: false,
        error: 'Erro interno no QR Code',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        service: 'qrcode'
    });
});

/**
 * Middleware para rotas não encontradas no QR Code
 */
router.use('*', (req, res) => {
    console.log(`⚠️ Rota de QR Code não encontrada: ${req.method} ${req.path}`);
    
    return res.status(404).json({
        success: false,
        error: 'Endpoint de QR Code não encontrado',
        available_endpoints: [
            'GET /qrcode - Obter QR Code',
            'POST /qrcode/conectar - Iniciar processo de conexão',
            'GET /qrcode/status - Verificar status da conexão',
            'POST /qrcode/reiniciar - Reiniciar instância',
            'POST /qrcode/desconectar - Desconectar instância',
            'GET /qrcode/informacoes - Informações da instância',
            'GET /qrcode/monitorar - Monitorar conexão',
            'POST /qrcode/obter - Obter QR Code (método POST)',
            'GET /qrcode/teste - Teste de disponibilidade',
            'GET /qrcode/health - Health check'
        ],
        requested: `${req.method} ${req.path}`,
        service: 'qrcode'
    });
});

module.exports = router;