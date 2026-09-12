import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

const activeTenantOperations = new Set<string>();

function normalizeOperationName(value: string): string {
  const operation = value.trim().toLowerCase();
  if (!operation || operation.length > 80 || !/^[a-z0-9:_-]+$/.test(operation)) {
    throw new Error('INVALID_TENANT_OPERATION_NAME');
  }
  return operation;
}

export function tenantOperationSingleFlight(operationName: string) {
  const operation = normalizeOperationName(operationName);

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const key = `${req.user.tenantId}:${operation}`;
    if (activeTenantOperations.has(key)) {
      res.status(409).json({ error: 'Esta operação já está em andamento para esta empresa.' });
      return;
    }

    activeTenantOperations.add(key);
    let released = false;

    const release = (): void => {
      if (released) return;
      released = true;
      activeTenantOperations.delete(key);
      res.off('finish', release);
      res.off('close', release);
      res.off('error', release);
    };

    res.once('finish', release);
    res.once('close', release);
    res.once('error', release);

    try {
      next();
    } catch (error) {
      release();
      throw error;
    }
  };
}
