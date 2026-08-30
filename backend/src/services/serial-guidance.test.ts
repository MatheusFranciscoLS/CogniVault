import assert from 'node:assert/strict';
import test from 'node:test';
import { requiresSerialConfirmation } from './serial-guidance';

const oldAdapter = {
  partNumber: '529595001', documentId:'lb256', model:'LB 256SP', page:12,
  pnc: '970488501', section: 'CUTTING EQUIPMENT', position: '6',
  notes: 'For PNC 970488501 Up to S/N:20240200000',
};
const newAdapter = {
  partNumber: '529595002', documentId:'lb256', model:'LB 256SP', page:12,
  pnc: '970488501', section: 'CUTTING EQUIPMENT', position: '6',
  notes: 'For PNC 970488501 From S/N:20240200001',
};

test('pede serial quando o mesmo item troca de código por fronteira explícita de S/N', () => {
  assert.equal(requiresSerialConfirmation('adaptador da lâmina LB256SP PNC 970488501', [oldAdapter, newAdapter]), true);
});

test('não pede serial novamente quando o usuário já informou S/N', () => {
  assert.equal(requiresSerialConfirmation('adaptador da lâmina LB256SP PNC 970488501 S/N 20240200001', [oldAdapter, newAdapter]), false);
});

test('não mistura regras de posições diferentes como se fossem variantes do mesmo item', () => {
  assert.equal(requiresSerialConfirmation('peça do LB256SP', [oldAdapter, { ...newAdapter, position: '7' }]), false);
});

test('uma nota de serial isolada não é suficiente para bloquear a consulta', () => {
  assert.equal(requiresSerialConfirmation('adaptador LB256SP', [oldAdapter]), false);
});

test('não mistura PNCs diferentes para fabricar uma necessidade de serial', () => {
  assert.equal(requiresSerialConfirmation('adaptador LB256SP', [oldAdapter, { ...newAdapter, pnc: '970488502' }]), false);
});

test('variantes por série mais abaixo no ranking não bloqueiam uma ocorrência principal independente',()=>{
  const leading={partNumber:'590000001',documentId:'lb256',model:'LB 256SP',page:4,pnc:'970488501',section:'HANDLE',position:'2',notes:null};
  assert.equal(requiresSerialConfirmation('cabo do LB256SP',[leading,oldAdapter,newAdapter]),false);
});
