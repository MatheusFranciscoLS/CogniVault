import { createHash } from 'crypto';
import { normalizeIdentifier, normalizeText } from './normalize';

export interface PartIdentityInput {
    model: string;
    pnc?: string | null;
    universalAcrossPnc?: boolean;
    partNumber: string;
    section?: string | null;
    position?: string | null;
    page?: number | null;
}

export interface IdentifiedPart<T> {
    item: T;
    identity: string;
    sourceKey: string;
    occurrence: number;
}

export function buildPartIdentity(part: PartIdentityInput): string {
    return [
        normalizeIdentifier(part.model),
        part.universalAcrossPnc ? '*' : normalizeIdentifier(part.pnc),
        normalizeIdentifier(part.partNumber),
        normalizeText(part.section),
        normalizeIdentifier(part.position),
    ].join('|');
}

export function identifyParts<T extends PartIdentityInput>(parts: T[]): IdentifiedPart<T>[] {
    const occurrences = new Map<string, number>();

    return parts.map((item) => {
        const identity = buildPartIdentity(item);
        const occurrence = (occurrences.get(identity) || 0) + 1;
        occurrences.set(identity, occurrence);

        return {
            item,
            identity,
            occurrence,
            sourceKey: createHash('sha256')
                .update(`${identity}|${occurrence}`)
                .digest('hex'),
        };
    });
}

export function matchExistingPartIds<TPrepared extends PartIdentityInput, TExisting extends PartIdentityInput & { id: string }>(
    prepared: TPrepared[],
    existing: TExisting[],
): Array<IdentifiedPart<TPrepared> & { existingId: string | null }> {
    const existingByIdentity = new Map<string, TExisting[]>();

    for (const part of existing) {
        const identity = buildPartIdentity(part);
        const group = existingByIdentity.get(identity) || [];
        group.push(part);
        existingByIdentity.set(identity, group);
    }

    return identifyParts(prepared).map((identified) => ({
        ...identified,
        existingId: existingByIdentity.get(identified.identity)?.shift()?.id || null,
    }));
}

export function hasSafeExtractionCoverage(
    previousActiveCount: number,
    nextActiveCount: number,
    minimumRatio = 0.5,
): boolean {
    if (previousActiveCount <= 0) return true;

    const safeRatio = Number.isFinite(minimumRatio)
        ? Math.min(1, Math.max(0, minimumRatio))
        : 0.5;

    return nextActiveCount >= Math.ceil(previousActiveCount * safeRatio);
}

export function countDistinctPartOccurrences(parts: PartIdentityInput[]): number {
    return new Set(parts.map(part => [
        normalizeIdentifier(part.model),
        Number.isInteger(part.page) && Number(part.page) > 0 ? Number(part.page) : '',
        normalizeText(part.section),
        normalizeIdentifier(part.position),
        normalizeIdentifier(part.partNumber),
    ].join('|'))).size;
}
