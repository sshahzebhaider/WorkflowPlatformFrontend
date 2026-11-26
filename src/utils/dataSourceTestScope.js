/** Only a Platform Admin can run connection diagnostics before project approval.
 * Project test routes continue to enforce approval in SQL Server.
 */
export function operationTestEndpoint(operationId, projectId, isPlatformAdmin) {
    if (!/^[1-9]\d*$/.test(String(operationId)))
        throw new Error('Save the operation to the database before testing.');
    if (projectId !== null && projectId !== undefined && projectId !== '') {
        if (!/^[1-9]\d*$/.test(String(projectId)))
            throw new Error('Select a valid approved project.');
        return `/projects/${projectId}/data-sources/operations/${operationId}/test`;
    }
    if (!isPlatformAdmin)
        throw new Error('A project administrator can test only a data source approved for their project.');
    return `/data-sources/operations/${operationId}/test`;
}
