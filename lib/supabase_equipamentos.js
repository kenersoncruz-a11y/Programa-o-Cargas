// lib/supabase_equipamentos.js - Substitui lib/sheets_2.js
// Serviço para Coletores e Chaves usando Supabase
const supabaseService = require('./supabase');

class SupabaseEquipamentosService {

  // ============================================================
  // COLETORES
  // ============================================================

  async obterDados() {
    return supabaseService.buscarColaboradores('');
  }

  async salvarRegistro(chapa, nome, funcao, numeroColetor, tipoOperacao, situacoes) {
    return supabaseService.salvarRegistroColetor(chapa, nome, funcao, numeroColetor, tipoOperacao, situacoes);
  }

  async obterColetorStatus() {
    return supabaseService.obterColetorStatus();
  }

  async gerarResumoColetores() {
    try {
      const statusMap = await this.obterColetorStatus();
      let disponiveis = 0, indisponiveis = 0, quebrados = 0;

      for (const coletor in statusMap) {
        const s = statusMap[coletor];
        if (s.tipo === 'Entrega' && s.situacao === 'OK') disponiveis++;
        else if (s.tipo === 'Retirada') indisponiveis++;
        if (s.situacao !== 'OK') quebrados++;
      }

      return { disponiveis, indisponiveis, quebrados, total: Object.keys(statusMap).length };
    } catch (error) {
      return { disponiveis: 0, indisponiveis: 0, quebrados: 0, total: 0 };
    }
  }

  async gerarResumoPorSupervisor() {
    try {
      const { data, error } = await supabaseService.client
        .from('historico_coletor')
        .select('numero_coletor, supervisor, tipo_operacao')
        .order('id', { ascending: false });

      if (error) throw error;

      const resumo = {};
      const coletoresContados = new Set();

      for (const row of (data || [])) {
        if (!row.numero_coletor || coletoresContados.has(row.numero_coletor)) continue;
        coletoresContados.add(row.numero_coletor);

        const sup = row.supervisor || 'Sem Supervisor';
        if (!resumo[sup]) resumo[sup] = { retiradaContada: 0 };
        if (row.tipo_operacao === 'Retirada') resumo[sup].retiradaContada++;
      }

      return resumo;
    } catch (error) {
      return {};
    }
  }

  // ============================================================
  // CHAVES
  // ============================================================

  async salvarRegistroChave(chapa, nome, funcao, numeroChave, tipoOperacao, situacoes) {
    return supabaseService.salvarRegistroChave(chapa, nome, funcao, numeroChave, tipoOperacao, situacoes);
  }

  async obterChaveStatus() {
    return supabaseService.obterChaveStatus();
  }

  async gerarResumoChaves() {
    try {
      const statusMap = await this.obterChaveStatus();
      let disponiveis = 0, indisponiveis = 0, problemas = 0;

      for (const chave in statusMap) {
        const s = statusMap[chave];
        if (s.tipo === 'Entrega' && s.situacao === 'OK') disponiveis++;
        else if (s.tipo === 'Retirada') indisponiveis++;
        if (s.situacao !== 'OK') problemas++;
      }

      return { disponiveis, indisponiveis, problemas, total: Object.keys(statusMap).length };
    } catch (error) {
      return { disponiveis: 0, indisponiveis: 0, problemas: 0, total: 0 };
    }
  }

  async gerarResumoPorSupervisorChaves() {
    try {
      const { data, error } = await supabaseService.client
        .from('historico_chaves')
        .select('numero_chave, supervisor, tipo_operacao')
        .order('id', { ascending: false });

      if (error) throw error;

      const resumo = {};
      const chavesContadas = new Set();

      for (const row of (data || [])) {
        if (!row.numero_chave || chavesContadas.has(row.numero_chave)) continue;
        chavesContadas.add(row.numero_chave);

        const sup = row.supervisor || 'Sem Supervisor';
        if (!resumo[sup]) resumo[sup] = { retiradaContada: 0 };
        if (row.tipo_operacao === 'Retirada') resumo[sup].retiradaContada++;
      }

      return resumo;
    } catch (error) {
      return {};
    }
  }
}

module.exports = new SupabaseEquipamentosService();
