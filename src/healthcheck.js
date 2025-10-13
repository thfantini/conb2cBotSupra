/**
 * Health Check para o Bot de Atendimento WhatsApp
 * Verifica se os serviços essenciais estão funcionando corretamente
 */

const mysql = require('mysql2/promise');
const axios = require('axios');

// Configurações (devem ser as mesmas da aplicação principal)
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'whatsapp_bot',
    connectTimeout: 5000,
    acquireTimeout: 5000
};

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

/**
 * Verifica conexão com o banco de dados MySQL
 */
async function checkDatabase() {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        await connection.execute('SELECT 1 as health_check');
        await connection.end();
        return { status: 'ok', message: 'Database connection successful' };
    } catch (error) {
        return { 
            status: 'error', 
            message: `Database connection failed: ${error.message}` 
        };
    }
}

/**
 * Verifica se a Evolution API está acessível
 */
async function checkEvolutionAPI() {
    try {
        const response = await axios.get(`${EVOLUTION_API_URL}/manager/webhook`, {
            timeout: 5000,
            headers: {
                'apikey': EVOLUTION_API_KEY
            }
        });
        
        if (response.status === 200) {
            return { status: 'ok', message: 'Evolution API is accessible' };
        } else {
            return { 
                status: 'warning', 
                message: `Evolution API returned status: ${response.status}` 
            };
        }
    } catch (error) {
        return { 
            status: 'error', 
            message: `Evolution API check failed: ${error.message}` 
        };
    }
}

/**
 * Verifica se a aplicação está respondendo
 */
async function checkApplication() {
    try {
        // Verifica se o processo Node.js está rodando normalmente
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        // Verifica se a memória não está excessiva (limite de 500MB)
        if (memoryUsage.heapUsed > 500 * 1024 * 1024) {
            return {
                status: 'warning',
                message: `High memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
            };
        }
        
        return {
            status: 'ok',
            message: `Application running for ${Math.round(uptime)}s`,
            details: {
                uptime: uptime,
                memory: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
            }
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Application check failed: ${error.message}`
        };
    }
}

/**
 * Executa todos os health checks
 */
async function runHealthCheck() {
    console.log('🔍 Starting health check...');
    
    const results = {
        timestamp: new Date().toISOString(),
        application: await checkApplication(),
        database: await checkDatabase(),
        evolutionAPI: await checkEvolutionAPI()
    };
    
    // Determina o status geral
    const hasErrors = Object.values(results).some(check => 
        check.status === 'error'
    );
    
    const hasWarnings = Object.values(results).some(check => 
        check.status === 'warning'
    );
    
    results.overall = {
        status: hasErrors ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy'
    };
    
    // Log dos resultados
    console.log('📊 Health Check Results:', JSON.stringify(results, null, 2));
    
    // Exit code para o Docker
    if (hasErrors) {
        console.error('❌ Health check failed');
        process.exit(1);
    } else if (hasWarnings) {
        console.warn('⚠️  Health check passed with warnings');
        process.exit(0);
    } else {
        console.log('✅ Health check passed');
        process.exit(0);
    }
}

// Executa o health check se o arquivo for chamado diretamente
if (require.main === module) {
    runHealthCheck().catch(error => {
        console.error('💥 Health check crashed:', error);
        process.exit(1);
    });
}

module.exports = {
    runHealthCheck,
    checkDatabase,
    checkEvolutionAPI,
    checkApplication
};