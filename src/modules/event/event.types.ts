export interface EventData {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  location?: string;
  banner?: string;
  createdById: string;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  location: string | null;
  banner: string | null;
  createdById: string | null;
  createdAt: Date;
}