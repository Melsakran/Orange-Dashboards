export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activity_history: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          new_values: Json | null;
          old_values: Json | null;
          workspace_id: string | null;
          workspace_name: string | null;
          workspace_slug: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
          workspace_id?: string | null;
          workspace_name?: string | null;
          workspace_slug?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
          workspace_id?: string | null;
          workspace_name?: string | null;
          workspace_slug?: string | null;
        };
        Relationships: [];
      };
      jira_status_mappings: {
        Row: {
          created_at: string;
          id: string;
          jira_status_name: string;
          status_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          jira_status_name: string;
          status_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          jira_status_name?: string;
          status_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jira_status_mappings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_jira_settings: {
        Row: {
          created_at: string;
          enabled: boolean;
          last_sync_error: string | null;
          last_sync_issue_count: number;
          last_synced_at: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          last_sync_error?: string | null;
          last_sync_issue_count?: number;
          last_synced_at?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          last_sync_error?: string | null;
          last_sync_issue_count?: number;
          last_synced_at?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_jira_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_identity_registry: {
        Row: {
          name: string;
          slug: string;
          workspace_id: string;
        };
        Insert: {
          name: string;
          slug: string;
          workspace_id: string;
        };
        Update: {
          name?: string;
          slug?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      dept_profile: {
        Row: {
          brand_name: string;
          created_at: string;
          department_head_name: string;
          department_head_title: string;
          hero_headline: string;
          hero_support: string;
          id: string;
          mission: string;
          singleton_key: boolean;
          stat_active_projects: number | null;
          stat_members: number | null;
          stat_on_track_pct: number;
          stat_teams: number | null;
          updated_at: string;
        };
        Insert: {
          brand_name?: string;
          created_at?: string;
          department_head_name?: string;
          department_head_title?: string;
          hero_headline?: string;
          hero_support?: string;
          id?: string;
          mission?: string;
          singleton_key?: boolean;
          stat_active_projects?: number | null;
          stat_members?: number | null;
          stat_on_track_pct?: number;
          stat_teams?: number | null;
          updated_at?: string;
        };
        Update: {
          brand_name?: string;
          created_at?: string;
          department_head_name?: string;
          department_head_title?: string;
          hero_headline?: string;
          hero_support?: string;
          id?: string;
          mission?: string;
          singleton_key?: boolean;
          stat_active_projects?: number | null;
          stat_members?: number | null;
          stat_on_track_pct?: number;
          stat_teams?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      dept_teams: {
        Row: {
          activity_summary: string;
          created_at: string;
          focus: string;
          goal: string;
          id: string;
          lead_name: string;
          name: string;
          project_count: number | null;
          scope: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          activity_summary?: string;
          created_at?: string;
          focus?: string;
          goal?: string;
          id?: string;
          lead_name?: string;
          name: string;
          project_count?: number | null;
          scope?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          activity_summary?: string;
          created_at?: string;
          focus?: string;
          goal?: string;
          id?: string;
          lead_name?: string;
          name?: string;
          project_count?: number | null;
          scope?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      dept_members: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          role: string;
          sort_order: number;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          role?: string;
          sort_order?: number;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          role?: string;
          sort_order?: number;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dept_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "dept_teams";
            referencedColumns: ["id"];
          },
        ];
      };
      dept_projects: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          is_highlighted: boolean;
          owner_name: string;
          progress_pct: number;
          sort_order: number;
          start_date: string | null;
          status_label: string;
          summary: string;
          team_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_highlighted?: boolean;
          owner_name?: string;
          progress_pct?: number;
          sort_order?: number;
          start_date?: string | null;
          status_label?: string;
          summary?: string;
          team_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_highlighted?: boolean;
          owner_name?: string;
          progress_pct?: number;
          sort_order?: number;
          start_date?: string | null;
          status_label?: string;
          summary?: string;
          team_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dept_projects_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "dept_teams";
            referencedColumns: ["id"];
          },
        ];
      };
      dept_milestones: {
        Row: {
          created_at: string;
          due_date: string | null;
          id: string;
          is_done: boolean;
          project_id: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          due_date?: string | null;
          id?: string;
          is_done?: boolean;
          project_id: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          due_date?: string | null;
          id?: string;
          is_done?: boolean;
          project_id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dept_milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "dept_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      dept_timeline_items: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          label: string;
          sort_order: number;
          start_date: string | null;
          status_label: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          label: string;
          sort_order?: number;
          start_date?: string | null;
          status_label?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          label?: string;
          sort_order?: number;
          start_date?: string | null;
          status_label?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          auth_user_id: string;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string;
          display_name: string;
          email: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          author_name: string;
          body: string;
          created_at: string;
          id: string;
          updated_at: string;
          work_item_id: string;
        };
        Insert: {
          author_name: string;
          body: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          work_item_id: string;
        };
        Update: {
          author_name?: string;
          body?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          work_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      ops_request_uploads: {
        Row: {
          file_name: string;
          id: string;
          row_count: number;
          uploaded_at: string;
          uploaded_by: string | null;
          uploaded_by_email: string | null;
        };
        Insert: {
          file_name: string;
          id?: string;
          row_count: number;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Update: {
          file_name?: string;
          id?: string;
          row_count?: number;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Relationships: [];
      };
      ops_requests: {
        Row: {
          assigned_to: string;
          assigned_to_key: string;
          assignment_time: string;
          close_date: string | null;
          closure_code: string;
          closure_comments: string;
          description: string;
          id: string;
          interaction_id: string;
          request_title: string;
          requestor_key: string;
          requestor_name: string;
          status: string;
          title: string;
          upload_id: string;
        };
        Insert: {
          assigned_to?: string;
          assigned_to_key?: string;
          assignment_time: string;
          close_date?: string | null;
          closure_code?: string;
          closure_comments?: string;
          description?: string;
          id?: string;
          interaction_id: string;
          request_title?: string;
          requestor_key?: string;
          requestor_name?: string;
          status: string;
          title?: string;
          upload_id: string;
        };
        Update: {
          assigned_to?: string;
          assigned_to_key?: string;
          assignment_time?: string;
          close_date?: string | null;
          closure_code?: string;
          closure_comments?: string;
          description?: string;
          id?: string;
          interaction_id?: string;
          request_title?: string;
          requestor_key?: string;
          requestor_name?: string;
          status?: string;
          title?: string;
          upload_id?: string;
        };
        Relationships: [];
      };
      pe_daily_manual_rows: {
        Row: { fields: Json; position: number; report_date: string; section: string };
        Insert: { fields: Json; position: number; report_date: string; section: string };
        Update: { fields?: Json; position?: number; report_date?: string; section?: string };
        Relationships: [];
      };
      pe_daily_promos: {
        Row: {
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Insert: {
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Update: {
          day_before?: number;
          last_week?: number;
          position?: number;
          promo?: string;
          report_date?: string;
          yesterday?: number;
        };
        Relationships: [];
      };
      pe_daily_reports: {
        Row: {
          file_name: string;
          report_date: string;
          uploaded_at: string;
          uploaded_by: string | null;
          uploaded_by_email: string | null;
        };
        Insert: {
          file_name: string;
          report_date: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Update: {
          file_name?: string;
          report_date?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Relationships: [];
      };
      pe_daily_settings: {
        Row: { id: boolean; visible_charts: string[] };
        Insert: { id?: boolean; visible_charts?: string[] };
        Update: { id?: boolean; visible_charts?: string[] };
        Relationships: [];
      };
      pe_daily_sms: {
        Row: {
          channel: string;
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Insert: {
          channel: string;
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Update: {
          channel?: string;
          day_before?: number;
          last_week?: number;
          position?: number;
          promo?: string;
          report_date?: string;
          yesterday?: number;
        };
        Relationships: [];
      };
      pe_daily_upselling: {
        Row: { count: number; day: string; position: number; report_date: string };
        Insert: { count: number; day: string; position: number; report_date: string };
        Update: { count?: number; day?: string; position?: number; report_date?: string };
        Relationships: [];
      };
      statuses: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          reporting_category: string;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color: string;
          created_at?: string;
          id?: string;
          name: string;
          reporting_category: string;
          sort_order: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          reporting_category?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "statuses_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      work_items: {
        Row: {
          assignee: string | null;
          created_at: string;
          current_status: string | null;
          description: string | null;
          end_date: string | null;
          id: string;
          jira_issue_id: string | null;
          jira_issue_key: string | null;
          jira_updated_at: string | null;
          last_week_status: string | null;
          parent_id: string | null;
          priority: string;
          progress: number;
          project_tier: string;
          readiness_date: string | null;
          release_tag: string | null;
          sort_order: number;
          start_date: string | null;
          status_id: string;
          sync_source: string;
          team_effort_wd: number | null;
          time_to_market_wd: number | null;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          assignee?: string | null;
          created_at?: string;
          current_status?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          jira_issue_id?: string | null;
          jira_issue_key?: string | null;
          jira_updated_at?: string | null;
          last_week_status?: string | null;
          parent_id?: string | null;
          priority?: string;
          progress?: number;
          project_tier?: string;
          readiness_date?: string | null;
          release_tag?: string | null;
          sort_order?: number;
          start_date?: string | null;
          status_id: string;
          sync_source?: string;
          team_effort_wd?: number | null;
          time_to_market_wd?: number | null;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          assignee?: string | null;
          created_at?: string;
          current_status?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          jira_issue_id?: string | null;
          jira_issue_key?: string | null;
          jira_updated_at?: string | null;
          last_week_status?: string | null;
          parent_id?: string | null;
          priority?: string;
          progress?: number;
          project_tier?: string;
          readiness_date?: string | null;
          release_tag?: string | null;
          sort_order?: number;
          start_date?: string | null;
          status_id?: string;
          sync_source?: string;
          team_effort_wd?: number | null;
          time_to_market_wd?: number | null;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_items_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "work_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_workspace_id_status_id_fkey";
            columns: ["workspace_id", "status_id"];
            isOneToOne: false;
            referencedRelation: "statuses";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      work_item_team_tracks: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          sort_order: number;
          start_date: string | null;
          status_id: string;
          team_name: string;
          updated_at: string;
          work_item_id: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          sort_order?: number;
          start_date?: string | null;
          status_id: string;
          team_name: string;
          updated_at?: string;
          work_item_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          sort_order?: number;
          start_date?: string | null;
          status_id?: string;
          team_name?: string;
          updated_at?: string;
          work_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_item_team_tracks_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "work_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_item_team_tracks_status_id_fkey";
            columns: ["status_id"];
            isOneToOne: false;
            referencedRelation: "statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          tag_label: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          tag_label?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          tag_label?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      audit_dashboard_mutation: { Args: Record<PropertyKey, never>; Returns: unknown };
      check_work_item_hierarchy: { Args: Record<PropertyKey, never>; Returns: unknown };
      create_status: {
        Args: {
          p_color: string;
          p_name: string;
          p_reporting_category: string;
          p_status_id: string;
          p_workspace_id: string;
        };
        Returns: Database["public"]["Tables"]["statuses"]["Row"];
      };
      delete_work_item_comments_for_audit: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      replace_ops_requests: { Args: { p_file_name: string; p_rows: Json }; Returns: string };
      delete_pe_daily_report: { Args: { p_report_date: string }; Returns: undefined };
      save_pe_daily_chart_settings: { Args: { p_visible_charts: string[] }; Returns: undefined };
      save_pe_daily_report: {
        Args: {
          p_file_name: string;
          p_promos: Json;
          p_report_date: string;
          p_sms: Json;
          p_upselling: Json;
        };
        Returns: undefined;
      };
      save_pe_daily_section: {
        Args: { p_report_date: string; p_rows: Json; p_section: string };
        Returns: undefined;
      };
      lock_work_item_root_membership: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      list_history_actors: {
        Args: { p_workspace_slug: string };
        Returns: Array<{
          actor_id: string;
          display_name: string;
          email: string | null;
        }>;
      };
      query_activity_history: {
        Args: {
          p_action?: string | null;
          p_actor_id?: string | null;
          p_entity_type?: string | null;
          p_from_date?: string | null;
          p_page?: number;
          p_page_size?: number;
          p_snapshot_at?: string | null;
          p_to_date?: string | null;
          p_workspace_slug: string;
        };
        Returns: Array<{
          action: string;
          actor_display_name: string | null;
          actor_email: string | null;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          new_values: Json | null;
          old_values: Json | null;
          snapshot_at: string;
          total_count: number;
          workspace_id: string | null;
          workspace_name: string | null;
          workspace_slug: string | null;
        }>;
      };
      resolve_history_workspace: {
        Args: { p_workspace_slug: string };
        Returns: Array<{
          is_deleted: boolean;
          name: string;
          slug: string;
          workspace_id: string;
        }>;
      };
      reorder_work_items: {
        Args: {
          p_ordered_item_ids: string[];
          p_parent_id: string | null;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      reorder_statuses: {
        Args: {
          p_ordered_status_ids: string[];
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      replace_and_delete_status: {
        Args: {
          p_expected_updated_at: string;
          p_replacement_status_id: string;
          p_source_status_id: string;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      begin_jira_sync_batch: { Args: Record<PropertyKey, never>; Returns: undefined };
      workspace_jira_enabled: { Args: { target_workspace_id: string }; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    ? (PublicSchema["Tables"] & PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never;
