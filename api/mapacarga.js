// api/mapacarga.js - Usando Supabase
const supabaseService = require('../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action, filtros, boxNum, cargaId, dados, dadosImportacao } = req.body;

    if (!action) return res.status(400).json({ ok: false, msg: 'Action é obrigatória' });

    switch (action) {
      case 'listar': {
        const dados = await supabaseService.getMapaCarga(filtros || {});
        return res.status(200).json({ ok: true, dados, total: dados.length });
      }

      case 'atualizar': {
        if (!dados || !dados.carga) {
          return res.status(400).json({ ok: false, msg: 'Dados da carga são obrigatórios' });
        }
        const result = await supabaseService.atualizarMapaCarga(dados.carga, dados.campos);
        return res.status(200).json(result);
      }

      case 'importar': {
        if (!dadosImportacao || !Array.isArray(dadosImportacao) || dadosImportacao.length === 0) {
          return res.status(400).json({ ok: false, msg: 'dadosImportacao deve ser um array não vazio' });
        }
        const result = await supabaseService.processarMapaCargaColado(dadosImportacao);
        return res.status(200).json(result);
      }

      case 'limpar': {
        const result = await supabaseService.limparColunasMapaCarga();
        return res.status(200).json(result);
      }

      case 'listarCargas': {
        const cargas = await supabaseService.getCargasSemBox(filtros || {});
        return res.status(200).json({ ok: true, cargas, total: cargas.length });
      }

      case 'listarBoxes': {
        const boxes = await supabaseService.getEstadoBoxes();
        return res.status(200).json({ ok: true, boxes, total: boxes.length });
      }

      case 'alocarBox': {
        if (!boxNum || !cargaId) {
          return res.status(400).json({ ok: false, msg: 'boxNum e cargaId são obrigatórios' });
        }
        const result = await supabaseService.alocarCargaBox(boxNum, cargaId);
        return res.status(200).json(result);
      }

      case 'liberarBox': {
        if (!boxNum) return res.status(400).json({ ok: false, msg: 'boxNum é obrigatório' });
        const result = await supabaseService.liberarBox(boxNum);
        return res.status(200).json(result);
      }

      default:
        return res.status(400).json({ ok: false, msg: 'Ação inválida: ' + action });
    }
  } catch (error) {
    console.error('[MAPACARGA] Erro geral:', error);
    return res.status(500).json({ ok: false, msg: 'Erro interno: ' + error.message });
  }
};
