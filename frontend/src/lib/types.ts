export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ExecutionStatus = "pending" | "executed" | "failed" | "cancelled";

export type RollbackStatus = "not_applicable" | "available" | "rolled_back";

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ActionReceipt {
  action_id: string;
  action_type: string;
  collection: string;
  document_id: string;
  risk_level: RiskLevel;
  risk_score: number;
  risk_reasons: string[];
  blast_radius_summary: string;
  field_changes: FieldChange[];
  business_impact: string[];
  approval_status: ApprovalStatus;
  execution_status: ExecutionStatus;
  rollback_status: RollbackStatus;
  checkpoint_id?: string;
  created_at: string;
  executed_at?: string;
}

export interface RiskClassification {
  status: string;
  risk_level: RiskLevel;
  score: number;
  reasons: string[];
  approval_required: boolean;
  checkpoint_required: boolean;
  rollback_supported: boolean;
  decision: string;
}

export interface BlastRadiusPreview {
  status: string;
  action_id: string;
  collection: string;
  document_id: string;
  field_changes: FieldChange[];
  affected_records: string[];
  business_impact: string[];
  rollback_available: boolean;
  summary: string;
}

export interface ApprovalRequest {
  status: "awaiting_approval";
  action_id: string;
  action_type: string;
  risk_level: RiskLevel;
  risk_score: number;
  collection: string;
  document_id: string;
  field_changes: FieldChange[];
  business_impact: string[];
  blast_radius_summary: string;
  checkpoint_id: string;
  rollback_available: boolean;
  message: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
  toolData?: {
    type: "risk_classification" | "blast_radius" | "approval_request" | "execution_receipt" | "rollback_result";
    data: unknown;
  };
}
