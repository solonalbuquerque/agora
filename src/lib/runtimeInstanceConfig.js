'use strict';

/**
 * Instance ID e token em tempo de execução.
 * Prioridade: variáveis de ambiente (.env) > staff_settings (banco, persistido no registro/ativação).
 * Permite registrar a instância pela UI sem precisar editar .env e reiniciar.
 */

const config = require('../config');
const staffSettingsDb = require('../db/staffSettings');

/**
 * Priority: staff_settings (set by panel Register/Set) > .env INSTANCE_ID
 * Rationale: panel registration is the user's active intent. .env is a fallback
 * for deployments that pre-configure the ID without using the panel.
 * @returns {Promise<string|null>}
 */
async function getInstanceId() {
  const fromDb = await staffSettingsDb.get('instance_id');
  if (fromDb) return fromDb;
  return config.instanceId || null;
}

/**
 * @returns {Promise<string|null>}
 */
async function getInstanceToken() {
  const fromDb = await staffSettingsDb.get('instance_token');
  if (fromDb) return fromDb;
  return config.instanceToken || null;
}

/**
 * @returns {Promise<{ instanceId: string|null, instanceToken: string|null }>}
 */
async function getInstanceConfig() {
  const [fromDbId, fromDbToken] = await Promise.all([
    staffSettingsDb.get('instance_id'),
    staffSettingsDb.get('instance_token'),
  ]);
  return {
    instanceId: fromDbId || config.instanceId || null,
    instanceToken: fromDbToken || config.instanceToken || null,
  };
}

module.exports = {
  getInstanceId,
  getInstanceToken,
  getInstanceConfig,
};
