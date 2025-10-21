/**
 * Script de teste para validar o webhook com formato Evolution API 2.3.6
 *
 * Execute: node src/testes/teste-webhook-evolution-2.3.6.js
 */

const axios = require('axios');

// Configurações
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000';
const ENDPOINT = `${WEBHOOK_URL}/webhook/message`;

/**
 * Body exatamente como recebido da Evolution API 2.3.6
 */
const bodyEvolution236 = {
    "event": "messages.upsert",
    "instance": "FOX",
    "data": {
        "key": {
            "remoteJid": "5531994931105@s.whatsapp.net",
            "remoteJidAlt": "268525818097698@lid",
            "fromMe": false,
            "id": "3EB0E5743EB31D6858A320",
            "participant": "",
            "addressingMode": "pn"
        },
        "pushName": "Desenvolvimento Web",
        "status": "DELIVERY_ACK",
        "message": {
            "conversation": "ola",
            "messageContextInfo": {
                "deviceListMetadata": {
                    "senderKeyIndexes": [],
                    "recipientKeyIndexes": [],
                    "senderKeyHash": {
                        "0": 126,
                        "1": 243,
                        "2": 64,
                        "3": 233,
                        "4": 10,
                        "5": 95,
                        "6": 48,
                        "7": 200,
                        "8": 141,
                        "9": 145
                    },
                    "senderTimestamp": {
                        "low": 1761072436,
                        "high": 0,
                        "unsigned": true
                    },
                    "senderAccountType": 0,
                    "receiverAccountType": 0,
                    "recipientKeyHash": {
                        "0": 70,
                        "1": 105,
                        "2": 165,
                        "3": 97,
                        "4": 127,
                        "5": 104,
                        "6": 12,
                        "7": 32,
                        "8": 20,
                        "9": 163
                    },
                    "recipientTimestamp": {
                        "low": 1761065817,
                        "high": 0,
                        "unsigned": true
                    }
                },
                "deviceListMetadataVersion": 2,
                "messageSecret": {
                    "0": 118,
                    "1": 151,
                    "2": 250,
                    "3": 209,
                    "4": 252,
                    "5": 148,
                    "6": 215,
                    "7": 130,
                    "8": 159,
                    "9": 96,
                    "10": 26,
                    "11": 101,
                    "12": 157,
                    "13": 202,
                    "14": 161,
                    "15": 17,
                    "16": 227,
                    "17": 31,
                    "18": 236,
                    "19": 11,
                    "20": 84,
                    "21": 133,
                    "22": 28,
                    "23": 164,
                    "24": 33,
                    "25": 199,
                    "26": 131,
                    "27": 124,
                    "28": 38,
                    "29": 134,
                    "30": 246,
                    "31": 134
                }
            }
        },
        "messageType": "conversation",
        "messageTimestamp": 1761074391,
        "instanceId": "7a429403-e0d0-4ed7-87c8-7ae77f448f73",
        "source": "web"
    },
    "destination": "https://foxsoft.com.br/_ConGateway/whapi/webhook.php",
    "date_time": "2025-10-21T16:19:52.170Z",
    "sender": "553182363608@s.whatsapp.net",
    "server_url": "https://api.conb2b.com.br",
    "apikey": "BD2B651C6AEC-47E4-8E99-D1BA9C7B3AA8"
};

/**
 * Envia requisição de teste
 */
async function testarWebhook() {
    console.log('='.repeat(80));
    console.log('🧪 TESTE DE WEBHOOK - EVOLUTION API 2.3.6');
    console.log('='.repeat(80));
    console.log('');
    console.log(`📡 Endpoint: ${ENDPOINT}`);
    console.log('');
    console.log('📦 Body enviado:');
    console.log(JSON.stringify(bodyEvolution236, null, 2));
    console.log('');
    console.log('🔄 Enviando requisição...');
    console.log('');

    try {
        const response = await axios.post(ENDPOINT, bodyEvolution236, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log('✅ Resposta recebida:');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        console.log('');
        console.log('='.repeat(80));
        console.log('✅ TESTE CONCLUÍDO COM SUCESSO');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('❌ Erro na requisição:');

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else if (error.request) {
            console.error('Sem resposta do servidor');
            console.error('Mensagem:', error.message);
        } else {
            console.error('Erro:', error.message);
        }

        console.log('');
        console.log('='.repeat(80));
        console.log('❌ TESTE FALHOU');
        console.log('='.repeat(80));

        process.exit(1);
    }
}

/**
 * Informações sobre o teste
 */
function exibirInformacoes() {
    console.log('');
    console.log('📋 INFORMAÇÕES DO TESTE');
    console.log('-'.repeat(80));
    console.log('');
    console.log('Este teste simula exatamente o body recebido da Evolution API 2.3.6');
    console.log('');
    console.log('Principais características do novo formato:');
    console.log('  • Campo "event": "messages.upsert"');
    console.log('  • Campo "instance": nome da instância');
    console.log('  • Campo "data": objeto único com key, message, etc');
    console.log('  • Mensagem em: data.message.conversation');
    console.log('');
    console.log('Diferenças do formato anterior:');
    console.log('  • Antes: { data: [ { key, message } ] }');
    console.log('  • Agora: { event, instance, data: { key, message } }');
    console.log('');
    console.log('-'.repeat(80));
    console.log('');
}

// Executar teste
exibirInformacoes();
testarWebhook();
