const fs = require('fs');
const path = require('path');

/**
 * Sistema avançado de logging para WhatsApp Bot
 * Suporta múltiplos níveis, destinos e sanitização automática
 */
class Logger {
    constructor() {
        this.levels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };

        // Configuração baseada no ambiente
        this.config = {
            level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG'),
            enableColors: process.env.NODE_ENV !== 'production',
            enableFile: process.env.LOG_TO_FILE !== 'false',
            logDir: process.env.LOG_DIR || './logs',
            maxFileSize: parseInt(process.env.LOG_MAX_SIZE) || 10 * 1024 * 1024, // 10MB
            maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
        };

        // Cores para console
        this.colors = {
            ERROR: '\x1b[31m', // Vermelho
            WARN: '\x1b[33m',  // Amarelo
            INFO: '\x1b[36m',  // Ciano
            DEBUG: '\x1b[35m', // Magenta
            reset: '\x1b[0m'
        };

        // Emojis para diferentes contextos
        this.emojis = {
            ERROR: '❌',
            WARN: '⚠️',
            INFO: 'ℹ️',
            DEBUG: '🔍',
            webhook: '📱',
            database: '🗄️',
            external: '🌐',
            startup: '🚀',
            shutdown: '🛑'
        };

        this.initializeLogDirectory();
    }

    /**
     * Inicializa o diretório de logs
     */
    initializeLogDirectory() {
        if (this.config.enableFile) {
            try {
                if (!fs.existsSync(this.config.logDir)) {
                    fs.mkdirSync(this.config.logDir, { recursive: true });
                }
            } catch (error) {
                console.error('Erro ao criar diretório de logs:', error.message);
                this.config.enableFile = false;
            }
        }
    }

    /**
     * Verifica se o nível deve ser logado
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.config.level];
    }

    /**
     * Sanitiza dados sensíveis
     */
    sanitizeData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const sensitiveFields = [
            'password', 'senha', 'token', 'apikey', 'secret', 'authorization',
            'cnpj', 'cpf', 'phone', 'telefone', 'email', 'usuario'
        ];

        const sanitized = Array.isArray(data) ? [...data] : { ...data };

        for (const [key, value] of Object.entries(sanitized)) {
            const lowerKey = key.toLowerCase();

            if (sensitiveFields.some(field => lowerKey.includes(field))) {
                sanitized[key] = '***REDACTED***';
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeData(value);
            }
        }

        return sanitized;
    }

    /**
     * Formata mensagem de log
     */
    formatMessage(level, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const pid = process.pid;
        const emoji = this.emojis[level] || '';

        // Sanitiza metadados
        const sanitizedMetadata = this.sanitizeData(metadata);

        // Construir linha base
        const baseInfo = {
            timestamp,
            level,
            pid,
            message
        };

        // Adicionar metadados se existirem
        const logData = { ...baseInfo, ...sanitizedMetadata };

        // Formato para console
        let consoleMessage = `${emoji} [${timestamp}] ${level}: ${message}`;

        if (Object.keys(sanitizedMetadata).length > 0) {
            consoleMessage += ` | ${JSON.stringify(sanitizedMetadata)}`;
        }

        // Formato para arquivo (JSON estruturado)
        const fileMessage = JSON.stringify(logData);

        return { consoleMessage, fileMessage, logData };
    }

    /**
     * Escreve no arquivo de log com rotação
     */
    writeToFile(message) {
        if (!this.config.enableFile) return;

        try {
            const logFile = path.join(this.config.logDir, 'app.log');

            // Verifica se precisa rotacionar
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size >= this.config.maxFileSize) {
                    this.rotateLogFile(logFile);
                }
            }

            // Escreve nova linha
            fs.appendFileSync(logFile, message + '\n', 'utf8');
        } catch (error) {
            console.error('Erro ao escrever no arquivo de log:', error.message);
        }
    }

    /**
     * Rotaciona arquivo de log
     */
    rotateLogFile(logFile) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedFile = path.join(
                this.config.logDir,
                `app-${timestamp}.log`
            );

            // Move arquivo atual
            fs.renameSync(logFile, rotatedFile);

            // Remove arquivos antigos se necessário
            this.cleanOldLogFiles();
        } catch (error) {
            console.error('Erro ao rotacionar log:', error.message);
        }
    }

    /**
     * Remove arquivos de log antigos
     */
    cleanOldLogFiles() {
        try {
            const files = fs.readdirSync(this.config.logDir)
                .filter(file => file.startsWith('app-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.config.logDir, file),
                    mtime: fs.statSync(path.join(this.config.logDir, file)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);

            // Remove arquivos excedentes
            if (files.length > this.config.maxFiles) {
                const filesToDelete = files.slice(this.config.maxFiles);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
        } catch (error) {
            console.error('Erro ao limpar logs antigos:', error.message);
        }
    }

    /**
     * Método principal de log
     */
    log(level, message, metadata = {}) {
        if (!this.shouldLog(level)) return;

        try {
            const formatted = this.formatMessage(level, message, metadata);

            // Console com cores
            if (this.config.enableColors && process.stdout.isTTY) {
                const colorCode = this.colors[level] || '';
                const resetCode = this.colors.reset;
                console.log(colorCode + formatted.consoleMessage + resetCode);
            } else {
                console.log(formatted.consoleMessage);
            }

            // Arquivo
            this.writeToFile(formatted.fileMessage);

        } catch (error) {
            // Fallback seguro
            console.error('Erro no sistema de logging:', error.message);
            console.log(`[${new Date().toISOString()}] ${level}: ${message}`);
        }
    }

    /**
     * Métodos de conveniência
     */
    error(message, metadata = {}) {
        this.log('ERROR', message, metadata);
    }

    warn(message, metadata = {}) {
        this.log('WARN', message, metadata);
    }

    info(message, metadata = {}) {
        this.log('INFO', message, metadata);
    }

    debug(message, metadata = {}) {
        this.log('DEBUG', message, metadata);
    }

    /**
     * Logs especializados
     */
    webhook(phone, message, direction = 'unknown', metadata = {}) {
        const sanitizedPhone = phone ? phone.replace(/(\d{2})(\d{5})(\d{4})/, '$1****$3') : 'unknown';
        this.info(`${this.emojis.webhook} Webhook ${direction}`, {
            context: 'webhook',
            phone: sanitizedPhone,
            messagePreview: message ? message.substring(0, 50) + '...' : '',
            ...metadata
        });
    }

    database(operation, table, metadata = {}) {
        this.debug(`${this.emojis.database} Database ${operation}`, {
            context: 'database',
            table,
            ...metadata
        });
    }

    external(service, operation, metadata = {}) {
        this.info(`${this.emojis.external} External API`, {
            context: 'external',
            service,
            operation,
            ...metadata
        });
    }
}

// Singleton
const logger = new Logger();

module.exports = logger;