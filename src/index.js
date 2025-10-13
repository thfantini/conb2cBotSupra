const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

// Importações dos módulos do projeto
const logger = require('./utils/logger');
const database = require('./config/database');
const evolutionAPI = require('./config/evolution');
const webhookRoutes = require('./routes/webhook');
const webhookGroupRoutes = require('./routes/webhookGroup');
const webhookMessageRoutes = require('./routes/webhookMessage');
const qrcodeRoutes = require('./routes/qrcode');

// Cron:
const scheduledRoutes = require('./modules/scheduled-messages/routes/scheduled');

const { 
    errorHandler, 
    notFoundHandler, 
    addCorrelationId, 
    initializeErrorHandlers 
} = require('./middleware/errorHandler');

/**
 * Classe principal da aplicação
 */
class WhatsAppBot {
    constructor() {
        this.app = express();
        this.server = null;
        this.port = process.env.PORT || 3000;
        this.isShuttingDown = false;
    }

    /**
     * Inicializa a aplicação
     */
    async initialize() {
        try {
            logger.info('🚀 Iniciando WhatsApp Bot...', {
                context: 'startup',
                version: require('../package.json').version,
                environment: process.env.NODE_ENV || 'development'
            });

            // Inicializa handlers globais de erro
            initializeErrorHandlers();

            // Configura middlewares
            this.setupMiddlewares();

            // Configura rotas
            this.setupRoutes();

            // Configura tratamento de erros
            this.setupErrorHandling();

            // Testa conexões
            await this.testConnections();

            // Configura webhook da Evolution
            await this.setupEvolutionWebhook();

            // Inicializar automação de mensagens programadas
            await this.initializeScheduledMessages();

            // Inicia servidor
            await this.startServer();

            // Configura graceful shutdown
            this.setupGracefulShutdown();

            logger.info('✅ WhatsApp Bot iniciado com sucesso', {
                context: 'startup',
                port: this.port
            });

        } catch (error) {
            logger.error('❌ Falha na inicialização do bot', {
                context: 'startup',
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    }

    /**
     * Configura middlewares da aplicação
     */
    setupMiddlewares() {
        logger.debug('⚙️ Configurando middlewares...', { context: 'setup' });

        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Middleware de debug - captura TODAS as requisições
        this.app.use((req, res, next) => {
            console.log('='.repeat(80));
            console.log(`[${new Date().toISOString()}] REQUISIÇÃO RECEBIDA`);
            console.log(`Método: ${req.method}`);
            console.log(`URL: ${req.url}`);
            console.log(`Body:`, JSON.stringify(req.body, null, 2));
            console.log('='.repeat(80));
            next();
        });

        // // Middleware de debug - captura TODAS as requisições
        // this.app.use((req, res, next) => {
        //     const timestamp = new Date().toISOString();
        //     console.log('='.repeat(80));
        //     console.log(`[${timestamp}] REQUISIÇÃO RECEBIDA`);
        //     console.log(`Método: ${req.method}`);
        //     console.log(`URL: ${req.url}`);
        //     console.log(`IP: ${req.ip || req.connection.remoteAddress}`);
        //     console.log(`Headers:`, JSON.stringify(req.headers, null, 2));
        //     console.log(`Body:`, JSON.stringify(req.body, null, 2));
        //     console.log('='.repeat(80));
        //     next();
        // });

        // CORS
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            credentials: true
        }));

        // Body parser
        this.app.use(bodyParser.json({ 
            limit: '5mb',
            verify: (req, res, buf) => {
                req.rawBody = buf;
            }
        }));

        this.app.use(bodyParser.urlencoded({ 
            extended: true, 
            limit: '5mb' 
        }));

        // Correlation ID
        this.app.use(addCorrelationId);

        // Log de requisições
        this.app.use((req, res, next) => {
            logger.debug(`📡 ${req.method} ${req.path}`, {
                context: 'request',
                correlationId: req.correlationId,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            next();
        });

        // Headers de segurança básicos
        this.app.use((req, res, next) => {
            res.set({
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block'
            });
            next();
        });
    }

    /**
     * Configura rotas da aplicação
     */
    setupRoutes() {
        logger.debug('🛣️ Configurando rotas...', { context: 'setup' });

        // Rota raiz
        this.app.get('/', (req, res) => {
            res.json({
                success: true,
                message: 'WhatsApp Bot API',
                version: require('../package.json').version,
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                endpoints: {
                    webhook: '/webhook',
                    qrcode: '/qrcode',
                    health: '/health',
                    info: '/info'
                }
            });
        });

        // Rotas de webhook
        this.app.use('/webhook', webhookRoutes);

        // Rotas de webhook para grupos (micro-serviço)
        this.app.use('/webhook-group', webhookGroupRoutes);

        // Rotas de webhook-message (micro-serviço)
        this.app.use('/webhook-message', webhookMessageRoutes);

        // Rotas de QR Code
        this.app.use('/qrcode', qrcodeRoutes);

        // Rotas CRON (micro-serviço)
        this.app.use('/scheduled', scheduledRoutes);

        // Rota de health check
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealthStatus();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.status(statusCode).json(health);
            } catch (error) {
                logger.error('Erro no health check', { error: error.message });
                res.status(503).json({
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Rota de informações do sistema
        this.app.get('/info', (req, res) => {
            res.json({
                success: true,
                data: {
                    name: require('../package.json').name,
                    version: require('../package.json').version,
                    description: require('../package.json').description,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    environment: process.env.NODE_ENV || 'development',
                    timestamp: new Date().toISOString()
                }
            });
        });
    }

    /**
     * Inicializa o sistema de mensagens programadas
     */
    async initializeScheduledMessages() {
        try {
            logger.info('🤖 Inicializando sistema de mensagens programadas...', { 
                context: 'scheduled-messages' 
            });

            // Importar aqui para evitar carregamento desnecessário se desabilitado
            const scheduledCron = require('./modules/scheduled-messages/cron/scheduledCron');
            
            // A automação já se auto-inicializa, mas podemos fazer verificações
            const cronStatus = scheduledCron.getStatus();
            
            if (cronStatus.isRunning) {
                logger.info('✅ Automação de mensagens programadas ativa', {
                    context: 'scheduled-messages',
                    interval: cronStatus.interval,
                    nextExecution: cronStatus.statistics.nextAutoExecution
                });
            } else {
                logger.info('⏸️ Automação de mensagens programadas disponível mas pausada', {
                    context: 'scheduled-messages',
                    enabled: cronStatus.isEnabled
                });
            }

        } catch (error) {
            logger.error('❌ Erro ao inicializar mensagens programadas', {
                context: 'scheduled-messages',
                error: error.message
            });
            
            // Não falhar a aplicação se o módulo de mensagens programadas tiver problema
            logger.warn('⚠️ Aplicação continuará sem mensagens programadas', {
                context: 'scheduled-messages'
            });
        }
    }



    /**
     * Configura tratamento de erros
     */
    setupErrorHandling() {
        logger.debug('🛡️ Configurando tratamento de erros...', { context: 'setup' });

        // Handler para rotas não encontradas
        this.app.use(notFoundHandler);

        // Handler principal de erros
        this.app.use(errorHandler);
    }

    /**
     * Testa conexões com serviços externos
     */
    async testConnections() {
        logger.info('🔍 Testando conexões...', { context: 'setup' });

        // Testa conexão com banco de dados
        try {
            const dbConnected = await database.testConnection();
            if (!dbConnected) {
                throw new Error('Falha na conexão com banco de dados');
            }
            logger.info('✅ Conexão com banco de dados OK', { context: 'database' });
        } catch (error) {
            logger.error('❌ Erro na conexão com banco de dados', {
                context: 'database',
                error: error.message
            });
            throw error;
        }

        // Testa conexão com Evolution API
        try {
            const evolutionConnected = await evolutionAPI.testConnection();
            if (!evolutionConnected) {
                throw new Error('Falha na conexão com Evolution API');
            }
            logger.info('✅ Conexão com Evolution API OK', { context: 'evolution' });
        } catch (error) {
            logger.error('❌ Erro na conexão com Evolution API', {
                context: 'evolution',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Configura webhook da Evolution API
     */
    async setupEvolutionWebhook() {
        if (!process.env.WEBHOOK_URL) {
            logger.warn('⚠️ WEBHOOK_URL não configurada, pulando configuração do webhook', {
                context: 'webhook'
            });
            return;
        }

        try {
            logger.info('🔗 Configurando webhook da Evolution API...', { context: 'webhook' });

            const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/mensagem`;
            const result = await evolutionAPI.setWebhook(webhookUrl);

            if (result.success) {
                logger.info('✅ Webhook configurado com sucesso', {
                    context: 'webhook',
                    url: webhookUrl
                });
            } else {
                logger.error('❌ Falha ao configurar webhook', {
                    context: 'webhook',
                    error: result.error
                });
            }
        } catch (error) {
            logger.error('❌ Erro ao configurar webhook', {
                context: 'webhook',
                error: error.message
            });
        }
    }

    /**
     * Inicia o servidor HTTP
     */
    async startServer() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, '0.0.0.0', () => {
                    logger.info(`🌐 Servidor rodando na porta ${this.port}`, {
                        context: 'server',
                        port: this.port,
                        host: '0.0.0.0'
                    });
                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        logger.error(`❌ Porta ${this.port} já está em uso`, {
                            context: 'server',
                            port: this.port,
                            error: error.message
                        });
                    } else {
                        logger.error('❌ Erro no servidor HTTP', {
                            context: 'server',
                            error: error.message
                        });
                    }
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Configura graceful shutdown
     */
    setupGracefulShutdown() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        
        signals.forEach(signal => {
            process.on(signal, () => {
                logger.info(`📶 Sinal ${signal} recebido, iniciando shutdown...`, {
                    context: 'shutdown'
                });
                this.gracefulShutdown();
            });
        });
    }

    /**
     * Executa shutdown graceful
     */
    async gracefulShutdown() {
        if (this.isShuttingDown) {
            logger.warn('⚠️ Shutdown já em andamento...', { context: 'shutdown' });
            return;
        }

        this.isShuttingDown = true;
        logger.info('🛑 Iniciando shutdown graceful...', { context: 'shutdown' });

        try {
            
            // Parar automação de mensagens programadas
            try {
                const scheduledCron = require('./modules/scheduled-messages/cron/scheduledCron');
                scheduledCron.stop();
                logger.info('✅ Automação de mensagens programadas parada', { context: 'shutdown' });
                } catch (error) {
                logger.warn('⚠️ Erro ao parar automação:', error.message);
            }
            
            // Para de aceitar novas conexões
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                logger.info('✅ Servidor HTTP fechado', { context: 'shutdown' });
            }

            // Fecha conexões com banco de dados
            try {
                await database.closePool();
                logger.info('✅ Conexões de banco fechadas', { context: 'shutdown' });
            } catch (error) {
                logger.error('❌ Erro ao fechar conexões de banco', {
                    context: 'shutdown',
                    error: error.message
                });
            }

            logger.info('✅ Shutdown concluído com sucesso', { context: 'shutdown' });
            process.exit(0);

        } catch (error) {
            logger.error('❌ Erro durante shutdown', {
                context: 'shutdown',
                error: error.message
            });
            process.exit(1);
        }
    }

    /**
     * Obtém status de saúde da aplicação
     */
    async getHealthStatus() {
        const checks = {
            database: false,
            evolution: false
        };

        // Check banco de dados
        try {
            checks.database = await database.testConnection();
        } catch (error) {
            logger.debug('Health check database falhou', { error: error.message });
        }

        // Check Evolution API
        try {
            checks.evolution = await evolutionAPI.testConnection();
        } catch (error) {
            logger.debug('Health check evolution falhou', { error: error.message });
        }

        // Check WhatsApp Message Service
        try {
            const WhatsAppMessageService = require('./services/whatsappMessageService');
            checks.whatsapp_service = await WhatsAppMessageService.verificarDisponibilidade();
        } catch (error) {
            logger.debug('Health check whatsapp service falhou', { error: error.message });
        }

        // Check Email Message Service  
        try {
            const EmailMessageService = require('./services/emailMessageService');
            checks.email_service = await EmailMessageService.verificarDisponibilidade();
        } catch (error) {
            logger.debug('Health check email service falhou', { error: error.message });
        }

        const allHealthy = Object.values(checks).every(status => status);
        
        return {
            status: allHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            checks,
            version: require('../package.json').version
        };
    }
}

/**
 * Inicialização da aplicação
 */
async function main() {
    try {
        const bot = new WhatsAppBot();
        await bot.initialize();
    } catch (error) {
        console.error('💥 Falha crítica na inicialização:', error);
        process.exit(1);
    }
}

// Executa apenas se for o arquivo principal
if (require.main === module) {
    main();
}

module.exports = WhatsAppBot;