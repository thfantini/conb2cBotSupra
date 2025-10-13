/**
 * Arquivo de exemplo para testar o módulo endpoint.js
 * 
 * Para executar:
 * node test-endpoint.js
 */

require('dotenv').config();
const endpoint = require('./src/config/endpoint');

/**
 * Testa conexão com a API
 */
async function testarConexao() {
    console.log('\n==========================================');
    console.log('🔍 TESTANDO CONEXÃO COM API EXTERNA');
    console.log('==========================================\n');
    
    const conectado = await endpoint.testConnection();
    
    if (conectado) {
        console.log('✅ API está acessível!\n');
    } else {
        console.log('❌ API não está acessível. Verifique as configurações.\n');
    }
    
    return conectado;
}

/**
 * Testa busca de cliente por celular
 */
async function testarBuscaPorCelular() {
    console.log('\n==========================================');
    console.log('📱 TESTANDO BUSCA POR CELULAR');
    console.log('==========================================\n');
    
    const celular = '5531994931105'; // Exemplo do documento
    console.log(`Buscando cliente com telefone: ${celular}\n`);
    
    const resultado = await endpoint.getClienteByCelular(celular);
    
    console.log('\n📊 RESULTADO:');
    console.log('─────────────────────────────────────────');
    console.log('Success:', resultado.success);
    console.log('Blocked:', resultado.blocked);
    console.log('Has Permission:', resultado.hasPermission);
    
    if (resultado.error) {
        console.log('\n❌ ERRO:');
        console.log(resultado.error);
    }
    
    if (resultado.success && resultado.data) {
        const cliente = resultado.data.data[0];
        console.log('\n✅ CLIENTE ENCONTRADO:');
        console.log('─────────────────────────────────────────');
        console.log('ID:', cliente.id);
        console.log('Nome:', cliente.nome);
        console.log('CNPJ:', cliente.cpfCnpj);
        console.log('Bloqueado:', cliente.bloqueado);
        
        if (resultado.contato) {
            console.log('\n👤 CONTATO AUTORIZADO:');
            console.log('─────────────────────────────────────────');
            console.log('Nome:', resultado.contato.nome);
            console.log('Email:', resultado.contato.email);
            console.log('Telefone:', resultado.contato.telefone);
            console.log('Email Faturamento:', resultado.contato.emailFaturamento);
        }
    }
    
    console.log('\n');
    return resultado;
}

/**
 * Testa busca de cliente por CNPJ
 */
async function testarBuscaPorCNPJ() {
    console.log('\n==========================================');
    console.log('🏢 TESTANDO BUSCA POR CNPJ');
    console.log('==========================================\n');
    
    const cnpj = '02.968.465/0001-66'; // Exemplo do documento
    console.log(`Buscando cliente com CNPJ: ${cnpj}\n`);
    
    const resultado = await endpoint.getClienteByCNPJ(cnpj);
    
    console.log('\n📊 RESULTADO:');
    console.log('─────────────────────────────────────────');
    console.log('Success:', resultado.success);
    console.log('Blocked:', resultado.blocked);
    console.log('Has Permission:', resultado.hasPermission);
    
    if (resultado.error) {
        console.log('\n❌ ERRO:');
        console.log(resultado.error);
    }
    
    if (resultado.message) {
        console.log('\n💬 MENSAGEM:');
        console.log(resultado.message);
    }
    
    if (resultado.success && resultado.data) {
        const cliente = resultado.data.data[0];
        console.log('\n✅ CLIENTE ENCONTRADO:');
        console.log('─────────────────────────────────────────');
        console.log('ID:', cliente.id);
        console.log('Nome:', cliente.nome);
        console.log('CNPJ:', cliente.cpfCnpj);
        console.log('Tipo Pessoa:', cliente.tipoPessoa);
        console.log('Bloqueado:', cliente.bloqueado);
        console.log('Total de Contatos:', cliente.contatos?.length || 0);
        
        if (cliente.contatos && cliente.contatos.length > 0) {
            console.log('\n👥 CONTATOS CADASTRADOS:');
            console.log('─────────────────────────────────────────');
            cliente.contatos.forEach((contato, index) => {
                console.log(`\nContato ${index + 1}:`);
                console.log(`  Nome: ${contato.nome}`);
                console.log(`  Email: ${contato.email || 'N/A'}`);
                console.log(`  Telefone: ${contato.telefone || 'N/A'}`);
                console.log(`  Email Faturamento: ${contato.emailFaturamento}`);
                console.log(`  Principal: ${contato.contatoPrincipal}`);
            });
        }
    }
    
    console.log('\n');
    return resultado;
}

