export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          branch_id: string | null
          business_date: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          expires_at: string | null
          id: string
          reason: string
          requester_id: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_date?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expires_at?: string | null
          id?: string
          reason: string
          requester_id: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expires_at?: string | null
          id?: string
          reason?: string
          requester_id?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          branch_id: string | null
          created_at: string
          details: string
          device_info: string | null
          id: string
          ip_address: string | null
          module: string
          new_value: string | null
          previous_value: string | null
          reason: string | null
          record_id: string | null
          target_user_id: string | null
          user_id: string | null
          user_name: string
          user_role: string
        }
        Insert: {
          action: string
          branch_id?: string | null
          created_at?: string
          details: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          module: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
          record_id?: string | null
          target_user_id?: string | null
          user_id?: string | null
          user_name: string
          user_role: string
        }
        Update: {
          action?: string
          branch_id?: string | null
          created_at?: string
          details?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
          record_id?: string | null
          target_user_id?: string | null
          user_id?: string | null
          user_name?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      bad_loan_comments: {
        Row: {
          comment: string
          created_at: string
          created_by: string | null
          id: string
          loan_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bad_loan_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bad_loan_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bad_loan_comments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance_after: number
          branch_id: string | null
          business_day_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          recorded_by: string | null
          reference_number: string
          transaction_date: string
          transaction_number: string
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          branch_id?: string | null
          business_day_id?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          recorded_by?: string | null
          reference_number: string
          transaction_date?: string
          transaction_number: string
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          branch_id?: string | null
          business_day_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          recorded_by?: string | null
          reference_number?: string
          transaction_date?: string
          transaction_number?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          alt_phone: string | null
          approval_level: string | null
          assistant_manager_id: string | null
          branch_code: string
          branch_name: string
          branch_type: string
          closing_time: string | null
          created_at: string
          currency: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          district: string | null
          email: string | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          manager_id: string | null
          manager_name: string | null
          max_cash_holding: number | null
          opening_time: string | null
          phone: string | null
          physical_address: string | null
          region: string | null
          status: string
          town: string | null
          updated_at: string | null
          working_days: string[]
        }
        Insert: {
          alt_phone?: string | null
          approval_level?: string | null
          assistant_manager_id?: string | null
          branch_code: string
          branch_name: string
          branch_type?: string
          closing_time?: string | null
          created_at?: string
          currency?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          manager_id?: string | null
          manager_name?: string | null
          max_cash_holding?: number | null
          opening_time?: string | null
          phone?: string | null
          physical_address?: string | null
          region?: string | null
          status?: string
          town?: string | null
          updated_at?: string | null
          working_days?: string[]
        }
        Update: {
          alt_phone?: string | null
          approval_level?: string | null
          assistant_manager_id?: string | null
          branch_code?: string
          branch_name?: string
          branch_type?: string
          closing_time?: string | null
          created_at?: string
          currency?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          manager_id?: string | null
          manager_name?: string | null
          max_cash_holding?: number | null
          opening_time?: string | null
          phone?: string | null
          physical_address?: string | null
          region?: string | null
          status?: string
          town?: string | null
          updated_at?: string | null
          working_days?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "branches_assistant_manager_id_fkey"
            columns: ["assistant_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_assistant_manager_id_fkey"
            columns: ["assistant_manager_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      business_day_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          branch_id: string | null
          business_date: string | null
          client_info: string | null
          created_at: string
          id: number
          new_status: string | null
          previous_status: string | null
          reason: string | null
          subject_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          branch_id?: string | null
          business_date?: string | null
          client_info?: string | null
          created_at?: string
          id?: number
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          subject_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          branch_id?: string | null
          business_date?: string | null
          client_info?: string | null
          created_at?: string
          id?: number
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_day_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_day_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_day_audit_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      business_days: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          business_date: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string | null
          opened_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          business_date: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          business_date?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_days_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_days_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_days_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_days_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_days_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_days_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_days_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          document_name: string
          document_type: string
          file_url: string
          id: string
          period_from: string | null
          period_to: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          client_id: string
          document_name: string
          document_type: string
          file_url: string
          id?: string
          period_from?: string | null
          period_to?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string
          document_name?: string
          document_type?: string
          file_url?: string
          id?: string
          period_from?: string | null
          period_to?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      client_groups: {
        Row: {
          approval_status: string
          branch: string | null
          branch_id: string | null
          business_day_id: string | null
          chairperson: string | null
          created_at: string
          created_by: string | null
          formation_date: string | null
          group_code: string
          group_loans: number | null
          group_name: string
          group_savings: number | null
          id: string
          loan_officer_id: string | null
          loan_officer_name: string | null
          meeting_day: string | null
          meeting_frequency: string
          meeting_location: string | null
          meeting_time: string | null
          member_count: number
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          secretary: string | null
          status: string
          treasurer: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          approval_status?: string
          branch?: string | null
          branch_id?: string | null
          business_day_id?: string | null
          chairperson?: string | null
          created_at?: string
          created_by?: string | null
          formation_date?: string | null
          group_code: string
          group_loans?: number | null
          group_name: string
          group_savings?: number | null
          id?: string
          loan_officer_id?: string | null
          loan_officer_name?: string | null
          meeting_day?: string | null
          meeting_frequency?: string
          meeting_location?: string | null
          meeting_time?: string | null
          member_count?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secretary?: string | null
          status?: string
          treasurer?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          approval_status?: string
          branch?: string | null
          branch_id?: string | null
          business_day_id?: string | null
          chairperson?: string | null
          created_at?: string
          created_by?: string | null
          formation_date?: string | null
          group_code?: string
          group_loans?: number | null
          group_name?: string
          group_savings?: number | null
          id?: string
          loan_officer_id?: string | null
          loan_officer_name?: string | null
          meeting_day?: string | null
          meeting_frequency?: string
          meeting_location?: string | null
          meeting_time?: string | null
          member_count?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secretary?: string | null
          status?: string
          treasurer?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_groups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_groups_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_groups_loan_officer_id_fkey"
            columns: ["loan_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_groups_loan_officer_id_fkey"
            columns: ["loan_officer_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_groups_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_groups_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          alt_phone_number: string | null
          approval_status: string
          branch_id: string | null
          business_day_id: string | null
          client_number: string
          created_at: string
          date_of_birth: string
          date_registered: string
          death_date: string | null
          district: string
          email: string | null
          employer: string | null
          full_name: string
          gender: string
          group_id: string | null
          id: string
          inactive_date: string | null
          inactive_reason: string | null
          loan_officer_id: string | null
          marital_status: string | null
          member_type: string
          national_id_back: string | null
          national_id_front: string | null
          nin: string
          occupation: string
          parish: string
          passport_photo: string | null
          phone_number: string
          physical_address: string
          readmitted_at: string | null
          registered_by: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          sub_county: string
          updated_at: string
          village: string
          voter_id: string | null
        }
        Insert: {
          alt_phone_number?: string | null
          approval_status?: string
          branch_id?: string | null
          business_day_id?: string | null
          client_number: string
          created_at?: string
          date_of_birth: string
          date_registered?: string
          death_date?: string | null
          district: string
          email?: string | null
          employer?: string | null
          full_name: string
          gender: string
          group_id?: string | null
          id?: string
          inactive_date?: string | null
          inactive_reason?: string | null
          loan_officer_id?: string | null
          marital_status?: string | null
          member_type?: string
          national_id_back?: string | null
          national_id_front?: string | null
          nin: string
          occupation: string
          parish: string
          passport_photo?: string | null
          phone_number: string
          physical_address: string
          readmitted_at?: string | null
          registered_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          sub_county: string
          updated_at?: string
          village: string
          voter_id?: string | null
        }
        Update: {
          alt_phone_number?: string | null
          approval_status?: string
          branch_id?: string | null
          business_day_id?: string | null
          client_number?: string
          created_at?: string
          date_of_birth?: string
          date_registered?: string
          death_date?: string | null
          district?: string
          email?: string | null
          employer?: string | null
          full_name?: string
          gender?: string
          group_id?: string | null
          id?: string
          inactive_date?: string | null
          inactive_reason?: string | null
          loan_officer_id?: string | null
          marital_status?: string | null
          member_type?: string
          national_id_back?: string | null
          national_id_front?: string | null
          nin?: string
          occupation?: string
          parish?: string
          passport_photo?: string | null
          phone_number?: string
          physical_address?: string
          readmitted_at?: string | null
          registered_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          sub_county?: string
          updated_at?: string
          village?: string
          voter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_loan_officer_id_fkey"
            columns: ["loan_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_loan_officer_id_fkey"
            columns: ["loan_officer_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          business_day_id: string | null
          category: string
          created_at: string
          description: string
          expense_date: string
          expense_number: string
          id: string
          payment_method: string
          receipt_url: string | null
          recorded_by: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          business_day_id?: string | null
          category: string
          created_at?: string
          description: string
          expense_date?: string
          expense_number: string
          id?: string
          payment_method: string
          receipt_url?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          business_day_id?: string | null
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          expense_number?: string
          id?: string
          payment_method?: string
          receipt_url?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      group_attendance: {
        Row: {
          attendees: string[]
          business_day_id: string | null
          created_at: string
          group_id: string
          id: string
          meeting_date: string
          notes: string | null
          recorded_by: string | null
        }
        Insert: {
          attendees?: string[]
          business_day_id?: string | null
          created_at?: string
          group_id: string
          id?: string
          meeting_date?: string
          notes?: string | null
          recorded_by?: string | null
        }
        Update: {
          attendees?: string[]
          business_day_id?: string | null
          created_at?: string
          group_id?: string
          id?: string
          meeting_date?: string
          notes?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_attendance_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_attendance_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          client_id: string
          created_at: string
          group_id: string
          id: string
          joined_date: string
          role_in_group: string
        }
        Insert: {
          client_id: string
          created_at?: string
          group_id: string
          id?: string
          joined_date?: string
          role_in_group?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          group_id?: string
          id?: string
          joined_date?: string
          role_in_group?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      guarantors: {
        Row: {
          application_id: string
          created_at: string
          full_name: string
          id: string
          id_copy_url: string | null
          nin: string
          phone_number: string
          physical_address: string
          relationship: string
        }
        Insert: {
          application_id: string
          created_at?: string
          full_name: string
          id?: string
          id_copy_url?: string | null
          nin: string
          phone_number: string
          physical_address: string
          relationship: string
        }
        Update: {
          application_id?: string
          created_at?: string
          full_name?: string
          id?: string
          id_copy_url?: string | null
          nin?: string
          phone_number?: string
          physical_address?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "guarantors_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_applications: {
        Row: {
          application_number: string
          business_day_id: string | null
          client_id: string
          client_photo: string | null
          created_at: string
          guarantor_address: string
          guarantor_name: string
          guarantor_nin: string
          guarantor_phone: string
          guarantor_relationship: string
          guarantor2_address: string | null
          guarantor2_name: string | null
          guarantor2_nin: string | null
          guarantor2_phone: string | null
          guarantor2_relationship: string | null
          id: string
          loan_purpose: string
          product_id: string
          rejection_reason: string | null
          requested_amount: number
          requested_weeks: number
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          supporting_docs: string[] | null
          updated_at: string
        }
        Insert: {
          application_number: string
          business_day_id?: string | null
          client_id: string
          client_photo?: string | null
          created_at?: string
          guarantor_address: string
          guarantor_name: string
          guarantor_nin: string
          guarantor_phone: string
          guarantor_relationship: string
          guarantor2_address?: string | null
          guarantor2_name?: string | null
          guarantor2_nin?: string | null
          guarantor2_phone?: string | null
          guarantor2_relationship?: string | null
          id?: string
          loan_purpose: string
          product_id: string
          rejection_reason?: string | null
          requested_amount: number
          requested_weeks: number
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          supporting_docs?: string[] | null
          updated_at?: string
        }
        Update: {
          application_number?: string
          business_day_id?: string | null
          client_id?: string
          client_photo?: string | null
          created_at?: string
          guarantor_address?: string
          guarantor_name?: string
          guarantor_nin?: string
          guarantor_phone?: string
          guarantor_relationship?: string
          guarantor2_address?: string | null
          guarantor2_name?: string | null
          guarantor2_nin?: string | null
          guarantor2_phone?: string | null
          guarantor2_relationship?: string | null
          id?: string
          loan_purpose?: string
          product_id?: string
          rejection_reason?: string | null
          requested_amount?: number
          requested_weeks?: number
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          supporting_docs?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_applications_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_officers: {
        Row: {
          active_loans_count: number | null
          branch: string | null
          created_at: string
          id: string
          officer_code: string
          phone: string | null
          profile_id: string | null
          registered_clients_count: number | null
          status: string
        }
        Insert: {
          active_loans_count?: number | null
          branch?: string | null
          created_at?: string
          id?: string
          officer_code: string
          phone?: string | null
          profile_id?: string | null
          registered_clients_count?: number | null
          status?: string
        }
        Update: {
          active_loans_count?: number | null
          branch?: string | null
          created_at?: string
          id?: string
          officer_code?: string
          phone?: string | null
          profile_id?: string | null
          registered_clients_count?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_officers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_officers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_products: {
        Row: {
          created_at: string
          description: string
          grace_period_weeks: number | null
          id: string
          interest_rate: number
          interest_type: string
          max_amount: number
          max_weeks: number
          min_amount: number
          min_weeks: number
          penalty_rate: number | null
          processing_fee_percentage: number
          product_name: string
          status: string
        }
        Insert: {
          created_at?: string
          description: string
          grace_period_weeks?: number | null
          id?: string
          interest_rate: number
          interest_type: string
          max_amount: number
          max_weeks: number
          min_amount: number
          min_weeks: number
          penalty_rate?: number | null
          processing_fee_percentage?: number
          product_name: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string
          grace_period_weeks?: number | null
          id?: string
          interest_rate?: number
          interest_type?: string
          max_amount?: number
          max_weeks?: number
          min_amount?: number
          min_weeks?: number
          penalty_rate?: number | null
          processing_fee_percentage?: number
          product_name?: string
          status?: string
        }
        Relationships: []
      }
      loan_repayment_schedule: {
        Row: {
          due_date: string
          id: string
          installment_amount: number
          interest_portion: number
          loan_id: string
          paid_amount: number
          paid_at: string | null
          principal_portion: number
          remaining_balance: number
          status: string
          week_number: number
        }
        Insert: {
          due_date: string
          id?: string
          installment_amount: number
          interest_portion: number
          loan_id: string
          paid_amount?: number
          paid_at?: string | null
          principal_portion: number
          remaining_balance: number
          status?: string
          week_number: number
        }
        Update: {
          due_date?: string
          id?: string
          installment_amount?: number
          interest_portion?: number
          loan_id?: string
          paid_amount?: number
          paid_at?: string | null
          principal_portion?: number
          remaining_balance?: number
          status?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayment_schedule_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_repayments: {
        Row: {
          amount_paid: number
          business_day_id: string | null
          client_id: string
          collection_type: string
          created_at: string
          id: string
          loan_id: string
          notes: string | null
          payment_date: string
          payment_method: string
          receipt_number: string
          recorded_by: string | null
          repayment_number: string
          schedule_id: string | null
          security_amount: number
        }
        Insert: {
          amount_paid: number
          business_day_id?: string | null
          client_id: string
          collection_type?: string
          created_at?: string
          id?: string
          loan_id: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          receipt_number: string
          recorded_by?: string | null
          repayment_number: string
          schedule_id?: string | null
          security_amount?: number
        }
        Update: {
          amount_paid?: number
          business_day_id?: string | null
          client_id?: string
          collection_type?: string
          created_at?: string
          id?: string
          loan_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          receipt_number?: string
          recorded_by?: string | null
          repayment_number?: string
          schedule_id?: string | null
          security_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "loan_repayment_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_reversals: {
        Row: {
          amount: number
          created_at: string
          id: string
          loan_id: string
          reason: string
          reference_number: string | null
          reversal_type: string
          reversed_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          loan_id: string
          reason: string
          reference_number?: string | null
          reversal_type: string
          reversed_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          loan_id?: string
          reason?: string
          reference_number?: string | null
          reversal_type?: string
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_reversals_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_reversals_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_reversals_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_security_returns: {
        Row: {
          branch_id: string | null
          client_id: string
          created_at: string
          duration_weeks: number
          id: string
          interest: number
          loan_id: string
          present_amount: number
          previous_amount: number
          principal: number
          processed_by: string | null
          return_amount: number
          return_date: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          client_id: string
          created_at?: string
          duration_weeks?: number
          id?: string
          interest?: number
          loan_id: string
          present_amount?: number
          previous_amount?: number
          principal?: number
          processed_by?: string | null
          return_amount?: number
          return_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          client_id?: string
          created_at?: string
          duration_weeks?: number
          id?: string
          interest?: number
          loan_id?: string
          present_amount?: number
          previous_amount?: number
          principal?: number
          processed_by?: string | null
          return_amount?: number
          return_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_security_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_security_returns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_security_returns_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_security_returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_security_returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          application_id: string | null
          approved_by: string | null
          bad_debt_comment: string | null
          bad_debt_declared_at: string | null
          business_day_id: string | null
          client_id: string
          completion_percentage: number
          crb_fee_amount: number
          created_at: string
          cycle_number: number
          disbursed_at: string | null
          disbursed_by: string | null
          final_due_date: string
          first_repayment_date: string
          group_maintenance_fee: number
          id: string
          interest_rate: number
          interest_type: string
          is_bad_debt: boolean
          loan_number: string
          loan_period_weeks: number
          net_disbursed_amount: number | null
          outstanding_balance: number
          principal_amount: number
          processing_fee_amount: number
          product_id: string
          security_amount: number
          security_balance: number
          settled_at: string | null
          settled_by: string | null
          settlement_amount: number | null
          status: string
          total_amount_payable: number
          total_interest_amount: number
          updated_at: string
          weekly_installment: number
          writeoff_amount: number | null
          writeoff_at: string | null
          writeoff_by: string | null
          writeoff_reason: string | null
          writeoff_status: string | null
        }
        Insert: {
          application_id?: string | null
          approved_by?: string | null
          bad_debt_comment?: string | null
          bad_debt_declared_at?: string | null
          business_day_id?: string | null
          client_id: string
          completion_percentage?: number
          crb_fee_amount?: number
          created_at?: string
          cycle_number?: number
          disbursed_at?: string | null
          disbursed_by?: string | null
          final_due_date: string
          first_repayment_date: string
          group_maintenance_fee?: number
          id?: string
          interest_rate: number
          interest_type: string
          is_bad_debt?: boolean
          loan_number: string
          loan_period_weeks: number
          net_disbursed_amount?: number | null
          outstanding_balance: number
          principal_amount: number
          processing_fee_amount: number
          product_id: string
          security_amount?: number
          security_balance?: number
          settled_at?: string | null
          settled_by?: string | null
          settlement_amount?: number | null
          status?: string
          total_amount_payable: number
          total_interest_amount: number
          updated_at?: string
          weekly_installment: number
          writeoff_amount?: number | null
          writeoff_at?: string | null
          writeoff_by?: string | null
          writeoff_reason?: string | null
          writeoff_status?: string | null
        }
        Update: {
          application_id?: string | null
          approved_by?: string | null
          bad_debt_comment?: string | null
          bad_debt_declared_at?: string | null
          business_day_id?: string | null
          client_id?: string
          completion_percentage?: number
          crb_fee_amount?: number
          created_at?: string
          cycle_number?: number
          disbursed_at?: string | null
          disbursed_by?: string | null
          final_due_date?: string
          first_repayment_date?: string
          group_maintenance_fee?: number
          id?: string
          interest_rate?: number
          interest_type?: string
          is_bad_debt?: boolean
          loan_number?: string
          loan_period_weeks?: number
          net_disbursed_amount?: number | null
          outstanding_balance?: number
          principal_amount?: number
          processing_fee_amount?: number
          product_id?: string
          security_amount?: number
          security_balance?: number
          settled_at?: string | null
          settled_by?: string | null
          settlement_amount?: number | null
          status?: string
          total_amount_payable?: number
          total_interest_amount?: number
          updated_at?: string
          weekly_installment?: number
          writeoff_amount?: number | null
          writeoff_at?: string | null
          writeoff_by?: string | null
          writeoff_reason?: string | null
          writeoff_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_disbursed_by_fkey"
            columns: ["disbursed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_disbursed_by_fkey"
            columns: ["disbursed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_writeoff_by_fkey"
            columns: ["writeoff_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_writeoff_by_fkey"
            columns: ["writeoff_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      member_fees: {
        Row: {
          admission_fee: number
          branch_id: string | null
          client_id: string
          collected_by: string | null
          crb_fee: number
          created_at: string
          id: string
          passbook_fee: number
          payment_method: string
          receipt_number: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          admission_fee?: number
          branch_id?: string | null
          client_id: string
          collected_by?: string | null
          crb_fee?: number
          created_at?: string
          id?: string
          passbook_fee?: number
          payment_method?: string
          receipt_number?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          admission_fee?: number
          branch_id?: string | null
          client_id?: string
          collected_by?: string | null
          crb_fee?: number
          created_at?: string
          id?: string
          passbook_fee?: number
          payment_method?: string
          receipt_number?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_fees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_fees_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_fees_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_fees_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          message: string
          recipient_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message: string
          recipient_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message?: string
          recipient_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      officer_days: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          business_date: string
          business_day_id: string
          created_at: string
          id: string
          officer_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          started_at: string
          status: string
          submitted_at: string | null
          summary: Json | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          business_date: string
          business_day_id: string
          created_at?: string
          id?: string
          officer_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          business_date?: string
          business_day_id?: string
          created_at?: string
          id?: string
          officer_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "officer_days_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_days_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_days_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_days_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_days_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_days_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_days_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_days_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          description: string | null
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          category: string
          description?: string | null
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          category?: string
          description?: string | null
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_ids: string[]
          created_at: string
          date_joined: string | null
          email: string
          failed_login_attempts: number
          full_name: string
          id: string
          last_login_at: string | null
          last_password_change_at: string | null
          must_change_password: boolean
          phone_number: string | null
          primary_branch_id: string | null
          role: string
          staff_code: string | null
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          two_factor_enabled: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          branch_ids?: string[]
          created_at?: string
          date_joined?: string | null
          email: string
          failed_login_attempts?: number
          full_name: string
          id: string
          last_login_at?: string | null
          last_password_change_at?: string | null
          must_change_password?: boolean
          phone_number?: string | null
          primary_branch_id?: string | null
          role?: string
          staff_code?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          branch_ids?: string[]
          created_at?: string
          date_joined?: string | null
          email?: string
          failed_login_attempts?: number
          full_name?: string
          id?: string
          last_login_at?: string | null
          last_password_change_at?: string | null
          must_change_password?: boolean
          phone_number?: string | null
          primary_branch_id?: string | null
          role?: string
          staff_code?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_branch_id_fkey"
            columns: ["primary_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          generated_at: string
          generated_by: string | null
          id: string
          parameters: Json | null
          period_end: string | null
          period_start: string | null
          report_type: string
          title: string
        }
        Insert: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          parameters?: Json | null
          period_end?: string | null
          period_start?: string | null
          report_type: string
          title: string
        }
        Update: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          parameters?: Json | null
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          level: string
          permission_key: string
          role: string
          updated_at: string
        }
        Insert: {
          level?: string
          permission_key: string
          role: string
          updated_at?: string
        }
        Update: {
          level?: string
          permission_key?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      savings_accounts: {
        Row: {
          account_number: string
          account_type: string
          balance: number
          client_id: string | null
          created_at: string
          group_id: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_number: string
          account_type?: string
          balance?: number
          client_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_type?: string
          balance?: number
          client_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_transactions: {
        Row: {
          account_id: string
          amount: number
          balance_after: number
          business_day_id: string | null
          created_at: string
          id: string
          notes: string | null
          payment_method: string
          receipt_number: string
          recorded_by: string | null
          transaction_number: string
          transaction_type: string
        }
        Insert: {
          account_id: string
          amount: number
          balance_after: number
          business_day_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method: string
          receipt_number: string
          recorded_by?: string | null
          transaction_number: string
          transaction_type: string
        }
        Update: {
          account_id?: string
          amount?: number
          balance_after?: number
          business_day_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          receipt_number?: string
          recorded_by?: string | null
          transaction_number?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transactions_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transactions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          branches: string[] | null
          company_logo_url: string | null
          company_name: string
          default_currency: string
          default_interest_rate: number | null
          default_processing_fee: number | null
          id: number
          receipt_footer: string | null
          report_header: string | null
          updated_at: string
        }
        Insert: {
          branches?: string[] | null
          company_logo_url?: string | null
          company_name?: string
          default_currency?: string
          default_interest_rate?: number | null
          default_processing_fee?: number | null
          id?: number
          receipt_footer?: string | null
          report_header?: string | null
          updated_at?: string
        }
        Update: {
          branches?: string[] | null
          company_logo_url?: string | null
          company_name?: string
          default_currency?: string
          default_interest_rate?: number | null
          default_processing_fee?: number | null
          id?: number
          receipt_footer?: string | null
          report_header?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          client_id: string | null
          created_at: string
          from_branch_id: string | null
          from_group_id: string | null
          from_officer_id: string | null
          group_id: string | null
          id: string
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          status: string
          to_branch_id: string | null
          to_group_id: string | null
          to_officer_id: string | null
          transfer_type: string
          updated_at: string
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          client_id?: string | null
          created_at?: string
          from_branch_id?: string | null
          from_group_id?: string | null
          from_officer_id?: string | null
          group_id?: string | null
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          to_branch_id?: string | null
          to_group_id?: string | null
          to_officer_id?: string | null
          transfer_type: string
          updated_at?: string
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          client_id?: string | null
          created_at?: string
          from_branch_id?: string | null
          from_group_id?: string | null
          from_officer_id?: string | null
          group_id?: string | null
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          to_branch_id?: string | null
          to_group_id?: string | null
          to_officer_id?: string | null
          transfer_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_group_id_fkey"
            columns: ["from_group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_officer_id_fkey"
            columns: ["from_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_officer_id_fkey"
            columns: ["from_officer_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_group_id_fkey"
            columns: ["to_group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_officer_id_fkey"
            columns: ["to_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_officer_id_fkey"
            columns: ["to_officer_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      staff_directory: {
        Row: {
          avatar_url: string | null
          branch_ids: string[] | null
          business_date: string | null
          business_day_status: string | null
          created_at: string | null
          date_joined: string | null
          email: string | null
          failed_login_attempts: number | null
          full_name: string | null
          id: string | null
          last_login_at: string | null
          last_password_change_at: string | null
          must_change_password: boolean | null
          officer_day_rejection_reason: string | null
          officer_day_status: string | null
          officer_day_submitted_at: string | null
          phone_number: string | null
          primary_branch_code: string | null
          primary_branch_id: string | null
          primary_branch_name: string | null
          role: string | null
          staff_code: string | null
          status: string | null
          status_changed_at: string | null
          status_reason: string | null
          two_factor_enabled: boolean | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_branch_id_fkey"
            columns: ["primary_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      account_email_for_phone: { Args: { _phone: string }; Returns: string }
      expire_access_requests: { Args: never; Returns: number }
      log_business_day_audit: {
        Args: {
          _action: string
          _branch_id?: string
          _business_date?: string
          _client_info?: string
          _new_status?: string
          _previous_status?: string
          _reason?: string
          _subject_id?: string
        }
        Returns: undefined
      }
      my_permissions: {
        Args: never
        Returns: {
          level: string
          permission_key: string
        }[]
      }
      my_working_state: {
        Args: never
        Returns: {
          business_date: string
          business_day_status: string
          can_transact: boolean
          is_weekend: boolean
          officer_day_status: string
          reason: string
        }[]
      }
      receive_member_transfer: {
        Args: {
          _to_group_id?: string
          _to_officer_id?: string
          _transfer_id: string
        }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          client_id: string | null
          created_at: string
          from_branch_id: string | null
          from_group_id: string | null
          from_officer_id: string | null
          group_id: string | null
          id: string
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          status: string
          to_branch_id: string | null
          to_group_id: string | null
          to_officer_id: string | null
          transfer_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_failed_login: { Args: { _identifier: string }; Returns: undefined }
      record_successful_login: { Args: never; Returns: undefined }
      reject_member_transfer: {
        Args: { _reason: string; _transfer_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          client_id: string | null
          created_at: string
          from_branch_id: string | null
          from_group_id: string | null
          from_officer_id: string | null
          group_id: string | null
          id: string
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          status: string
          to_branch_id: string | null
          to_group_id: string | null
          to_officer_id: string | null
          transfer_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      server_time: {
        Args: never
        Returns: {
          is_weekend: boolean
          server_date: string
          server_now: string
        }[]
      }
      transfer_group_officer: {
        Args: { _group_id: string; _reason?: string; _to_officer_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          client_id: string | null
          created_at: string
          from_branch_id: string | null
          from_group_id: string | null
          from_officer_id: string | null
          group_id: string | null
          id: string
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          status: string
          to_branch_id: string | null
          to_group_id: string | null
          to_officer_id: string | null
          transfer_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_member_group: {
        Args: { _client_id: string; _reason?: string; _to_group_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          client_id: string | null
          created_at: string
          from_branch_id: string | null
          from_group_id: string | null
          from_officer_id: string | null
          group_id: string | null
          id: string
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          status: string
          to_branch_id: string | null
          to_group_id: string | null
          to_officer_id: string | null
          transfer_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
