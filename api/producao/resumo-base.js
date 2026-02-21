// api/producao/resumo-base.js - Usando Supabase
const supabaseService = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, msg: 'Método não permitido' });

  try {
    console.log('[RESUMO-BASE] Query:', req.query);

    // ===== CALCULA DATA DE FILTRO =====
    let dataFiltroISO;   // YYYY-MM-DD (para Supabase)
    let dataFiltroBR;    // DD/MM/YYYY (para exibição)

    if (req.query.data) {
      // Frontend envia YYYY-MM-DD
      const [ano, mes, dia] = req.query.data.split('-');
      dataFiltroISO = `${ano}-${mes}-${dia}`;
      dataFiltroBR = `${dia}/${mes}/${ano}`;
    } else {
      const hoje = new Date();
      const dia = String(hoje.getDate()).padStart(2, '0');
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const ano = hoje.getFullYear();
      dataFiltroISO = `${ano}-${mes}-${dia}`;
      dataFiltroBR = `${dia}/${mes}/${ano}`;
    }

    console.log(`[RESUMO-BASE] Filtrando data: ${dataFiltroISO}`);

    // ===== CARREGA REGISTROS DA BASE =====
    const { data: rowsBase, error: errBase } = await supabaseService.client
      .from('base')
      .select('supervisor, aba, matricula, nome, funcao, status, desvio, data')
      .eq('data', dataFiltroISO);

    if (errBase) throw errBase;
    console.log(`[RESUMO-BASE] ${rowsBase.length} registros encontrados`);

    // ===== CARREGA QLP PARA ENRIQUECER DADOS =====
    const mapaQLP = await supabaseService.getMapaQLP();

    // ===== MODO: DADOS BRUTOS (para producao.html) =====
    if (req.query.modo === 'dados') {
      const dados = rowsBase.map(row => {
        const matricula = String(row.matricula || '').trim();
        let secao = 'Sem Seção';
        let turno = 'Não definido';

        if (mapaQLP[matricula]) {
          secao = mapaQLP[matricula].secao || secao;
          turno = mapaQLP[matricula].turno || turno;
        }

        if (turno === 'Não definido' && row.aba) {
          const abaLower = row.aba.toLowerCase();
          if (abaLower.includes('ta') || abaLower.includes('turno a')) turno = 'Turno A';
          else if (abaLower.includes('tb') || abaLower.includes('turno b')) turno = 'Turno B';
          else if (abaLower.includes('tc') || abaLower.includes('turno c')) turno = 'Turno C';
        }

        return {
          supervisor: row.supervisor || '',
          aba: row.aba || '',
          matricula,
          nome: row.nome || '',
          funcao: row.funcao || '',
          status: row.status || '',
          data: dataFiltroBR,
          secao,
          turno
        };
      });

      return res.status(200).json({
        ok: true,
        dados,
        total: dados.length,
        dataFiltro: dataFiltroBR,
        timestamp: new Date().toISOString()
      });
    }

    // ===== MODO: RESUMO =====
    const resumoPorSupervisor = {};
    const resumoPorFuncao = {};
    const resumoGeral = {
      total: 0, presente: 0, ausente: 0, atestado: 0,
      ferias: 0, folga: 0, afastado: 0, desvio: 0, outros: 0
    };

    rowsBase.forEach(row => {
      if (!row.nome) return;

      const supervisor = String(row.supervisor || 'Sem supervisor').trim();
      const aba = String(row.aba || '').trim();
      const funcao = String(row.funcao || 'Não informada').trim();
      const status = String(row.status || 'Outro').trim();
      const desvio = String(row.desvio || '').trim();
      const nome = String(row.nome || '').trim();
      const matricula = String(row.matricula || '').trim();
      const statusLower = status.toLowerCase();

      let turno = 'Não informado';
      if (mapaQLP[matricula]) turno = mapaQLP[matricula].turno || turno;
      if (turno === 'Não informado' && aba) {
        const abaLower = aba.toLowerCase();
        if (abaLower.includes('ta')) turno = 'Turno A';
        else if (abaLower.includes('tb')) turno = 'Turno B';
        else if (abaLower.includes('tc')) turno = 'Turno C';
      }

      const contarStatus = (obj) => {
        obj.total++;
        if (statusLower === 'presente') obj.presente++;
        else if (statusLower === 'ausente') obj.ausente++;
        else if (statusLower === 'atestado') obj.atestado++;
        else if (statusLower.includes('férias') || statusLower.includes('ferias')) obj.ferias++;
        else if (statusLower === 'folga') obj.folga++;
        else if (statusLower === 'afastado') obj.afastado++;
        else obj.outros++;
        if (desvio.toLowerCase() === 'desvio') obj.desvio++;
      };

      // Por Supervisor
      if (!resumoPorSupervisor[supervisor]) {
        resumoPorSupervisor[supervisor] = {
          supervisor, total: 0, presente: 0, ausente: 0,
          atestado: 0, ferias: 0, folga: 0, afastado: 0, desvio: 0, outros: 0,
          porFuncao: {}, colaboradores: []
        };
      }
      contarStatus(resumoPorSupervisor[supervisor]);
      resumoPorSupervisor[supervisor].colaboradores.push({ nome, matricula, funcao, turno, status, desvio });

      if (!resumoPorSupervisor[supervisor].porFuncao[funcao]) {
        resumoPorSupervisor[supervisor].porFuncao[funcao] = { total: 0, presente: 0, ausente: 0 };
      }
      resumoPorSupervisor[supervisor].porFuncao[funcao].total++;
      if (statusLower === 'presente') resumoPorSupervisor[supervisor].porFuncao[funcao].presente++;
      else resumoPorSupervisor[supervisor].porFuncao[funcao].ausente++;

      // Por Função
      if (!resumoPorFuncao[funcao]) {
        resumoPorFuncao[funcao] = {
          funcao, total: 0, presente: 0, ausente: 0,
          atestado: 0, ferias: 0, folga: 0, afastado: 0, desvio: 0, outros: 0,
          porSupervisor: {}, colaboradores: []
        };
      }
      contarStatus(resumoPorFuncao[funcao]);
      resumoPorFuncao[funcao].colaboradores.push({ nome, matricula, supervisor, turno, status, desvio });

      // Geral
      contarStatus(resumoGeral);
    });

    if (resumoGeral.total > 0) {
      resumoGeral.percentualPresente = ((resumoGeral.presente / resumoGeral.total) * 100).toFixed(1);
      resumoGeral.percentualAusente = (((resumoGeral.total - resumoGeral.presente) / resumoGeral.total) * 100).toFixed(1);
      resumoGeral.percentualDesvio = ((resumoGeral.desvio / resumoGeral.total) * 100).toFixed(1);
    }

    const supervisores = Object.values(resumoPorSupervisor).sort((a, b) => a.supervisor.localeCompare(b.supervisor));
    const funcoes = Object.values(resumoPorFuncao).sort((a, b) => a.funcao.localeCompare(b.funcao));

    return res.status(200).json({
      ok: true,
      dataReferencia: dataFiltroBR,
      resumoGeral,
      porSupervisor: supervisores,
      porFuncao: funcoes,
      totais: { supervisores: supervisores.length, funcoes: funcoes.length, colaboradores: resumoGeral.total },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[RESUMO-BASE] Erro:', error);
    return res.status(500).json({ ok: false, msg: 'Erro ao gerar dados', details: error.message });
  }
};  
