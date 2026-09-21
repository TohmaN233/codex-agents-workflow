import { canonicalJSON, digest, prepareResources } from '../workflow-revisions.mjs';
import { requireValue } from '../workflow-paths.mjs';
import { CONVERSION_CONTRACT } from './conversion-contract.mjs';

function semanticWorkflow(workflow) {
  const {
    revision: _revision,
    status: _status,
    enabled: _enabled,
    id: _id,
    name: _name,
    description: _description,
    tags: _tags,
    ...semantic
  } = structuredClone(workflow);
  return semantic;
}

function manifestOf(resources) {
  if (Array.isArray(resources)) return structuredClone(resources);
  return prepareResources(resources ?? {}).manifest;
}

export function conversionWorkflowHash(workflow) {
  return digest(canonicalJSON(semanticWorkflow(workflow)));
}

export function conversionResourceHash(resources) {
  return digest(canonicalJSON(manifestOf(resources)));
}

export function createConversionCertificate(workflow, resources, { source_revision, proposal_hash, review_contract_version }) {
  requireValue(review_contract_version===CONVERSION_CONTRACT.version,'CONVERSION_REVIEW_CONTRACT_STALE','A current conversion certificate requires the current review contract');
  return {
    version: 1,
    review_contract_version,
    source_revision,
    proposal_hash,
    workflow_hash: conversionWorkflowHash(workflow),
    resources_hash: conversionResourceHash(resources),
  };
}

export function requireCurrentConversionCertificate(workflow, resources, importReport) {
  if (workflow?.import_status?.mode !== 'ai_expanded') return null;
  const certificate=importReport?.expansion?.certificate;
  requireValue(certificate && certificate.version===1,'CONVERSION_CERTIFICATE_REQUIRED','AI-expanded Workflow must be revalidated after semantic edits before Ready publication');
  requireValue(certificate.review_contract_version===CONVERSION_CONTRACT.version,'CONVERSION_CERTIFICATE_STALE','AI-expanded Workflow was validated under an older conversion contract');
  requireValue(certificate.workflow_hash===conversionWorkflowHash(workflow),'CONVERSION_CERTIFICATE_STALE','AI-expanded Workflow changed after conversion validation');
  requireValue(certificate.resources_hash===conversionResourceHash(resources),'CONVERSION_CERTIFICATE_STALE','AI-expanded Workflow resources changed after conversion validation');
  requireValue(certificate.source_revision===importReport?.expansion?.source_revision && certificate.proposal_hash===importReport?.expansion?.proposal_hash,'CONVERSION_CERTIFICATE_STALE','AI-expanded Workflow certificate identity differs from its accepted proposal');
  return structuredClone(certificate);
}
