/**
 * Contract validation.
 *
 * Two distinct schema families, deliberately kept apart:
 *
 *  1. `contract*`  — transcribed from the Annexe E OpenAPI 3.1 extract. These
 *     encode what the backend team *says* it returns. A failure here is a
 *     contract breach and is reported as a product/contract defect.
 *
 *  2. `observed*`  — derived from payloads actually captured on the demo
 *     environment. These stop the suite from silently accepting a shape change,
 *     even where no contract exists yet (/users, /contacts have none).
 *
 * Running both is the point: where they disagree, the disagreement *is* the
 * finding. See DEF-004 in docs/05-results-analysis.md.
 */
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

/* ------------------------------------------------------------------ */
/* 1. Contract schemas — verbatim from Annexe E                        */
/* ------------------------------------------------------------------ */

export const contractTransferResponse = {
  $id: 'contract/TransferResponse',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
    createdAt: { type: 'string', format: 'date-time' },
  },
  // The contract declares no `required` array at all — itself a gap we flag.
  // We assert the three documented properties are present, because a response
  // that omits `id` is unusable regardless of what the YAML says.
  required: ['id', 'status', 'createdAt'],
} as const;

export const contractTransferRequest = {
  $id: 'contract/TransferRequest',
  type: 'object',
  required: ['recipientId', 'amount', 'transferType', 'pin'],
  properties: {
    recipientId: { type: 'string', format: 'uuid' },
    amount: { type: 'integer', minimum: 1 },
    currency: { type: 'string', default: 'USD' },
    note: { type: 'string', maxLength: 60 },
    transferType: { type: 'string', enum: ['instant', 'standard', 'scheduled'] },
    scheduledDate: { type: 'string', format: 'date' },
    pin: { type: 'string' },
  },
} as const;

/* ------------------------------------------------------------------ */
/* 2. Observed schemas — derived from real captures                    */
/* ------------------------------------------------------------------ */

export const observedTransaction = {
  $id: 'observed/Transaction',
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'date', 'description', 'category',
    'amount', 'status', 'recipientId', 'createdAt',
  ],
  properties: {
    id: { type: 'string', minLength: 1 },
    date: { type: 'string', format: 'date' },
    description: { type: 'string', minLength: 1 },
    subLabel: { type: ['string', 'null'] },
    category: { type: 'string', enum: ['transfer', 'payment', 'refund', 'withdrawal'] },
    amount: { type: 'number' },
    status: { type: 'string', enum: ['completed', 'pending', 'failed'] },
    recipientId: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const observedTransactionList = {
  $id: 'observed/TransactionList',
  type: 'array',
  items: observedTransaction,
} as const;

export const observedUser = {
  $id: 'observed/User',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'email', 'role', 'avatarInitials'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'MEMBER'] },
    avatarInitials: { type: 'string', minLength: 1, maxLength: 3 },
  },
} as const;

export const observedUserList = {
  $id: 'observed/UserList',
  type: 'array',
  items: observedUser,
} as const;

export const observedContact = {
  $id: 'observed/Contact',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'accountMask', 'avatarInitials', 'ownerId'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    // A masked account must never expose more than the last 4 digits.
    accountMask: { type: 'string', pattern: '^\\*{4}\\d{4}$' },
    avatarInitials: { type: 'string', minLength: 1, maxLength: 3 },
    ownerId: { type: 'string', minLength: 1 },
  },
} as const;

export const observedContactList = {
  $id: 'observed/ContactList',
  type: 'array',
  items: observedContact,
} as const;

/* ------------------------------------------------------------------ */

export interface SchemaResult {
  valid: boolean;
  errors: ErrorObject[];
  /** Human-readable one-line-per-error summary, safe to put in an assertion message. */
  summary: string;
}

const cache = new Map<string, ValidateFunction>();

export function validateSchema(schema: object, payload: unknown): SchemaResult {
  const id = (schema as { $id?: string }).$id ?? JSON.stringify(schema);
  let validate = cache.get(id);
  if (!validate) {
    validate = ajv.compile(schema);
    cache.set(id, validate);
  }
  const valid = validate(payload) as boolean;
  const errors = validate.errors ?? [];
  return {
    valid,
    errors,
    summary: errors
      .map((e) => `  • ${e.instancePath || '(root)'} ${e.message}${
        e.params && Object.keys(e.params).length ? ` ${JSON.stringify(e.params)}` : ''
      }`)
      .join('\n'),
  };
}
