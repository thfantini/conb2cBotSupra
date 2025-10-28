const fs = require('fs').promises;
const path = require('path');

/**
 * Serviço de gerenciamento de token ERP
 * Responsável por salvar e ler o token de um arquivo físico
 */

// Caminho do arquivo onde o token será armazenado
const TOKEN_FILE_PATH = path.join(__dirname, '../../.token-erp.json');

/**
 * Salva o token no arquivo físico
 * @param {Object} tokenData - Dados do token
 * @param {string} tokenData.token - Token de autenticação
 * @param {string} tokenData.dataValidade - Data de validade do token
 * @param {string} tokenData.dataValidadeToken - Data de validade alternativa
 * @param {Object} tokenData.usuario - Dados do usuário
 * @returns {Promise<Object>} Resultado da operação
 */
async function salvarToken(tokenData) {
    try {
        console.log('💾 Salvando token no arquivo físico...');

        // Adicionar timestamp de criação
        const dadosCompletos = {
            ...tokenData,
            dataGeracao: new Date().toISOString(),
            ultimaAtualizacao: new Date().toISOString()
        };

        // Salvar no arquivo JSON
        await fs.writeFile(
            TOKEN_FILE_PATH,
            JSON.stringify(dadosCompletos, null, 2),
            'utf8'
        );

        console.log('✅ Token salvo com sucesso em:', TOKEN_FILE_PATH);
        console.log('Token:', tokenData.token);
        console.log('Válido até:', tokenData.dataValidadeToken || tokenData.dataValidade);

        return {
            success: true,
            message: 'Token salvo com sucesso',
            filePath: TOKEN_FILE_PATH
        };

    } catch (error) {
        console.error('❌ Erro ao salvar token:', error.message);
        return {
            success: false,
            message: 'Erro ao salvar token',
            error: error.message
        };
    }
}

/**
 * Lê o token do arquivo físico
 * @returns {Promise<Object>} Dados do token ou erro
 */
async function lerToken() {
    try {
        // Verificar se o arquivo existe
        try {
            await fs.access(TOKEN_FILE_PATH);
        } catch {
            console.log('⚠️ Arquivo de token não encontrado');
            return {
                success: false,
                message: 'Arquivo de token não encontrado',
                data: null
            };
        }

        // Ler conteúdo do arquivo
        const conteudo = await fs.readFile(TOKEN_FILE_PATH, 'utf8');
        const tokenData = JSON.parse(conteudo);

        console.log('✅ Token lido com sucesso');
        console.log('Token:', tokenData.token);
        console.log('Data de Validade:', tokenData.dataValidadeToken || tokenData.dataValidade);

        return {
            success: true,
            message: 'Token lido com sucesso',
            data: tokenData
        };

    } catch (error) {
        console.error('❌ Erro ao ler token:', error.message);
        return {
            success: false,
            message: 'Erro ao ler token',
            error: error.message,
            data: null
        };
    }
}

/**
 * Verifica se o token está válido (não expirado)
 * @returns {Promise<Object>} Status de validade do token
 */
async function verificarValidadeToken() {
    try {
        const resultado = await lerToken();

        if (!resultado.success || !resultado.data) {
            return {
                valido: false,
                motivo: 'Token não encontrado',
                data: null
            };
        }

        const tokenData = resultado.data;
        const dataValidade = tokenData.dataValidadeToken || tokenData.dataValidade;

        if (!dataValidade) {
            return {
                valido: false,
                motivo: 'Data de validade não encontrada',
                data: tokenData
            };
        }

        // Converter data de validade (formato: DD-MM-YYYY HH:mm:ss)
        const [dataParte, horaParte] = dataValidade.split(' ');
        const [dia, mes, ano] = dataParte.split('-');
        const [hora, minuto, segundo] = horaParte.split(':');

        const dataValidadeObj = new Date(ano, mes - 1, dia, hora, minuto, segundo);
        const agora = new Date();

        // Verificar se está expirado
        if (agora >= dataValidadeObj) {
            console.log('⚠️ Token expirado!');
            console.log('Data de Validade:', dataValidade);
            console.log('Data Atual:', agora.toISOString());

            return {
                valido: false,
                motivo: 'Token expirado',
                dataValidade: dataValidade,
                data: tokenData
            };
        }

        // Calcular dias restantes
        const diferencaMs = dataValidadeObj - agora;
        const diasRestantes = Math.floor(diferencaMs / (1000 * 60 * 60 * 24));

        console.log('✅ Token válido');
        console.log('Data de Validade:', dataValidade);
        console.log('Dias restantes:', diasRestantes);

        return {
            valido: true,
            motivo: 'Token válido',
            dataValidade: dataValidade,
            diasRestantes: diasRestantes,
            data: tokenData
        };

    } catch (error) {
        console.error('❌ Erro ao verificar validade do token:', error.message);
        return {
            valido: false,
            motivo: 'Erro ao verificar validade',
            error: error.message,
            data: null
        };
    }
}

/**
 * Obtém o token atual (válido ou não)
 * @returns {Promise<string|null>} Token ou null
 */
async function obterTokenAtual() {
    try {
        const resultado = await lerToken();

        if (resultado.success && resultado.data && resultado.data.token) {
            return resultado.data.token;
        }

        return null;

    } catch (error) {
        console.error('❌ Erro ao obter token atual:', error.message);
        return null;
    }
}

/**
 * Deleta o arquivo de token
 * @returns {Promise<Object>} Resultado da operação
 */
async function deletarToken() {
    try {
        await fs.unlink(TOKEN_FILE_PATH);
        console.log('✅ Arquivo de token deletado');

        return {
            success: true,
            message: 'Token deletado com sucesso'
        };

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('⚠️ Arquivo de token não existe');
            return {
                success: true,
                message: 'Arquivo de token não existe'
            };
        }

        console.error('❌ Erro ao deletar token:', error.message);
        return {
            success: false,
            message: 'Erro ao deletar token',
            error: error.message
        };
    }
}

module.exports = {
    salvarToken,
    lerToken,
    verificarValidadeToken,
    obterTokenAtual,
    deletarToken
};
