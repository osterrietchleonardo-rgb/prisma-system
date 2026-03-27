export type UserRole = 'director' | 'asesor';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  agency_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agency {
  id: string;
  name: string;
  logo_url: string | null;
  tokko_api_key: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  invite_code: string;
  owner_id: string | null;
  created_at: string;
}

export interface Property {
  id: string;
  tokko_id: string | null;
  agency_id: string;
  assigned_agent_id: string | null;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  property_type: string;
  status: string;
  address: string | null;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  total_area: number | null;
  covered_area: number | null;
  images: string[];
  tokko_data: any;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  agency_id: string;
  assigned_agent_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  pipeline_stage: string;
  notes: string | null;
  tokko_contact_id: string | null;
  first_response_time: string | null;
  chat_analysis: any;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  agent_id: string | null;
  activity_type: string;
  description: string;
  created_at: string;
}

export interface Visit {
  id: string;
  lead_id: string;
  property_id: string;
  agent_id: string | null;
  scheduled_at: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface Valuation {
  id: string;
  agency_id: string;
  agent_id: string | null;
  address: string;
  property_type: string;
  total_area: number;
  covered_area: number;
  bedrooms: number;
  bathrooms: number;
  age_years: number;
  condition: string;
  location_score: number;
  amenities: string[];
  comparable_properties: any[];
  estimated_value: number;
  estimated_rent: number | null;
  methodology: string;
  ai_analysis: string | null;
  created_at: string;
}

export interface AgencyDocument {
  id: string;
  agency_id: string;
  uploaded_by: string | null;
  title: string;
  type: string;
  file_url: string | null;
  video_url: string | null;
  transcription: string | null;
  content_text: string | null;
  created_at: string;
}

export interface Closing {
  id: string;
  lead_id: string | null;
  property_id: string | null;
  agent_id: string | null;
  agency_id: string;
  closing_price: number;
  commission: number;
  closed_at: string;
  created_at: string;
}
