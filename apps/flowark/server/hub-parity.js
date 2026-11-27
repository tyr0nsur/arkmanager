const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const SNAPSHOT = path.join(ROOT, 'docs/research/ase-ecosystem-inventory-20261014.json');
const CONTRACT = path.join(ROOT, 'docs/research/arkapi_functional_contract.json');
const RELATED_MODULES = { 36: ['oShopKits'], 43: ['oHomes'], 52: ['oAdvancedChat'] };

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
function accepted(item) {
    const dimensions = Object.values(item.behavior_matrix || {});
    return item.obelisk_gameplay_parity === 'accepted' && dimensions.length === 7 &&
        dimensions.every(dimension => dimension.stage === 'Accepted') && item.behavior_matrix.steam_epic_gameplay.accepted === true;
}

async function overview() {
    const [snapshot, contract] = await Promise.all([read(SNAPSHOT), read(CONTRACT)]);
    const families = new Map();
    for (const item of snapshot.resources) {
        const family = families.get(item.functional_family) || { id: item.functional_family, total: 0, accepted: 0 };
        family.total++;
        if (accepted(item)) family.accepted++;
        families.set(family.id, family);
    }
    const totalAccepted = snapshot.resources.filter(accepted).length;
    return { snapshot_date: snapshot.snapshot_date, total: snapshot.resources.length,
        accepted: totalAccepted, pending: snapshot.resources.length - totalAccepted,
        full_functional_parity: totalAccepted === snapshot.resources.length && totalAccepted > 0,
        native_dll_compatibility: false, selected_contracts: snapshot.selected_public_contracts.length,
        families: [...families.values()].sort((a, b) => a.id.localeCompare(b.id)),
        dimensions: snapshot.behavior_dimension_definitions,
        sdk_domains: contract.domains,
        primitives: snapshot.planned_primitives,
    };
}

async function detail(id, fail) {
    if (!/^[1-9][0-9]{0,8}$/.test(id)) fail(400, 'Identificador de referencia inválido', 'invalid_reference_id');
    const snapshot = await read(SNAPSHOT);
    const item = snapshot.resources.find(resource => String(resource.resource_id) === id);
    if (!item) fail(404, 'Referencia no encontrada', 'reference_not_found');
    const selected = snapshot.selected_public_contracts.find(contract => contract.resource_id === item.resource_id);
    return { resource_id: item.resource_id, name: item.name, version: item.listed_version,
        snapshot_date: snapshot.snapshot_date, family: item.functional_family, source_url: item.resource_url,
        stage: accepted(item) ? 'accepted' : 'reference_pending', available: false,
        gameplay_parity_accepted: accepted(item),
        contract_status: item.contract_status,
        commands: item.documented_command_tokens || [],
        console_candidates: item.documented_console_token_candidates || [],
        dependencies: item.mentioned_dependencies_or_integrations || [],
        required_primitives: item.required_primitives_project_assessment || [],
        behavior_matrix: item.behavior_matrix,
        behavior_definitions: snapshot.behavior_dimension_definitions,
        related_native_modules: RELATED_MODULES[item.resource_id] || [],
        selected_contract: selected ? { scope: selected.scope, commands: selected.commands || [],
            requirements: selected.observable_requirements || [], gap: selected.obelisk_gap,
            specification_status: selected.specification_status } : null,
    };
}
module.exports = { overview, detail };
