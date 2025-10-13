/**
 * Middleware global para tratamento de erros
 */

/**
 * Tipos de erro conhecidos
 */
const ERROR_TYPES = {
    VALIDATION: 'VALIDATION_ERROR',
    DATABASE: 'DATABASE_ERROR',
    AUTHENTICATION: 'AUTHENTICATION_ERROR',
    AUTHORIZATION: 'AUTHORIZATION_ERROR',
    NOT_FOUND: 'NOT_FOUND_ERROR',
    EXTERNAL_API: 'EXTERNAL_API_ERROR',
    BUSINESS_LOGIC: 'BUSINESS_LOGIC_ERROR',
    INTERNAL: 'INTERNAL_ERROR'
};

/**
 * Middleware principal de tratamento de erros
 * @param {Error} error - Erro capturado
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 */
function errorHandler(error, req, res, next) {
    // Se a resposta já foi enviada, delega para o Express
    if (res.headersSent) {
        return next(error);
    }

    try {
        // Log do erro
        logError(error, req);

        // Classifica o erro e define resposta
        const errorInfo = classifyError(error);
        const response = buildErrorResponse(errorInfo, req);

        return res.status(errorInfo.statusCode).json(response);

    } catch (handlerError) {
        console.error('❌ Erro no error handler:', handlerError);
        
        // Resposta de fallback
        return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Classifica o erro e define status code apropriado
 * @param {Error} error - Erro a ser classificado
 * @returns {Object} Informações do erro classificado
 */
function classifyError(error) {
    let statusCode = 500;
    let type = ERROR_TYPES.INTERNAL;
    let message = 'Erro interno do servidor';
    let isOperational = false;

    // Erros de validação
    if (error.name === 'ValidationError' || error.type === ERROR_TYPES.VALIDATION) {
        statusCode = 400;
        type = ERROR_TYPES.VALIDATION;
        message = error.message || 'Dados inválidos fornecidos';
        isOperational = true;
    }
    // Erros de banco de dados
    else if (error.code && (error.code.startsWith('ER_') || error.code === 'ECONNREFUSED')) {
        statusCode = 503;
        type = ERROR_TYPES.DATABASE;
        message = 'Serviço temporariamente indisponível';
        isOperational = true;
    }
    // Erros de autenticação
    else if (error.name === 'UnauthorizedError' || error.type === ERROR_TYPES.AUTHENTICATION) {
        statusCode = 401;
        type = ERROR_TYPES.AUTHENTICATION;
        message = 'Credenciais inválidas';
        isOperational = true;
    }
    // Erros de autorização
    else if (error.name === 'ForbiddenError' || error.type === ERROR_TYPES.AUTHORIZATION) {
        statusCode = 403;
        type = ERROR_TYPES.AUTHORIZATION;
        message = 'Acesso negado';
        isOperational = true;
    }
    // Erros de não encontrado
    else if (error.name === 'NotFoundError' || error.type === ERROR_TYPES.NOT_FOUND) {
        statusCode = 404;
        type = ERROR_TYPES.NOT_FOUND;
        message = 'Recurso não encontrado';
        isOperational = true;
    }
    // Erros de API externa (Evolution, etc)
    else if (error.response && error.response.status) {
        statusCode = 502;
        type = ERROR_TYPES.EXTERNAL_API;
        message = 'Erro na comunicação com serviço externo';
        isOperational = true;
    }
    // Erros de lógica de negócio
    else if (error.type === ERROR_TYPES.BUSINESS_LOGIC) {
        statusCode = 422;
        type = ERROR_TYPES.BUSINESS_LOGIC;
        message = error.message || 'Erro na lógica de negócio';
        isOperational = true;
    }
    // Erros de sintaxe JSON
    else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        statusCode = 400;
        type = ERROR_TYPES.VALIDATION;
        message = 'JSON inválido';
        isOperational = true;
    }

    return {
        statusCode,
        type,
        message,
        isOperational,
        originalError: error
    };
}

/**
 * Constrói resposta de erro padronizada
 * @param {Object} errorInfo - Informações do erro classificado
 * @param {Object} req - Request object
 * @returns {Object} Resposta de erro
 */
function buildErrorResponse(errorInfo, req) {
    const response = {
        success: false,
        error: errorInfo.message,
        type: errorInfo.type,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    };

    // Adiciona informações extras em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        response.stack = errorInfo.originalError.stack;
        response.details = {
            name: errorInfo.originalError.name,
            message: errorInfo.originalError.message,
            code: errorInfo.originalError.code
        };
    }

    // Adiciona ID de correlação se disponível
    if (req.correlationId) {
        response.correlationId = req.correlationId;
    }

    return response;
}

