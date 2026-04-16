export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type DisciplineType = 'football' | 'basketball' | 'volleyball' | 'futsal'
export type GenderType = 'M' | 'F'
export type EditionStatus = 'draft' | 'active' | 'finished'
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed'
export type PhaseType = 'group_stage' | 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final'
export type ChampionshipFormat = 'round_robin' | 'series' | 'phase_based'
export type UserRole = 'admin' | 'operator'
export type MatchLegs = 'single' | 'home_away'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: UserRole
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      editions: {
        Row: {
          id: string
          name: string
          year: number
          status: EditionStatus
          start_date: string
          end_date: string
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['editions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['editions']['Insert']>
      }
      disciplines: {
        Row: {
          id: string
          edition_id: string
          name: DisciplineType
          gender: GenderType
          match_duration_minutes: number
          interval_minutes: number
          fields_available: number
          max_matchdays: number
          min_matchdays: number
          daily_start_time: string
          daily_end_time: string
          match_legs: MatchLegs
          enable_cross_group: boolean
          qualifying_per_group: number
          best_thirds_count: number
          max_matches_per_day: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['disciplines']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['disciplines']['Insert']>
      }
      teams: {
        Row: {
          id: string
          edition_id: string
          name: string
          color: string | null
          grade: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['teams']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
      }
      team_disciplines: {
        Row: {
          id: string
          team_id: string
          discipline_id: string
        }
        Insert: Omit<Database['public']['Tables']['team_disciplines']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['team_disciplines']['Insert']>
      }
      phases: {
        Row: {
          id: string
          edition_id: string
          discipline_id: string
          name: string
          phase_type: PhaseType
          order_index: number
          is_knockout: boolean
          format: ChampionshipFormat
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['phases']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['phases']['Insert']>
      }
      groups: {
        Row: {
          id: string
          edition_id: string
          discipline_id: string
          phase_id: string | null
          name: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['groups']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['groups']['Insert']>
      }
      group_teams: {
        Row: {
          id: string
          group_id: string
          team_id: string
          seed: number | null
        }
        Insert: Omit<Database['public']['Tables']['group_teams']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['group_teams']['Insert']>
      }
      matches: {
        Row: {
          id: string
          edition_id: string
          discipline_id: string
          phase_id: string | null
          group_id: string | null
          home_team_id: string | null
          away_team_id: string | null
          scheduled_at: string | null
          field_number: number | null
          match_day: number | null
          status: MatchStatus
          home_score: number | null
          away_score: number | null
          notes: string | null
          bracket_position: string | null
          winner_advances_to: string | null
          winner_slot: 'home' | 'away' | null
          loser_advances_to: string | null
          loser_slot: 'home' | 'away' | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['matches']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['matches']['Insert']>
      }
      blocked_dates: {
        Row: {
          id: string
          edition_id: string
          date: string
          reason: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['blocked_dates']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['blocked_dates']['Insert']>
      }
      venue_slots: {
        Row: {
          id: string
          edition_id: string
          discipline_id: string
          slot_date: string
          field_number: number
          start_time: string
          end_time: string
          match_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['venue_slots']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['venue_slots']['Insert']>
      }
    }
    Views: {
      standings: {
        Row: {
          group_id: string
          team_id: string
          team_name: string
          played: number
          won: number
          drawn: number
          lost: number
          goals_for: number
          goals_against: number
          goal_difference: number
          points: number
        }
      }
    }
    Functions: {}
    Enums: {}
  }
}
