// api/colaboradores.js - Usando Supabase
const supabaseService = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET - busca de colaboradores
    if (req.method === 'GET') {
      const filtro = req.query.filtro || '';
      const lista = await supabaseService.buscarColaboradores(filtro);
      return res.status(200).json(lista);
    }

    // POST - ações
    if (req.method === 'POST') {
      const { action, supervisor, aba, colaborador, matricula, status, desvio, dados } = req.body;

      switch (action) {
        case 'addBuffer': {
          const result = await supabaseService.adicionarBuffer(supervisor, aba, colaborador);
          return res.status(200).json(result);
        }

        case 'getBuffer': {
          const buffer = await supabaseService.getBuffer(supervisor, aba);
          return res.status(200).json(buffer);
        }

        case 'removeBuffer': {
          const result = await supabaseService.removerBuffer(supervisor, matricula);
          return res.status(200).json(result);
        }

        case 'updateStatus': {
          const result = await supabaseService.atualizarStatusBuffer(supervisor, matricula, status);
          return res.status(200).json(result);
        }

        case 'updateDesvio': {
          const result = await supabaseService.atualizarDesvioBufferPorAba(supervisor, matricula, desvio);
          return res.status(200).json(result);
        }

        case 'saveToBase': {
          const result = await supabaseService.salvarNaBase(dados);
          return res.status(200).json(result);
        }

        default:
          return res.status(400).json({ error: 'Ação inválida' });
      }
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[COLABORADORES] Erro:', error);
    return res.status(500).json({ error: 'Erro interno', details: error.message });
  }
};    
