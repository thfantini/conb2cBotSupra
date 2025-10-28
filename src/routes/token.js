const express = require('express');
const router = express.Router();
const scheduledTokenService = require('../services/scheduledTokenService');
const tokenManager = require('../services/tokenManagerService');
const endpoint = require('../config/endpoint');

/**
 * Rotas para gerenciamento do token ERP
 */

/**
 * GET /token/status
 * Obtém status do serviço de renovação de token
 */
router.get('/status', async (req, res) => {
    try {
        const serviceStatus = scheduledTokenService.obterStatus();
        const tokenValidity = await tokenManager.verificarValidadeToken();

        res.json({
            success: true,
            data: {
                service: serviceStatus,
                token: {
                    valido: tokenValidity.valido,
                    motivo: tokenValidity.motivo,
                    dataValidade: tokenValidity.dataValidade,
                    diasRestantes: tokenValidity.diasRestantes
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /token/current
 * Obtém informações do token atual
 */
router.get('/current', async (req, res) => {
    try {
        const resultado = await tokenManager.lerToken();

        if (!resultado.success) {
            return res.status(404).json({
                success: false,
                error: resultado.message
            });
        }

        res.json({
            success: true,
            data: {
                token: resultado.data.token,
                dataValidade: resultado.data.dataValidadeToken || resultado.data.dataValidade,
                dataGeracao: resultado.data.dataGeracao,
                ultimaAtualizacao: resultado.data.ultimaAtualizacao,
                usuario: resultado.data.usuario
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /token/renew
 * Força a renovação imediata do token
 */
router.post('/renew', async (req, res) => {
    try {
        console.log('🔄 Renovação manual do token solicitada via API');

        const resultado = await scheduledTokenService.executarAgora();

        if (!resultado.success) {
            return res.status(500).json({
                success: false,
                error: resultado.error,
                message: resultado.message
            });
        }

        res.json({
            success: true,
            message: resultado.message,
            renovado: resultado.renovado,
            data: {
                token: resultado.token,
                dataValidade: resultado.dataValidade,
                diasRestantes: resultado.diasRestantes
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /token/generate
 * Gera um novo token diretamente (sem usar o serviço agendado)
 */
router.post('/generate', async (req, res) => {
    try {
        console.log('🔄 Geração manual de token solicitada via API');

        // Gerar novo token
        const resultadoToken = await endpoint.gerarTokenERP();

        if (!resultadoToken.success) {
            return res.status(500).json({
                success: false,
                error: resultadoToken.error
            });
        }

        // Salvar token
        const resultadoSalvar = await tokenManager.salvarToken(resultadoToken.data);

        if (!resultadoSalvar.success) {
            return res.status(500).json({
                success: false,
                error: resultadoSalvar.error,
                message: 'Token gerado mas não foi possível salvar'
            });
        }

        res.json({
            success: true,
            message: 'Token gerado e salvo com sucesso',
            data: {
                token: resultadoToken.data.token,
                dataValidade: resultadoToken.data.dataValidadeToken,
                appVersion: resultadoToken.data.appVersion,
                usuario: resultadoToken.data.usuario
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /token
 * Remove o token atual
 */
router.delete('/', async (req, res) => {
    try {
        const resultado = await tokenManager.deletarToken();

        res.json({
            success: resultado.success,
            message: resultado.message
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /token/service/start
 * Inicia o serviço de renovação automática
 */
router.post('/service/start', (req, res) => {
    try {
        const resultado = scheduledTokenService.iniciar();

        if (resultado) {
            const status = scheduledTokenService.obterStatus();
            res.json({
                success: true,
                message: 'Serviço de renovação iniciado',
                data: status
            });
        } else {
            res.json({
                success: false,
                message: 'Serviço já está em execução'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /token/service/stop
 * Para o serviço de renovação automática
 */
router.post('/service/stop', (req, res) => {
    try {
        const resultado = scheduledTokenService.parar();

        if (resultado) {
            res.json({
                success: true,
                message: 'Serviço de renovação parado'
            });
        } else {
            res.json({
                success: false,
                message: 'Serviço não está em execução'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /token/service/reset-stats
 * Reseta as estatísticas do serviço
 */
router.post('/service/reset-stats', (req, res) => {
    try {
        scheduledTokenService.resetarEstatisticas();

        res.json({
            success: true,
            message: 'Estatísticas resetadas com sucesso'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
