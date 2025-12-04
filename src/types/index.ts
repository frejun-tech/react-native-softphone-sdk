import type { Session } from '../core/Session';

export type SessionType = 'Incoming' | 'Outgoing';

export interface CallDetails {
    candidate?: string;
}

export interface Listeners {
    onConnectionStateChange?: (type: "UserAgentState" | "RegistererState", state: any, isErrorState: boolean, error?: any) => void;
    // Updated to accept Session object
    onCallCreated?: (type: SessionType, session: Session, details: CallDetails) => void;
    onCallRinging?: (session: Session) => void;
    onCallAnswered?: (session: Session) => void;
    onCallHangup?: (session: Session) => void;
    onCallTerminating?: (session: Session) => void;
}