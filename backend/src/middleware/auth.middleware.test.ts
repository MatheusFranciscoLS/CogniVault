import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
    adminOnly,
    authMiddleware,
    invalidateUserAuthCache,
    normalizeTokenSessionVersion,
    type AuthenticatedRequest,
} from './auth.middleware';

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

test('authMiddleware rejects tokens signed with an algorithm other than HS256', async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-jwt-secret-key-cognivault';

    try {
        const token = jwt.sign(
            { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' },
            process.env.JWT_SECRET,
            { algorithm: 'HS512', expiresIn: '1h' },
        );
        let statusCode: number | null = null;
        let payload: any = null;
        let nextCalled = false;
        const req = {
            headers: { authorization: `Bearer ${token}` },
        } as unknown as AuthenticatedRequest;
        const res = {
            status(code: number) { statusCode = code; return this; },
            json(value: unknown) { payload = value; return this; },
        } as any;

        await authMiddleware(req, res, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(statusCode, 401);
        assert.match(payload?.error || '', /token inválido/i);
    } finally {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});

test('tokens antigos sem sessionVersion continuam equivalendo à versão zero', () => {
    assert.equal(normalizeTokenSessionVersion(undefined), 0);
    assert.equal(normalizeTokenSessionVersion(0), 0);
    assert.equal(normalizeTokenSessionVersion(3), 3);
});

test('sessionVersion malformada é rejeitada', () => {
    assert.equal(normalizeTokenSessionVersion(-1), null);
    assert.equal(normalizeTokenSessionVersion(1.5), null);
    assert.equal(normalizeTokenSessionVersion('1'), null);
    assert.equal(normalizeTokenSessionVersion(null), null);
});

test('invalidateUserAuthCache runs safely with specific id and full clear', () => {
    assert.doesNotThrow(() => {
        invalidateUserAuthCache('test-user-id');
        invalidateUserAuthCache();
    });
});
