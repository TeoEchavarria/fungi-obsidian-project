/**
 * Hierarchy Utility Functions
 */

/**
 * Validates if a new parent can be assigned to a child.
 * @param {Object} child - The child record {guid, taxonomicLevel}
 * @param {Object} parent - The proposed parent record {guid, taxonomicLevel} or null for anchor
 * @param {Object} parentMap - Map of guid -> parent_guid for cycle detection
 * @returns {{ok: boolean, reason?: string}}
 */
function validateParent(child, parent, parentMap) {
    if (!parent) {
        // Assigning to anchor is always valid from any level
        return { ok: true };
    }

    if (child.guid === parent.guid) {
        return { ok: false, reason: "A node cannot be its own parent." };
    }

    if (parent.taxonomicLevel >= child.taxonomicLevel) {
        return { ok: false, reason: "Parent taxonomic level must be higher (smaller number) than child." };
    }

    if (detectCycle(child.guid, parent.guid, parentMap)) {
        return { ok: false, reason: "Circular dependency detected." };
    }

    return { ok: true };
}

/**
 * Detects if assigning newParent to child would create a cycle.
 * @param {string} childGuid 
 * @param {string} newParentGuid 
 * @param {Object} parentMap - Map of guid -> parent_guid
 * @returns {boolean}
 */
function detectCycle(childGuid, newParentGuid, parentMap) {
    let current = newParentGuid;
    while (current) {
        if (current === childGuid) return true;
        current = parentMap[current];
    }
    return false;
}

/**
 * Builds a hierarchy map from nodes.
 * @param {Array} nodes - Array of {guid, parent_guid}
 * @returns {Object} { childrenByParent: Map, parentMap: Object }
 */
function buildHierarchyMaps(nodes) {
    const childrenByParent = new Map();
    const parentMap = {};

    nodes.forEach(node => {
        const parentId = node.parent_guid || "ANCHOR_FUNGI";
        if (!childrenByParent.has(parentId)) {
            childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(node);
        parentMap[node.guid] = node.parent_guid;
    });

    return { childrenByParent, parentMap };
}

// Export for usage in other scripts
if (typeof window !== 'undefined') {
    window.HierarchyUtils = {
        validateParent,
        detectCycle,
        buildHierarchyMaps
    };
}
