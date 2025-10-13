// src/modules/scheduled-messages/services/scheduledEmailService.js
// CORREÇÃO CRÍTICA: Import correto do nodemailer

const nodemailer = require('nodemailer'); // ← IMPORT EXPLÍCITO ADICIONADO

/**
 * Serviço específico para envio de emails programados
 * VERSÃO CORRIGIDA - Evita quebrar a aplicação
 */
class ScheduledEmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.statistics = {
            totalEnvios: 0,
            totalSucessos: 0,
            totalFalhas: 0,
            ultimoEnvio: null
        };
        
        // CORREÇÃO: Inicialização não-bloqueante
        this.initializeAsync();
    }

    /**
     * Inicialização assíncrona que NÃO quebra a aplicação
     */
    async initializeAsync() {
        try {
            console.log('📧 [SCHEDULED-EMAIL] Inicializando configuração SMTP...');
            
            // SKIP se SMTP_HOST não definido
            if (!process.env.SMTP_HOST) {
                console.log('⏭️ [SCHEDULED-EMAIL] SMTP_HOST não definido, pularemos configuração');
                return;
            }

            // SKIP se marcado para pular teste
            if (process.env.SKIP_SMTP_TEST === 'true') {
                console.log('⏭️ [SCHEDULED-EMAIL] SKIP_SMTP_TEST=true, pularemos teste');
                return;
            }

            // Configuração SMTP robusta
            const smtpConfig = {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                // Timeouts para evitar travamento
                connectionTimeout: 5000,   // 5s
                greetingTimeout: 3000,     // 3s 
                socketTimeout: 5000,       // 5s
                pool: false               // Sem pool
            };

            console.log(`🔍 [SCHEDULED-EMAIL] Testando conexão com ${smtpConfig.host}:${smtpConfig.port}...`);
            console.log(`🔒 [SCHEDULED-EMAIL] Secure: ${smtpConfig.secure}, Timeout: 5000ms`);

            // VERIFICAÇÃO: nodemailer está disponível?
            if (typeof nodemailer === 'undefined') {
                throw new Error('Módulo nodemailer não está disponível');
            }

            this.transporter = nodemailer.createTransporter(smtpConfig);

            // Teste com timeout manual para evitar travamento
            await this.testConnectionWithTimeout(5000);

            this.isConfigured = true;
            console.log('✅ [SCHEDULED-EMAIL] SMTP configurado com sucesso');

        } catch (error) {
            console.error(`❌ [SCHEDULED-EMAIL] Erro na configuração SMTP: ${error.message}`);
            console.log('⚠️ [SCHEDULED-EMAIL] Continuando sem SMTP em produção...');
            
            // NÃO quebrar a aplicação
            this.isConfigured = false;
            this.transporter = null;
        }
    }

    /**
     * Teste de conexão com timeout manual
     */
    async testConnectionWithTimeout(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout de ${timeoutMs}ms na verificação SMTP`));
            }, timeoutMs);

            this.transporter.verify((error, success) => {
                clearTimeout(timeout);
                
                if (error) {
                    reject(new Error(`Falha na verificação SMTP: ${error.message}`));
                } else {
                    resolve(success);
                }
            });
        });
    }

    /**
     * Verifica se está configurado
     */
    get configured() {
        return this.isConfigured && this.transporter !== null;
    }

    /**
     * Método principal para envio de email (simplificado)
     */
    async enviarEmailBoletos(dadosEnvio) {
        try {
            if (!this.configured) {
                console.log('⚠️ [SCHEDULED-EMAIL] Serviço não configurado, ignorando envio');
                return {
                    success: false,
                    error: 'Serviço de email não configurado',
                    skipped: true
                };
            }

            const { cliente, boletos, mensagem } = dadosEnvio;
            
            console.log(`📧 [SCHEDULED-EMAIL] Enviando para: ${cliente.nome} (${cliente.email})`);

            const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: cliente.email,
                subject: `${process.env.COMPANY_NAME || 'Sistema'} - Boletos Disponíveis`,
                html: this.criarTemplateHTML(cliente, boletos, mensagem),
                text: `Olá ${cliente.nome}, você possui ${boletos.length} boleto(s) disponível(is).`
            };

            const info = await this.transporter.sendMail(mailOptions);

            this.statistics.totalSucessos++;
            console.log(`✅ [SCHEDULED-EMAIL] Email enviado: ${info.messageId}`);

            return {
                success: true,
                messageId: info.messageId,
                email: cliente.email
            };

        } catch (error) {
            this.statistics.totalFalhas++;
            console.error(`❌ [SCHEDULED-EMAIL] Erro ao enviar email:`, error.message);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Criar template HTML básico
     */
    criarTemplateHTML(cliente, boletos, mensagem) {
        const boletosHtml = boletos.map(boleto => `
            <div style="border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
                <strong>Boleto:</strong> ${boleto.numero || 'N/A'}<br>
                <strong>Vencimento:</strong> ${boleto.dataVencimento || 'N/A'}<br>
                <strong>Valor:</strong> R$ ${(boleto.valor || 0).toFixed(2)}<br>
                <strong>Linha Digitável:</strong><br>
                <code style="font-family: monospace; background: #f5f5f5; padding: 5px;">
                    ${boleto.linhaDigitavel || 'N/A'}
                </code>
            </div>
        `).join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Boletos - ${process.env.COMPANY_NAME || 'Sistema'}</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #007bff;">Olá, ${cliente.nome}!</h2>
            <p>${mensagem || 'Você possui boletos disponíveis:'}</p>
            ${boletosHtml}
            <hr>
            <p><small>
                Enviado automaticamente por ${process.env.COMPANY_NAME || 'Sistema'}<br>
                Data: ${new Date().toLocaleString('pt-BR')}
            </small></p>
        </body>
        </html>
        `;
    }

    /**
     * Validação básica de email
     */
    validarEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    /**
     * Health check do serviço
     */
    async healthCheck() {
        return {
            configured: this.configured,
            statistics: this.statistics,
            host: process.env.SMTP_HOST || 'não configurado'
        };
    }

    /**
     * Recarregar configuração
     */
    async recarregarConfiguracao() {
        console.log('🔄 [SCHEDULED-EMAIL] Recarregando configuração...');
        this.isConfigured = false;
        this.transporter = null;
        await this.initializeAsync();
        return this.configured;
    }
}

// Export singleton
module.exports = new ScheduledEmailService();