/**
 * Testa cenário de cliente bloqueado
 */
async function testarClienteBloqueado() {
    console.log('\n==========================================');
    console.log('🚫 TESTANDO CENÁRIO: CLIENTE BLOQUEADO');
    console.log('==========================================\n');
    
    // Simula um retorno com cliente bloqueado
    const mockData = {
        data: [{
            id: 999,
            nome: 'CLIENTE TESTE BLOQUEADO',
            cpfCnpj: '00.000.000/0001-00',
            bloqueado: true,
            contatos: []
        }]
    };
    
    const resultado = endpoint.validarBloqueio(mockData);
    
    console.log('📊 RESULTADO DA VALIDAÇÃO:');
    console.log('─────────────────────────────────────────');
    console.log('Blocked:', resultado.blocked);
    console.log('\nMensagem para o usuário:');
    console.log(resultado.message);
    console.log('\n');
    
    return resultado;
}

/**
 * Testa cenário de sem permissão de faturamento
 */
async function testarSemPermissao() {
    console.log('\n==========================================');
    console.log('⚠️  TESTANDO CENÁRIO: SEM PERMISSÃO');
    console.log('==========================================\n');
    
    // Simula um retorno com contato sem permissão
    const mockData = {
        data: [{
            id: 999,
            nome: 'CLIENTE TESTE',
            cpfCnpj: '00.000.000/0001-00',
            bloqueado: false,
            contatos: [
                {
                    id: 1,
                    nome: 'Contato Teste',
                    telefone: '5531999999999',
                    email: 'teste@email.com',
                    emailFaturamento: false
                }
            ]
        }]
    };
    
    const telefone = '5531999999999';
    const resultado = endpoint.validarPermissaoFaturamento(mockData, telefone);
    
    console.log('📊 RESULTADO DA VALIDAÇÃO:');
    console.log('─────────────────────────────────────────');
    console.log('Has Permission:', resultado.hasPermission);
    console.log('\nMensagem para o usuário:');
    console.log(resultado.message);
    console.log('\n');
    
    return resultado;
}

/**
 * Executa todos os testes
 */
async function executarTodosTestes() {
    console.log('\n');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   TESTES DO MÓDULO ENDPOINT.JS         ║');
    console.log('╚════════════════════════════════════════╝');
    
    try {
        // Teste 1: Conexão
        await testarConexao();
        
        // Teste 2: Busca por celular
        await testarBuscaPorCelular();
        
        // Teste 3: Busca por CNPJ
        await testarBuscaPorCNPJ();
        
        // Teste 4: Cliente bloqueado
        await testarClienteBloqueado();
        
        // Teste 5: Sem permissão
        await testarSemPermissao();
        
        console.log('╔════════════════════════════════════════╗');
        console.log('║   ✅ TODOS OS TESTES CONCLUÍDOS        ║');
        console.log('╚════════════════════════════════════════╝\n');
        
    } catch (error) {
        console.error('\n❌ ERRO AO EXECUTAR TESTES:', error.message);
        console.error(error);
    }
}

// Executa os testes se o arquivo for executado diretamente
if (require.main === module) {
    executarTodosTestes();
}

module.exports = {
    testarConexao,
    testarBuscaPorCelular,
    testarBuscaPorCNPJ,
    testarClienteBloqueado,
    testarSemPermissao
};