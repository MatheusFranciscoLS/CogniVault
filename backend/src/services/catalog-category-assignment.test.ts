import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticCategoryAssignmentWhere } from './catalog-category-assignment';

test('automatic category assignment is scoped to tenant and the category state that was observed', () => {
  const reviewedAt = new Date('2026-09-15T12:00:00.000Z');

  assert.deepEqual(
    automaticCategoryAssignmentWhere('doc-1', 'tenant-1', 'category-old', reviewedAt),
    {
      id: 'doc-1',
      tenantId: 'tenant-1',
      categoryId: 'category-old',
      metadataReviewedAt: reviewedAt,
    },
  );
});

test('automatic category assignment also protects the initial uncategorized state', () => {
  assert.deepEqual(
    automaticCategoryAssignmentWhere('doc-1', 'tenant-1', null, null),
    {
      id: 'doc-1',
      tenantId: 'tenant-1',
      categoryId: null,
      metadataReviewedAt: null,
    },
  );
});
