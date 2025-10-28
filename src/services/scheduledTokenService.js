const cron = require('node-cron');
const endpoint = require('../config/endpoint');
const tokenManager = require('./tokenManagerService');

/**
 * Serviço de renovação automática do token ERP
 * Executa a cada 5 dias para manter o token sempre válido
 */

let cronJob = null;
let isRunning = false;
let lastExecution = null;
let nextExecution = null;
let statistics = {
    totalExecutions: 0,
    successCount: 0,
    errorCount: 0,
    lastError: null
};

/**
 * Executa a renovação do token
 * @returns {Promise<Object>} Resultado da renovação
 */
async function renovarToken() {
    console.log('='.repeat(80));
    console.log('🔄 Iniciando renovação automática do token ERP...');
    console.log('Data/Hora:', new Date().toISOString());
    console.log('='.repeat(80));

    lastExecution = new Date().toISOString();
    statistics.totalExecutions++;

    try {
        // Verificar validade do token atual
        console.log('🔍 Verificando token atual...');
        const validadeAtual = await tokenManager.verificarValidadeToken();

        if (validadeAtual.valido) {
            console.log('✅ Token atual ainda é válido');
            console.log('Dias restantes:', validadeAtual.diasRestantes);

            // Se ainda tem mais de 2 dias, não precisa renovar agora
            if (validadeAtual.diasRestantes > 2) {
                console.log('ℹ️ Token não precisa ser renovado agora');
                statistics.successCount++;
                return {
                    success: true,
                    renovado: false,
                    message: 'Token ainda válido, renovação não necessária',
                    diasRestantes: validadeAtual.diasRestantes
                };
            }
        } else {
            console.log('⚠️ Token atual inválido ou expirado:', validadeAtual.motivo);
        }

        // Gerar novo token
        console.log('🔄 Gerando novo token...');
        const resultadoToken = await endpoint.gerarTokenERP();

        if (!resultadoToken.success) {
            throw new Error(resultadoToken.error || 'Erro ao gerar token');
        }

        console.log('✅ Novo token gerado com sucesso');

        // Salvar novo token
        console.log('💾 Salvando novo token...');
        const resultadoSalvar = await tokenManager.salvarToken(resultadoToken.data);

        if (!resultadoSalvar.success) {
            throw new Error(resultadoSalvar.error || 'Erro ao salvar token');
        }

        console.log('✅ Token salvo com sucesso');
        console.log('Token:', resultadoToken.data.token);
        console.log('Válido até:', resultadoToken.data.dataValidadeToken);

        statistics.successCount++;

        console.log('='.repeat(80));
        console.log('✅ Renovação do token concluída com sucesso!');
        console.log('='.repeat(80));

        return {
            success: true,
            renovado: true,
            message: 'Token renovado com sucesso',
            token: resultadoToken.data.token,
            dataValidade: resultadoToken.data.dataValidadeToken
        };

    } catch (error) {
        console.error('❌ Erro na renovação do token:', error.message);
        statistics.errorCount++;
        statistics.lastError = {
            message: error.message,
            timestamp: new Date().toISOString()
        };

        console.log('='.repeat(80));

        return {
            success: false,
            renovado: false,
            message: 'Erro na renovação do token',
            error: error.message
        };
    }
}

/**
 * Inicia o agendamento de renovação automática
 * Executa a cada 5 dias às 00:00
 */
function iniciar() {
    if (isRunning) {
        console.log('⚠️ Serviço de renovação de token já está em execução');
        return false;
    }

    console.log('🚀 Iniciando serviço de renovação automática do token ERP...');
    console.log('Frequência: A cada 5 dias às 00:00');

    // Cron: A cada 5 dias às 00:00
    // Formato: minuto hora dia-do-mês mês dia-da-semana
    // 0 0 */5 * * = A cada 5 dias às 00:00
    cronJob = cron.schedule('0 0 */5 * *', async () => {
        console.log('⏰ Executando tarefa agendada de renovação de token...');
        await renovarToken();
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    isRunning = true;

    // Calcular próxima execução
    const now = new Date();
    const next = new Date(now);
    next.setDate(next.getDate() + 5);
    next.setHours(0, 0, 0, 0);
    nextExecution = next.toISOString();

    console.log('✅ Serviço de renovação automática iniciado com sucesso');
    console.log('Próxima execução:', nextExecution);

    // Executar imediatamente na primeira vez para garantir que temos um token válido
    console.log('🔄 Executando renovação inicial...');
    renovarToken().catch(error => {
        console.error('❌ Erro na renovação inicial:', error.message);
    });

    return true;
}

/**
 * Para o agendamento de renovação automática
 */
function parar() {
    if (!isRunning) {
        console.log('⚠️ Serviço de renovação de token não está em execução');
        return false;
    }

    if (cronJob) {
        cronJob.stop();
        cronJob = null;
    }

    isRunning = false;
    nextExecution = null;

    console.log('⏹️ Serviço de renovação automática parado');
    return true;
}

/**
 * Força a execução imediata da renovação
 * @returns {Promise<Object>} Resultado da renovação
 */
async function executarAgora() {
    console.log('🔄 Execução manual de renovação solicitada...');
    return await renovarToken();
}

/**
 * Obtém o status do serviço
 * @returns {Object} Status do serviço
 */
function obterStatus() {
    return {
        isRunning,
        lastExecution,
        nextExecution,
        statistics: {
            ...statistics,
            successRate: statistics.totalExecutions > 0
                ? ((statistics.successCount / statistics.totalExecutions) * 100).toFixed(2) + '%'
                : 'N/A'
        }
    };
}

/**
 * Reseta as estatísticas
 */
function resetarEstatisticas() {
    statistics = {
        totalExecutions: 0,
        successCount: 0,
        errorCount: 0,
        lastError: null
    };
    console.log('📊 Estatísticas resetadas');
}

module.exports = {
    iniciar,
    parar,
    executarAgora,
    renovarToken,
    obterStatus,
    resetarEstatisticas
};
