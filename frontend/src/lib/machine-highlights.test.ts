import { describe, expect, it } from 'vitest';
import { bulletsHeading, listBullets, MAX_BULLETS } from './machine-highlights';

// Textos INVENTADOS no formato da descrição da lista (a lista real não entra no repositório).
const pulverizador = [
  'PULVERIZADOR X18',
  'Pressão: 0,45 MPa',
  'Pressão ajustável com potenciômetro',
  'Tanque: 20 litros',
  '🔋 INCLUI BATERIA RECARREGÁVEL + CARREGADOR',
  '⚡ Até 7 horas de autonomia com uma única carga',
  'ATENÇÃO!',
  '❌ Não inclui bateria nem carregador.',
].join('\n');

const rocadeira = ['ROÇADEIRA R100', '🔹 Cabeçote T45X Semi-Automático', '🔪 Lâmina Multi 2 Pontas | 1"', '🎽 Cinto Balance 55', '🏗️ Com Torre'].join('\n');

describe('listBullets', () => {
  it('fica só com linhas curtas de característica, sem emoji, sem o título repetido e sem aviso', () => {
    expect(listBullets(pulverizador, 'X18', 'PULVERIZADOR')).toEqual([
      'Pressão: 0,45 MPa',
      'Pressão ajustável com potenciômetro',
      'Tanque: 20 litros',
      'Inclui bateria recarregável + carregador',
      'Até 7 horas de autonomia com uma única carga',
    ]);
  });

  it('o conjunto da roçadeira sai item a item', () => {
    expect(listBullets(rocadeira, 'R100', 'ROÇADEIRA')).toEqual([
      'Cabeçote T45X Semi-Automático',
      'Lâmina Multi 2 Pontas | 1"',
      'Cinto Balance 55',
      'Com Torre',
    ]);
  });

  it('parágrafo de propaganda e cabeçalho de lista ficam de fora; título curto de seção fica', () => {
    const texto = ['GIRO ZERO Z9', 'Transmissão de alto desempenho', 'Sistema de transmissão projetado para proporcionar eficiência e confiabilidade no trabalho profissional.', '🔋 INCLUI:', '✔️ Carregador QC80', '✔️ Bateria BLi10'].join('\n');
    expect(listBullets(texto, 'Z9', 'GIRO ZERO')).toEqual(['Transmissão de alto desempenho', 'Carregador QC80', 'Bateria BLi10']);
  });

  it('linha em caixa-alta vira frase; repetida só entra uma vez', () => {
    expect(listBullets('SERVIÇO SEM FIO\nSERVIÇO SEM FIO\nCom torre', 'ZZ1')).toEqual(['Serviço sem fio', 'Com torre']);
  });

  it('sigla com número mantém a caixa: SÉRIE Z400 não vira z400', () => {
    expect(listBullets('DESEMPENHO PROFISSIONAL – SÉRIE Z400', 'Z9')).toEqual(['Desempenho profissional – série Z400']);
  });

  it('descrição vazia ou ausente não gera nada, e o teto de linhas vale', () => {
    expect(listBullets(null, 'X')).toEqual([]);
    expect(listBullets('', 'X')).toEqual([]);
    const muitas = Array.from({ length: 30 }, (_, i) => `Característica número ${i + 1}`).join('\n');
    expect(listBullets(muitas, 'X')).toHaveLength(MAX_BULLETS);
  });
});

describe('bulletsHeading', () => {
  it('roçadeira diz "conjunto"; as outras, "Características"', () => {
    expect(bulletsHeading('ROÇADEIRA COSTAL')).toBe('Conjunto da roçadeira é composto por:');
    expect(bulletsHeading('PULVERIZADOR')).toBe('Características:');
  });
});
