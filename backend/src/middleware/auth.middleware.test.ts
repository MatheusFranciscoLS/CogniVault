import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { adminOnly, invalidateUserAuthCache, type AuthenticatedRequest } from './auth.middleware';

test('adminOnly allows users with ADMIN role', () => {
    let nextCalled = false;
    const req = {
        user: {
            id: 'user-admin-1',
            email: 'admin@cognivault.com',
            role: 'ADMIN' as const,
            tenantId: 'tenant-1',
        },
    } as AuthenticatedRequest;

    const res = {
        status: () => res,
        json: () => res,
    } as any;

    adminOnly(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
});

test('adminOnly blocks users with MECHANIC role with status 403', () => {
    let statusCode: number | null = null;
    let jsonPayload: any = null;
    let nextCalled = false;

    const req = {
        user: {
            id: 'user-mech-1',
            email: 'mecanico@cognivault.com',
            role: 'MECHANIC' as const,
            tenantId: 'tenant-1',
        },
    } as AuthenticatedRequest;

    const res = {
        status: (code: number) => {
            statusCode = code;
            return res;
        },
        json: (payload: any) => {
            jsonPayload = payload;
            return res;
        },
    } as any;

    adminOnly(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);
    assert.match(jsonPayload?.error || '', /somente para administradores/i);
});

test('adminOnly blocks unauthenticated requests with status 401', () => {
    let statusCode: number | null = null;
    let jsonPayload: any = null;
    let nextCalled = false;

    const req = {} as AuthenticatedRequest;

    const res = {
        status: (code: number) => {
            statusCode = code;
            return res;
        },
        json: (payload: any) => {
            jsonPayload = payload;
            return res;
        },
    } as any;

    adminOnly(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.match(jsonPayload?.error || '', /não autenticado/i);
});

test('invalidateUserAuthCache runs safely with specific id and full clear', () => {
    assert.doesNotThrow(() => {
        invalidateUserAuthCache('test-user-id');
        invalidateUserAuthCache();
    });
});
