import assert from 'node:assert/strict';
import test from 'node:test';
import { repairMultipartText } from './text-encoding';

test('corrige NBSP UTF-8 interpretado como Latin-1 no nome do PDF', () => {
    assert.equal(
        repairMultipartText('Cortador de grama Husqvarna LCÂ 353AWD.pdf'),
        'Cortador de grama Husqvarna LC 353AWD.pdf',
    );
});

test('corrige narrow no-break space quebrado como no Rider R 316TX', () => {
    assert.equal(
        repairMultipartText('Trator cortador de grama Husqvarna Râ¯316TX.pdf'),
        'Trator cortador de grama Husqvarna R 316TX.pdf',
    );
});

test('corrige narrow no-break space real para espaço comum', () => {
    assert.equal(
        repairMultipartText('Trator cortador de grama Husqvarna R 316TX.pdf'),
        'Trator cortador de grama Husqvarna R 316TX.pdf',
    );
});

test('corrige símbolo registrado quebrado sem alterar o restante do nome', () => {
    assert.equal(
        repairMultipartText('Motosserra Husqvarna 288 XPÂ®.pdf'),
        'Motosserra Husqvarna 288 XP®.pdf',
    );
});

test('preserva acentos portugueses legítimos', () => {
    assert.equal(repairMultipartText('LÂMINA.pdf'), 'LÂMINA.pdf');
    assert.equal(repairMultipartText('Máquina de teste.pdf'), 'Máquina de teste.pdf');
});

test('normaliza NBSP real para espaço comum', () => {
    assert.equal(repairMultipartText('LC 151S.pdf'), 'LC 151S.pdf');
});