/**
 * Faz log detalhado do erro
 * @param {Error} error - Erro a ser logado
 * @param {Object} req - Request object
 */
function logError(error, req) {
    const timestamp = new Date().toISOString();
    const correlationId = req.correlationId || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    console.error(`❌ [${timestamp}] ERROR:`);
    console.error(`📍 Path: ${req.method} ${req.path}`);
    console.error(`🆔 Correlation ID: ${correlationId}`);
    console.error(`🌐 IP: ${ip}`);
    console.error(`🖥️ User-Agent: ${userAgent}`);
    console.error(`⚠️ Error: ${error.message}`);
    console.error(`📂 Stack: ${error.stack}`);

    // Log do body da requisição em desenvolvimento (sem dados sensíveis)
    if (process.env.NODE_ENV === 'development' && req.body) {
        const sanitizedBody = sanitizeLogData(req.body);
        console.error(`📄 Request Body:`, JSON.stringify(sanitizedBody, null, 2));
    }
}

/**
 * Remove dados sensíveis dos logs
 * @param {Object} data - Dados a serem sanitizados
 * @returns {Object} Dados sanitizados
 */
function sanitizeLogData(data) {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const sensitiveFields = ['password', 'token', 'apikey', 'secret', 'authorization'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '***REDACTED***';
        }
    }

    return sanitized;
}

/**
 * Handler para exceções não capturadas
 */
function handleUncaughtException() {
    process.on('uncaughtException', (error) => {
        console.error('💥 UNCAUGHT EXCEPTION! Shutting down...');
        console.error('Error:', error.name, error.message);
        console.error('Stack:', error.stack);
        
        // Dá tempo para logs serem escritos
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    });
}

/**
 * Handler para promises rejeitadas não tratadas
 */
function handleUnhandledRejection() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 UNHANDLED PROMISE REJECTION! Shutting down...');
        console.error('Reason:', reason);
        console.error('Promise:', promise);
        
        // Dá tempo para logs serem escritos
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    });
}

/**
 * Middleware para capturar erros de rota não encontrada
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 */
function notFoundHandler(req, res, next) {
    const error = new Error(`Rota não encontrada: ${req.method} ${req.path}`);
    error.type = ERROR_TYPES.NOT_FOUND;
    error.statusCode = 404;
    next(error);
}

/**
 * Middleware para adicionar correlation ID às requisições
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 */
function addCorrelationId(req, res, next) {
    req.correlationId = req.get('X-Correlation-ID') || 
                       req.get('X-Request-ID') || 
                       generateCorrelationId();
    
    res.set('X-Correlation-ID', req.correlationId);
    next();
}

/**
 * Gera ID único para correlação
 * @returns {string} ID de correlação
 */
function generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Classe para erros operacionais customizados
 */
class AppError extends Error {
    constructor(message, statusCode, type = ERROR_TYPES.INTERNAL, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.type = type;
        this.isOperational = isOperational;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Inicializa handlers globais de erro
 */
function initializeErrorHandlers() {
    handleUncaughtException();
    handleUnhandledRejection();
    
    console.log('✅ Error handlers inicializados');
}

module.exports = {
    errorHandler,
    notFoundHandler,
    addCorrelationId,
    initializeErrorHandlers,
    AppError,
    ERROR_TYPES
};