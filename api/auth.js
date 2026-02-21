// api/auth.js - Usando Supabase
const supabaseService = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { usuario, senha, action } = req.body;

    if (!action) return res.status(400).json({ ok: false, msg: 'Ação não especificada' });

    // LOGIN
    if (action === 'login') {
      if (!usuario || !senha) {
        return res.status(400).json({ ok: false, msg: 'Usuário e senha são obrigatórios' });
      }
      console.log(`[AUTH] Tentativa de login: ${usuario}`);
      const result = await supabaseService.validarLogin(usuario, senha);
      return res.status(200).json(result);
    }

    // TESTE DE CONEXÃO
    if (action === 'test') {
      try {
        const client = supabaseService.client;
        const { data, error } = await client.from('usuarios').select('count').limit(1);
        if (error) throw error;
        return res.status(200).json({ ok: true, msg: 'Conectado ao Supabase com sucesso!' });
      } catch (e) {
        return res.status(500).json({ ok: false, msg: 'Erro ao conectar: ' + e.message });
      }
    }

    // CRIAR DADOS DE TESTE
    if (action === 'createTestData') {
      const client = supabaseService.client;

      // Usuarios
      const { count: countUsers } = await client
        .from('usuarios').select('*', { count: 'exact', head: true });

      if (countUsers === 0) {
        await client.from('usuarios').insert([
          { usuario: 'admin', senha: '123', aba: 'PCP_Gestão' },
          { usuario: 'supervisor1', senha: '456', aba: 'WMS TA' },
          { usuario: 'supervisor2', senha: '789', aba: 'WMS TB' },
          { usuario: 'admin', senha: '123', aba: 'Separação TB' }
        ]);
      }

      // Quadro
      const { count: countQuadro } = await client
        .from('quadro').select('*', { count: 'exact', head: true });

      if (countQuadro === 0) {
        await client.from('quadro').insert([
          { matricula: '001', nome: 'João Silva', funcao_atua: 'Operador' },
          { matricula: '002', nome: 'Maria Santos', funcao_atua: 'Supervisora' },
          { matricula: '003', nome: 'Pedro Costa', funcao_atua: 'Operador' },
          { matricula: '004', nome: 'Ana Oliveira', funcao_atua: 'Analista' },
          { matricula: '005', nome: 'Carlos Souza', funcao_atua: 'Operador' }
        ]);
      }

      return res.status(200).json({ ok: true, msg: 'Dados de teste criados com sucesso!' });
    }

    return res.status(400).json({
      error: 'Ação não reconhecida',
      validActions: ['login', 'test', 'createTestData']
    });

  } catch (error) {
    console.error('[AUTH] Erro geral:', error);
    return res.status(500).json({ error: 'Erro interno', details: error.message });
  }
};
