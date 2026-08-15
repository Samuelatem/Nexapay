/** Domain types, derived from observed payloads — not from the (incomplete) contract. */

export type TransactionStatus = 'completed' | 'pending' | 'failed';
export type TransactionCategory = 'transfer' | 'payment' | 'refund' | 'withdrawal';
export type Role = 'ADMIN' | 'MANAGER' | 'MEMBER';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  subLabel: string | null;
  category: TransactionCategory;
  amount: number;
  status: TransactionStatus;
  recipientId: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarInitials: string;
}

export interface Contact {
  id: string;
  name: string;
  accountMask: string;
  avatarInitials: string;
  ownerId: string;
}

export interface TransferResponse {
  id: string;
  status: TransactionStatus;
  createdAt: string;
  expectedSettlementAt?: string;
}
