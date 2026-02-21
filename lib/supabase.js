// lib/supabase.js - Substitui lib/sheets.js
// Serviço principal de banco de dados usando Supabase
const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    this._client = null;
  }

  get client() {
    if (!this._client) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url || !key) {
        throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
      }

      this._client = createClient(url, key, {
        auth: { persistSession: false }
      });
    }
    return this._client;
  }

  // ============================================================
  // AUTH
  // ============================================================

  async validarLogin(usuario, senha) {
    try {
      const { data, error } = await this.client
        .from('usuarios')
        .select('aba')
        .eq('usuario', usuario)
        .eq('senha', senha);

      if (error) throw error;
      if (!data || data.length === 0) return { ok: false, msg: 'Login inválido' };

      const abas = [...new Set(data.map(r => r.aba).filter(Boolean))];
      return abas.length > 0
        ? { ok: true, usuario, abas }
        : { ok: false, msg: 'Login inválido' };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  }

  // ============================================================
  // COLABORADORES / QUADRO
  // ============================================================

  async buscarColaboradores(filtro = '') {
    try {
      let query = this.client
        .from('quadro')
        .select('matricula, nome, funcao_atua')
        .order('nome');

      if (filtro) {
        query = query.or(
          `nome.ilike.%${filtro}%,matricula.ilike.%${filtro}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(r => ({
        matricula: r.matricula || '',
        nome: r.nome || '',
        funcao: r.funcao_atua || ''
      }));
    } catch (error) {
      console.error('[SUPABASE] Erro buscarColaboradores:', error);
      return [];
    }
  }

  // ============================================================
  // BUFFER (Lista)
  // ============================================================

  async adicionarBuffer(supervisor, aba, colaborador) {
    try {
      // Verifica duplicata
      const { data: existe } = await this.client
        .from('lista')
        .select('id')
        .eq('supervisor', supervisor)
        .eq('grupo', aba)
        .eq('matricula', String(colaborador.matricula))
        .maybeSingle();

      if (existe) return { ok: true, msg: 'Colaborador já está na lista' };

      const { error } = await this.client.from('lista').insert({
        supervisor,
        grupo: aba,
        matricula: String(colaborador.matricula),
        nome: colaborador.nome,
        funcao: colaborador.funcao,
        status: '',
        desvio: ''
      });

      if (error) throw error;
      return { ok: true };
    } catch (error) {
      console.error('[SUPABASE] Erro adicionarBuffer:', error);
      return { ok: false, msg: error.message };
    }
  }

  async getBuffer(supervisor, aba) {
    try {
      const { data, error } = await this.client
        .from('lista')
        .select('matricula, nome, funcao, status, desvio')
        .eq('supervisor', supervisor)
        .eq('grupo', aba)
        .order('nome');

      if (error) throw error;
      return (data || []).map(r => ({
        matricula: r.matricula || '',
        nome: r.nome || '',
        funcao: r.funcao || '',
        status: r.status || '',
        desvio: r.desvio || ''
      }));
    } catch (error) {
      console.error('[SUPABASE] Erro getBuffer:', error);
      return [];
    }
  }

  async removerBuffer(supervisor, matricula) {
    try {
      const { error } = await this.client
        .from('lista')
        .delete()
        .eq('supervisor', supervisor)
        .eq('matricula', String(matricula));

      if (error) throw error;
      return { ok: true };
    } catch (error) {
      console.error('[SUPABASE] Erro removerBuffer:', error);
      return { ok: false };
    }
  }

  async atualizarStatusBuffer(supervisor, matricula, status) {
    try {
      const { error } = await this.client
        .from('lista')
        .update({ status })
        .eq('supervisor', supervisor)
        .eq('matricula', String(matricula));

      if (error) throw error;
      return { ok: true };
    } catch (error) {
      console.error('[SUPABASE] Erro atualizarStatusBuffer:', error);
      return { ok: false };
    }
  }

  async removerBufferPorAba(chave, matricula) {
    try {
      const { error } = await this.client
        .from('lista')
        .delete()
        .or(`supervisor.eq.${chave},grupo.eq.${chave}`)
        .eq('matricula', String(matricula));

      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  }

  async atualizarStatusBufferPorAba(chave, matricula, status) {
    try {
      const { error } = await this.client
        .from('lista')
        .update({ status })
        .or(`supervisor.eq.${chave},grupo.eq.${chave}`)
        .eq('matricula', String(matricula));

      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  }

  async atualizarDesvioBufferPorAba(chave, matricula, desvio) {
    try {
      const { error } = await this.client
        .from('lista')
        .update({ desvio })
        .or(`supervisor.eq.${chave},grupo.eq.${chave}`)
        .eq('matricula', String(matricula));

      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  }

  // ============================================================
  // BASE (Registros de Presença)
  // ============================================================

  async salvarNaBase(dados) {
    try {
      const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      let totalNovos = 0;
      let totalAtualizados = 0;

      for (const linha of dados) {
        const [sup, aba, matricula, nome, funcao, status, desvio] = linha;
        if (!matricula && !nome) continue;

        // Verifica se já existe registro hoje para esse supervisor+matricula
        const { data: existente } = await this.client
          .from('base')
          .select('id')
          .eq('supervisor', sup)
          .eq('data', hoje)
          .eq('matricula', matricula)
          .maybeSingle();

        if (existente) {
          await this.client
            .from('base')
            .update({ status, desvio: desvio || '' })
            .eq('id', existente.id);
          totalAtualizados++;
        } else {
          await this.client.from('base').insert({
            supervisor: sup,
            aba,
            matricula,
            nome,
            funcao,
            status,
            desvio: desvio || '',
            data: hoje
          });
          totalNovos++;
        }
      }

      return {
        ok: true,
        msg: `${totalNovos} novos, ${totalAtualizados} atualizados`,
        totais: { novos: totalNovos, atualizados: totalAtualizados }
      };
    } catch (error) {
      console.error('[SUPABASE] Erro salvarNaBase:', error);
      return { ok: false, msg: error.message };
    }
  }

  // ============================================================
  // MAPA DE CARGA
  // ============================================================

  async getMapaCarga(filtros = {}) {
    try {
      const { data, error } = await this.client
        .from('mapa_carga')
        .select('*')
        .order('carga');

      if (error) throw error;

      return (data || []).map(r => ({
        empresa: r.empresa || '',
        sm: r.sm || '',
        deposito: r.deposito || '',
        box: r.box || '',
        carga: r.carga || '',
        descricao: r.descricao || '',
        ton: r.ton || '0',
        m3: parseFloat(r.m3) || 0,
        valor: r.valor || '0',
        rup: r.rup || '',
        visitasPendente: r.visitas_pendente || '0',
        inclusao: r.inclusao || '',
        roteirizacao: r.roteirizacao || '',
        dataRot: r.data_rot || '',
        geracaoMesa: r.geracao_mesa || '',
        reposicao: r.reposicao || '',
        paleteBox: r.palete_box || '',
        baixa: r.baixa || '',
        statusSep: r.separacao_st || '',
        finalSeparacao: r.final_separacao || '',
        conferencia: r.conferencia || '',
        statusConf: r.conf_st || '',
        loja: r.loja || '',
        diaOferta: r.dia_oferta || '',
        prioridade: r.prioridade || '',
        totalVertical: r.total_vertical || '',
        segmento: r.segmento || '',
        tipoLoja: r.tipo_loja || '',
        conjugada: r.conjugada || ''
      }));
    } catch (error) {
      console.error('[SUPABASE] Erro getMapaCarga:', error);
      throw error;
    }
  }

  async getCargasSemBox(filtros = {}) {
    try {
      const { data, error } = await this.client
        .from('mapa_carga')
        .select('*')
        .or('box.is.null,box.eq.')
        .order('carga');

      if (error) throw error;

      return (data || []).map(r => ({
        carga: r.carga || '',
        descricao: r.descricao || '',
        tipoLoja: r.tipo_loja || '',
        segmento: r.segmento || '',
        loja: r.loja || '',
        m3: parseFloat(r.m3) || 0,
        dataRot: r.data_rot || '',
        valor: r.valor || '',
        statusSep: r.separacao_st || '',
        statusConf: r.conf_st || '',
        visitasPendente: parseInt(r.visitas_pendente) || 0,
        prioridade: r.prioridade || '',
        box: r.box || null
      }));
    } catch (error) {
      console.error('[SUPABASE] Erro getCargasSemBox:', error);
      throw error;
    }
  }

  async getEstadoBoxes() {
    try {
      const { data, error } = await this.client
        .from('mapa_carga')
        .select('box, carga, descricao, tipo_loja, loja, m3, data_rot, valor')
        .neq('box', '')
        .not('box', 'is', null);

      if (error) throw error;

      return (data || []).map(r => ({
        box: r.box,
        carga: r.carga,
        descricao: r.descricao || '',
        tipoLoja: r.tipo_loja || '',
        loja: r.loja || '',
        m3: parseFloat(r.m3) || 0,
        dataRot: r.data_rot || '',
        valor: r.valor || ''
      }));
    } catch (error) {
      console.error('[SUPABASE] Erro getEstadoBoxes:', error);
      throw error;
    }
  }

  async alocarCargaBox(boxNum, cargaId) {
    try {
      const { error } = await this.client
        .from('mapa_carga')
        .update({ box: String(boxNum) })
        .eq('carga', String(cargaId));

      if (error) throw error;
      return { ok: true, msg: `Carga alocada no BOX ${boxNum}` };
    } catch (error) {
      console.error('[SUPABASE] Erro alocarCargaBox:', error);
      return { ok: false, msg: error.message };
    }
  }

  async liberarBox(boxNum) {
    try {
      const { data, error } = await this.client
        .from('mapa_carga')
        .update({ box: '' })
        .eq('box', String(boxNum))
        .select('id');

      if (error) throw error;
      return {
        ok: true,
        msg: `BOX ${boxNum} liberado`,
        cargas: data ? data.length : 0
      };
    } catch (error) {
      console.error('[SUPABASE] Erro liberarBox:', error);
      return { ok: false, msg: error.message };
    }
  }

  async limparColunasMapaCarga() {
    try {
      // Limpa todas as colunas editáveis (preserva as protegidas)
      const { data, error } = await this.client
        .from('mapa_carga')
        .update({
          empresa: '',
          sm: '',
          deposito: '',
          box: '',
          coluna1: '',
          descricao: '',
          sp: '',
          ton: '',
          m3: 0,
          valor: '',
          rup: '',
          coluna2: '',
          inclusao: '',
          roteirizacao: '',
          data_rot: '',
          geracao_mesa: '',
          aspas: '',
          reposicao: '',
          palete_box: '',
          baixa: '',
          separacao: '',
          final_separacao: '',
          conferencia: '',
          seotr: ''
        })
        .neq('id', 0) // afeta todos
        .select('id');

      if (error) throw error;

      const total = data ? data.length : 0;
      return {
        ok: true,
        msg: `${total} linhas limpas! (colunas protegidas preservadas)`,
        total,
        colunasProtegidas: 10
      };
    } catch (error) {
      console.error('[SUPABASE] Erro limparColunasMapaCarga:', error);
      return { ok: false, msg: error.message };
    }
  }

  async processarMapaCargaColado(dadosColados) {
    try {
      if (!dadosColados || dadosColados.length === 0) {
        return { ok: false, msg: 'Nenhum dado fornecido' };
      }

      const linhasProcessadas = [];

      dadosColados.forEach((linha, idx) => {
        try {
          const campos = Array.isArray(linha) ? linha : String(linha).split('\t');
          if (campos.length < 10) return;

          const carga = String(campos[4] || '').trim();
          const descricao = String(campos[6] || '').trim();
          if (!carga || !descricao) return;

          const dataRot = String(campos[16] || '').trim();
          const dataRotFormatada = dataRot.includes(' ') ? dataRot.split(' ')[0] : dataRot;
          const m3Raw = String(campos[9] || '0').replace(',', '.');

          linhasProcessadas.push({
            empresa: String(campos[0] || '').trim(),
            sm: String(campos[1] || '').trim(),
            deposito: String(campos[2] || '').trim(),
            box: String(campos[3] || '').trim(),
            carga,
            coluna1: String(campos[5] || '').trim(),
            descricao,
            sp: String(campos[7] || '').trim(),
            ton: String(campos[8] || '').trim(),
            m3: parseFloat(m3Raw) || 0,
            valor: String(campos[10] || '').trim(),
            rup: String(campos[11] || '').trim(),
            visitas_pendente: String(campos[12] || '').trim(),
            coluna2: String(campos[13] || '').trim(),
            inclusao: String(campos[14] || '').trim(),
            roteirizacao: String(campos[15] || '').trim(),
            data_rot: dataRotFormatada,
            geracao_mesa: String(campos[17] || '').trim(),
            aspas: String(campos[18] || '').trim(),
            reposicao: String(campos[19] || '').trim(),
            palete_box: String(campos[20] || '').trim(),
            baixa: String(campos[21] || '').trim(),
            separacao: String(campos[22] || '').trim(),
            final_separacao: String(campos[23] || '').trim(),
            conferencia: String(campos[24] || '').trim(),
            seotr: String(campos[25] || '').trim()
          });
        } catch (e) {
          console.error(`[SUPABASE] Erro linha ${idx + 1}:`, e);
        }
      });

      if (linhasProcessadas.length === 0) {
        return { ok: false, msg: 'Nenhuma linha válida para processar' };
      }

      // Upsert em lotes de 100
      const LOTE = 100;
      let processadas = 0;

      for (let i = 0; i < linhasProcessadas.length; i += LOTE) {
        const lote = linhasProcessadas.slice(i, i + LOTE);
        const { error } = await this.client
          .from('mapa_carga')
          .upsert(lote, { onConflict: 'carga', ignoreDuplicates: false });

        if (error) throw error;
        processadas += lote.length;
        console.log(`[SUPABASE] ${processadas}/${linhasProcessadas.length} linhas processadas`);
      }

      return {
        ok: true,
        msg: `${processadas} cargas salvas com sucesso!`,
        total: processadas
      };
    } catch (error) {
      console.error('[SUPABASE] Erro processarMapaCargaColado:', error);
      return { ok: false, msg: error.message };
    }
  }

  async atualizarMapaCarga(cargaId, campos) {
    try {
      const { error } = await this.client
        .from('mapa_carga')
        .update({ ...campos, updated_at: new Date().toISOString() })
        .eq('carga', String(cargaId));

      if (error) throw error;
      return { ok: true };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  }

  // ============================================================
  // QLP
  // ============================================================

  async getQLP() {
    try {
      const { data, error } = await this.client
        .from('qlp')
        .select('*')
        .order('nome');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[SUPABASE] Erro getQLP:', error);
      return [];
    }
  }

  async getMapaQLP() {
    try {
      const dados = await this.getQLP();
      const mapa = {};
      dados.forEach(r => {
        if (r.chapa) {
          mapa[r.chapa] = {
            secao: r.secao || '',
            turno: r.turno || ''
          };
        }
      });
      return mapa;
    } catch (error) {
      console.error('[SUPABASE] Erro getMapaQLP:', error);
      return {};
    }
  }

  // ============================================================
  // COLETORES
  // ============================================================

  async salvarRegistroColetor(chapa, nome, funcao, numeroColetor, tipoOperacao, situacoes) {
    try {
      if (!chapa || !numeroColetor || !situacoes || situacoes.length === 0) {
        return { ok: false, msg: 'Campos obrigatórios faltando' };
      }

      const agora = new Date();
      const dataFormatada = this._formatarDataBR(agora);
      const dataISO = agora.toISOString().split('T')[0];
      const horaFormatada = this._formatarHora(agora);
      const situacoesTexto = situacoes.join(', ');

      const { supervisor, turno } = await this._buscarSupervisorETurno(chapa);

      // 1. Salva no histórico
      const { error: errHist } = await this.client
        .from('historico_coletor')
        .insert({
          data: dataISO,
          hora: horaFormatada,
          chapa,
          nome,
          funcao,
          numero_coletor: String(numeroColetor),
          tipo_operacao: tipoOperacao,
          situacao: situacoesTexto,
          supervisor,
          turno
        });

      if (errHist) throw errHist;

      // 2. Upsert na aba Coletor (empilhamento)
      const { data: existente } = await this.client
        .from('coletor')
        .select('id')
        .eq('data', dataISO)
        .eq('chapa', chapa)
        .eq('numero_coletor', String(numeroColetor))
        .maybeSingle();

      if (existente) {
        await this.client
          .from('coletor')
          .update({ tipo_operacao: tipoOperacao, hora: horaFormatada, updated_at: new Date().toISOString() })
          .eq('id', existente.id);
      } else {
        await this.client.from('coletor').insert({
          data: dataISO,
          hora: horaFormatada,
          chapa,
          nome,
          funcao,
          numero_coletor: String(numeroColetor),
          tipo_operacao: tipoOperacao,
          situacao: situacoesTexto,
          supervisor,
          turno
        });
      }

      return { ok: true, msg: 'Dados salvos com sucesso!' };
    } catch (error) {
      console.error('[SUPABASE] Erro salvarRegistroColetor:', error);
      return { ok: false, msg: error.message };
    }
  }

  async obterColetorStatus() {
    try {
      const { data, error } = await this.client
        .from('historico_coletor')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mapa = {};
      (data || []).forEach(r => {
        if (r.numero_coletor) {
          mapa[r.numero_coletor] = {
            chapa: r.chapa,
            nome: r.nome,
            funcao: r.funcao,
            tipo: r.tipo_operacao,
            situacao: r.situacao,
            supervisor: r.supervisor,
            turno: r.turno,
            data: r.data,
            hora: r.hora
          };
        }
      });
      return mapa;
    } catch (error) {
      console.error('[SUPABASE] Erro obterColetorStatus:', error);
      return {};
    }
  }

  // ============================================================
  // CHAVES
  // ============================================================

  async salvarRegistroChave(chapa, nome, funcao, numeroChave, tipoOperacao, situacoes) {
    try {
      if (!chapa || !numeroChave || !situacoes || situacoes.length === 0) {
        return { ok: false, msg: 'Campos obrigatórios faltando' };
      }

      const agora = new Date();
      const dataISO = agora.toISOString().split('T')[0];
      const horaFormatada = this._formatarHora(agora);
      const situacoesTexto = situacoes.join(', ');
      const numChaveStr = String(parseInt(numeroChave));

      const { supervisor, turno } = await this._buscarSupervisorETurno(chapa);

      // 1. Histórico
      const { error: errHist } = await this.client
        .from('historico_chaves')
        .insert({
          data: dataISO,
          hora: horaFormatada,
          chapa,
          nome,
          funcao,
          numero_chave: numChaveStr,
          tipo_operacao: tipoOperacao,
          situacao: situacoesTexto,
          supervisor,
          turno
        });

      if (errHist) throw errHist;

      // 2. Empilhamento
      const { data: existente } = await this.client
        .from('chaves')
        .select('id')
        .eq('data', dataISO)
        .eq('chapa', chapa)
        .eq('numero_chave', numChaveStr)
        .maybeSingle();

      if (existente) {
        await this.client
          .from('chaves')
          .update({ tipo_operacao: tipoOperacao, hora: horaFormatada, updated_at: new Date().toISOString() })
          .eq('id', existente.id);
      } else {
        await this.client.from('chaves').insert({
          data: dataISO,
          hora: horaFormatada,
          chapa,
          nome,
          funcao,
          numero_chave: numChaveStr,
          tipo_operacao: tipoOperacao,
          situacao: situacoesTexto,
          supervisor,
          turno
        });
      }

      return { ok: true, msg: 'Chave registrada com sucesso!' };
    } catch (error) {
      console.error('[SUPABASE] Erro salvarRegistroChave:', error);
      return { ok: false, msg: error.message };
    }
  }

  async obterChaveStatus() {
    try {
      const { data, error } = await this.client
        .from('historico_chaves')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mapa = {};
      (data || []).forEach(r => {
        if (r.numero_chave) {
          mapa[r.numero_chave] = {
            chapa: r.chapa,
            nome: r.nome,
            funcao: r.funcao,
            tipo: r.tipo_operacao,
            situacao: r.situacao,
            supervisor: r.supervisor,
            turno: r.turno,
            data: r.data,
            hora: r.hora
          };
        }
      });
      return mapa;
    } catch (error) {
      console.error('[SUPABASE] Erro obterChaveStatus:', error);
      return {};
    }
  }

  // ============================================================
  // PRODUÇÃO
  // ============================================================

  async getMetaProducao() {
    try {
      const { data, error } = await this.client
        .from('meta')
        .select('data, meta, produtividade_hora')
        .order('data');

      if (error) throw error;
      return (data || []).map(r => ({
        data: r.data,
        meta: parseFloat(r.meta) || 0,
        produtividadeHora: parseFloat(r.produtividade_hora) || 0
      }));
    } catch (error) {
      console.error('[SUPABASE] Erro getMetaProducao:', error);
      return [];
    }
  }

  async getProdutividadeHora() {
    try {
      const { data, error } = await this.client
        .from('produtividade_hora')
        .select('funcao, produtividade_hora')
        .order('funcao');

      if (error) throw error;
      return (data || []).map(r => ({
        funcao: r.funcao,
        produtividadeHora: parseFloat(r.produtividade_hora) || 0
      }));
    } catch (error) {
      console.error('[SUPABASE] Erro getProdutividadeHora:', error);
      return [];
    }
  }

  // ============================================================
  // RESUMO BASE (para resumo-base.js)
  // ============================================================

  async getRegistrosBase(dataFiltro) {
    try {
      // dataFiltro vem como DD/MM/YYYY do frontend, converte para YYYY-MM-DD
      let dataISO = dataFiltro;
      if (dataFiltro && dataFiltro.includes('/')) {
        const partes = dataFiltro.split('/');
        dataISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
      }

      const { data, error } = await this.client
        .from('base')
        .select('supervisor, aba, matricula, nome, funcao, status, desvio, data')
        .eq('data', dataISO);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[SUPABASE] Erro getRegistrosBase:', error);
      return [];
    }
  }

  // ============================================================
  // HELPERS PRIVADOS
  // ============================================================

  async _buscarSupervisorETurno(chapa) {
    try {
      const { data } = await this.client
        .from('base')
        .select('supervisor, aba')
        .eq('matricula', chapa)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        let turno = 'Não informado';
        const aba = (data.aba || '').toLowerCase();
        if (aba.includes('ta') || aba.includes('turno a')) turno = 'Turno A';
        else if (aba.includes('tb') || aba.includes('turno b')) turno = 'Turno B';
        else if (aba.includes('tc') || aba.includes('turno c')) turno = 'Turno C';

        return { supervisor: data.supervisor || 'Sem Supervisor', turno };
      }
      return { supervisor: 'Sem Supervisor', turno: 'Não informado' };
    } catch (error) {
      return { supervisor: 'Sem Supervisor', turno: 'Não informado' };
    }
  }

  _formatarDataBR(data) {
    if (!data) return '';
    const d = String(data.getDate()).padStart(2, '0');
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const a = data.getFullYear();
    return `${d}/${m}/${a}`;
  }

  _formatarHora(data) {
    if (!data) return '';
    const h = String(data.getHours()).padStart(2, '0');
    const m = String(data.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

module.exports = new SupabaseService();
