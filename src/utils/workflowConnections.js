/**
 * Inserts a visual workflow step and wires it into the graph without requiring
 * the user to drag a connection. Existing edge data (including branch labels)
 * remains on the incoming edge when a step is inserted between two nodes.
 */
export function insertConnectedStep(nodes, edges, selectedId, newNode, edgeId) {
    const start = nodes.find(node => node.data?.kind === 'start');
    const end = nodes.find(node => node.data?.kind === 'end');
    const selected = nodes.find(node => node.id === selectedId);
    const lastEditable = [...nodes]
        .filter(node => node.data?.kind !== 'end')
        .sort((a, b) => (b.position?.x ?? 0) - (a.position?.x ?? 0))[0];
    let parent = selected || lastEditable || start;
    let outgoing = [];
    // Adding after an End step means inserting before it, not creating an
    // unreachable node or attempting to connect End -> Human Task.
    if (parent?.data?.kind === 'end') {
        const incoming = edges.filter(edge => edge.target === parent.id);
        parent = nodes.find(node => node.id === incoming[0]?.source) || lastEditable || start;
    }
    if (parent)
        outgoing = edges.filter(edge => edge.source === parent.id);
    const spliced = newNode.data?.kind !== 'end' && outgoing.length === 1
        && parent?.data?.kind !== 'decision'
        && parent?.data?.kind !== 'parallel';
    const target = spliced ? nodes.find(node => node.id === outgoing[0].target) : null;
    const px = parent?.position?.x ?? 40;
    const py = parent?.position?.y ?? 180;
    const spacing = 260;
    const location = target
        ? { x: px + spacing, y: py }
        : { x: px + spacing, y: py + (outgoing.length ? 150 * outgoing.length : 0) };
    const positioned = { ...newNode, position: location };
    // Make actual space for a newly inserted step. Existing links follow nodes.
    const updatedNodes = target
        ? nodes.map(node => node.position.x >= location.x
            ? { ...node, position: { ...node.position, x: node.position.x + spacing } }
            : node).concat(positioned)
        : [...nodes, positioned];
    const newEdges = [...edges];
    if (parent) {
        if (target) {
            const index = newEdges.findIndex(edge => edge.id === outgoing[0].id);
            newEdges[index] = { ...outgoing[0], target: newNode.id };
            newEdges.push({ id: edgeId(), source: newNode.id, target: target.id, type: 'smoothstep' });
        }
        else {
            newEdges.push({ id: edgeId(), source: parent.id, target: newNode.id, type: 'smoothstep' });
        }
    }
    return { nodes: updatedNodes, edges: newEdges };
}
