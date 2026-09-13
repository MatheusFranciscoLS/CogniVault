export interface MaintenanceKitLookupItem {
    category: string;
    label: string;
    searchTerms: string[];
}

export interface MaintenanceKitMatch<T> {
    kitItem: MaintenanceKitLookupItem;
    matchingPart: T;
}

export async function resolveMaintenanceKitMatches<T>(
    kitItems: readonly MaintenanceKitLookupItem[],
    lookup: (item: MaintenanceKitLookupItem) => Promise<T | null>,
): Promise<Array<MaintenanceKitMatch<T>>> {
    const matches = await Promise.all(
        kitItems.map(async kitItem => ({
            kitItem,
            matchingPart: await lookup(kitItem),
        })),
    );

    return matches.flatMap(({ kitItem, matchingPart }) =>
        matchingPart === null
            ? []
            : [{ kitItem, matchingPart }],
    );
}
