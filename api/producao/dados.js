// api/producao/dados.js - Usando Supabase
const supabaseService = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, msg: 'Método não permitido' });

  try {
    const { tipo } = req.query;

    if (tipo === 'meta') {
      const dados = await supabaseService.getMetaProducao();
      return res.status(200).json({ ok: true, dados, total: dados.length });
    }

    if (tipo === 'produtividade') {
      const dados = await supabaseService.getProdutividadeHora();
      return res.status(200).json({ ok: true, dados, total: dados.length });
    }

    return res.status(400).json({ ok: false, msg: 'Tipo não especificado (meta ou produtividade)' });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao buscar dados', details: error.message });
  }
};
