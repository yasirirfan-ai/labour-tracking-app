export interface User {
    id: string;
    worker_id: string;
    username: string;
    name: string;
    role: 'manager' | 'employee';
    password?: string;
    hourly_rate: number;
    status?: 'offline' | 'present'; // Clocked status
    availability?: 'available' | 'break'; // Break status
    last_status_change?: string;
    phone?: string;
    email?: string;
    address?: string;
}

export interface DisciplinaryPolicy {
    id: string;
    title: string;
    content: string;
    version: string;
    effective_date: string;
    is_active: boolean;
    created_at: string;
    document_number: string;
}

export interface DisciplinaryIncident {
    id: string;
    worker_id: string;
    reported_by: string;
    incident_date: string;
    category: string;
    severity: 'minor' | 'major' | 'gross_misconduct';
    description: string;
    documentation?: string;
    attachment_url?: string;
    worker_explanation?: string;
    worker_signature?: string;
    signed_at?: string;
    status: string;
    created_at: string;
}

export interface DisciplinaryAction {
    id: string;
    worker_id: string;
    incident_id: string;
    action_step: 'verbal_warning' | 'written_warning' | 'suspension' | 'termination';
    is_override: boolean;
    override_reason?: string;
    executive_approval_id?: string;
    issued_date: string;
    expiry_date?: string;
    status: string;
    created_at: string;
}

export interface PolicyAcknowledgment {
    id: string;
    policy_id: string;
    worker_id: string;
    signed_at: string;
    signature_data: string;
    ip_address?: string;
}

export interface ActivityLog {
    id: string;
    worker_id: string;
    event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end' | 'task_start' | 'task_stop' | 'task_pause' | 'task_resume' | 'task_complete';
    related_task_id?: string;
    description: string;
    details?: string;
    timestamp: string;
}

export interface Task {
    id: string;
    description: string;
    mo_reference: string;
    assigned_to_id: string;
    status: string;
    hourly_rate: number;
    active_seconds: number;
    break_seconds: number;
    total_duration_seconds: number;
    start_time: string | null;
    last_action_time: string | null;
    end_time: string | null;
    created_at: string;
    manual: boolean;
    reason?: string;
}

export interface ManufacturingOrder {
    id: string;
    mo_number: string;
    product_name: string;
    sku: string;
    quantity: number;
    po_number: string;
    event_id: string;
    scheduled_date: string;
    current_status: string;
    created_at?: string;
    is_pinned?: boolean;
    sort_order?: number;
}

export interface Operation {
    id: number;
    name: string;
    description: string;
    sort_order: number;
}
