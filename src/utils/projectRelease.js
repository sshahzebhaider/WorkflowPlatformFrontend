/** Two statuses only. UAT is also the QA/testing stage until separate environments exist. */
export const RELEASE_STAGES = Object.freeze(['UAT', 'Live']);
export const releaseLabel = status => status === 'UAT' ? 'QA / UAT' : status;
export const nextReleaseStage = current => {
    if (current === 'Draft')
        return 'UAT'; // Legacy project created before this migration.
    if (current === 'UAT')
        return 'Live';
    if (current === 'Live')
        return 'UAT';
    return null;
};
export function releaseAction(current) {
    const target = nextReleaseStage(current);
    return { target, label: target === 'Live' ? 'Move to Live' : target === 'UAT' ? 'Move to QA / UAT' : 'Unavailable' };
}
export function canPromoteRelease(current, platformAdmin, projectAdmin) {
    return Boolean(projectAdmin && platformAdmin && nextReleaseStage(current));
}
