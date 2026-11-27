
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBackendAPI } from '@shared/hooks/useBackendAPI';
import CreateIssueModal from './CreateIssueModal';
import IssueDetailModal from './components/IssueDetailModal';
import UsersGroupsManagement from './components/UsersGroupsManagement';
import AdminPanel from './components/AdminPanel';

const APP_NAME = "Zira"

// --- Types ---

export interface Project {
  id: string;
  key: string;
  name: string;
  lead?: string;
  description?: string;
  avatarUrls?: Record<string, string>;
  projectTypeKey?: string;
}

export interface User {
  accountId: string;
  displayName: string;
  name?: string;
  emailAddress?: string;
  active: boolean;
  avatarUrls?: Record<string, string>;
  groups?: string[];
}

export interface IssueType {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  subtask: boolean;
}

export interface Priority {
  id: string;
  name: string;
  iconUrl?: string;
  statusColor?: string;
}

export interface Status {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  statusCategory?: {
    id: number;
    key: string; // 'new', 'indeterminate', 'done'
    colorName: string;
    name: string;
  };
}

export interface Issue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    project: Project;
    issuetype: IssueType;
    priority?: Priority;
    status: Status;
    assignee?: User;
    reporter?: User;
    created: string;
    updated: string;
    labels?: string[];
    [key: string]: any;
  };
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  self_url?: string;
  view_url?: string;
}

export interface Filter {
  id: string;
  name: string;
  description?: string;
  jql: string;
  owner?: { name: string };
  favorite: boolean;
  favoriteCount?: number;
  editable?: boolean;
  sharePermissions?: any[];
}

export interface Component {
  id: string;
  project: string;
  name: string;
  description?: string;
  owner?: string;
}

export interface Version {
  id: string;
  name: string;
  description?: string;
  archived: boolean;
  released: boolean;
  releaseDate?: string;
  project: string;
}

export interface Group {
  groupId: string;
  name: string;
  users: string[];
}

// --- API Hook ---

interface Workflow {
  id: string;
  name: string;
  steps: string[];
}

const useZiraAPI = () => {
  const { callTool: call } = useBackendAPI('zira');

  // --- Projects ---
  const getProjects = useCallback(async () => {
    return call<any, { projects: Record<string, Project> }>('get_all_projects', {});
  }, [call]);

  const createProject = useCallback(async (key: string, name: string, lead?: string) => {
    return call('create_project', { proj_key: key, proj_name: name, proj_lead: lead });
  }, [call]);

  const deleteProject = useCallback(async (key: string) => {
    return call('delete_project_by_key', { project_key: key });
  }, [call]);

  // --- Issues ---
  const searchIssues = useCallback(async (jql: string, startAt = 0, maxResults = 50) => {
    return call<any, { issues: Issue[], total: number }>('search_issues_jql', { jql, start_at: startAt, max_results: maxResults });
  }, [call]);

  const createIssue = useCallback(async (fields: any) => {
    return call('create_issue', { fields });
  }, [call]);

  const getIssue = useCallback(async (issueIdOrKey: string) => {
    return call('get_issue_by_id', { issue_id: issueIdOrKey });
  }, [call]);

  const updateIssue = useCallback(async (issueId: string, fields: any) => {
    return call('update_issue_by_id', { issue_id: issueId, fields });
  }, [call]);

  const deleteIssue = useCallback(async (issueId: string, deleteSubtasks: boolean = false) => {
    return call('delete_issue_by_id', { issue_id: issueId, delete_subtasks: deleteSubtasks });
  }, [call]);

  const assignIssue = useCallback(async (issueId: string, assigneeName: string | null) => {
    return call('assign_issue_to_user', { issue_id: issueId, assignee: { name: assigneeName } });
  }, [call]);

  // --- Dashboards ---
  const getDashboards = useCallback(async () => {
    return call<any, { dashboards: Dashboard[] }>('get_all_dashboards', {});
  }, [call]);

  const getDashboard = useCallback(async (dashId: string) => {
    return call<any, Dashboard>('get_dashboard_by_id', { dash_id: dashId });
  }, [call]);

  // --- Filters ---
  const getFilters = useCallback(async () => {
    return call<any, { filters: Filter[] }>('get_all_filters', {});
  }, [call]);

  const updateFilter = useCallback(async (filterId: string, updates: { name?: string; jql?: string; description?: string; favorite?: boolean; editable?: boolean }) => {
    return call('update_filter_by_id', { filter_id: filterId, ...updates });
  }, [call]);

  // --- Components ---
  const getProjectComponents = useCallback(async (projectKey: string) => {
    return call<any, { components: Component[] }>('get_project_components_by_key', { project_key: projectKey });
  }, [call]);

  const createComponent = useCallback(async (project: string, name: string, description?: string, owner?: string) => {
    return call('create_project_component', { project, name, description, owner });
  }, [call]);

  const updateComponent = useCallback(async (compId: string, updates: { name?: string; description?: string; owner?: string }) => {
    return call('update_component_by_id', { comp_id: compId, ...updates });
  }, [call]);

  const deleteComponent = useCallback(async (compId: string, moveIssuesTo?: string) => {
    return call('delete_component_by_id', { comp_id: compId, moveIssuesTo });
  }, [call]);

  // --- Versions ---
  const getVersion = useCallback(async (verId: string) => {
    return call<any, Version>('get_version_by_id', { ver_id: verId });
  }, [call]);

  const createVersion = useCallback(async (name: string, project: string, description?: string, releaseDate?: string, released?: boolean, archived?: boolean) => {
    return call('create_version', { name, project, description, release_date: releaseDate, released, archived });
  }, [call]);

  const deleteVersion = useCallback(async (verId: string, moveFixIssuesTo?: string, moveAffectedIssuesTo?: string) => {
    return call('delete_version_by_id', { ver_id: verId, move_fix_issues_to: moveFixIssuesTo, move_affected_issues_to: moveAffectedIssuesTo });
  }, [call]);

  // --- Workflows ---
  const getWorkflows = useCallback(async () => {
    return call<any, { workflows: Workflow[] }>('get_all_workflows', {});
  }, [call]);

  const getPriorities = useCallback(async () => {
    return call<any, { priorities: Priority[] }>('get_all_priorities', {});
  }, [call]);

  const getIssueTypes = useCallback(async () => {
    return call<any, { issueTypes: IssueType[] }>('get_all_issue_types', {});
  }, [call]);

  // --- Users ---
  const getUsers = useCallback(async (searchString: string) => {
    return call<any, any[]>('find_users', { search_string: searchString });
  }, [call]);

  const getUser = useCallback(async (username?: string, accountId?: string) => {
    return call('get_user_by_username_or_account_id', { username, account_id: accountId });
  }, [call]);

  const createUser = useCallback(async (payload: any) => {
    return call('create_user', { payload });
  }, [call]);

  const deleteUser = useCallback(async (username?: string, key?: string) => {
    return call('delete_user_by_username_or_key', { username, key });
  }, [call]);

  // --- Groups ---
  const getGroup = useCallback(async (groupname?: string, groupId?: string) => {
    // Only pass one parameter - backend requires exactly one
    const params = groupname ? { groupname } : { groupId };
    return call<any, { group: Group }>('get_group_by_name', params);
  }, [call]);

  const createGroup = useCallback(async (name: string) => {
    return call('create_group', { name });
  }, [call]);

  const updateGroup = useCallback(async (groupname: string, users: string[]) => {
    return call('update_group_members_by_name', { groupname, users });
  }, [call]);

  const deleteGroup = useCallback(async (groupname?: string, groupId?: string) => {
    // Only pass one parameter - backend requires exactly one
    const params = groupname ? { groupname } : { groupId };
    return call('delete_group_by_name', params);
  }, [call]);

  const findGroups = useCallback(async (query?: string, maxResults?: number, accountId?: string) => {
    // API returns { groups: string[] } - array of group names
    return call<any, { groups: string[] }>('find_groups_for_picker', { query, maxResults, accountId });
  }, [call]);

  // --- Bulk Operations ---
  const bulkDeleteIssues = useCallback(async (issueIds: string[]) => {
    return call('bulk_delete_issues', { issue_ids: issueIds });
  }, [call]);

  const performBulkIssueOperations = useCallback(async (issueUpdates: any[]) => {
    return call('perform_bulk_issue_operations', { issueUpdates });
  }, [call]);

  const searchIssuesForPicker = useCallback(async (query?: string, currentJQL?: string, currentIssueKey?: string) => {
    return call('search_issues_for_picker', { query, currentJQL, currentIssueKey });
  }, [call]);

  // --- Issue Create Metadata ---
  const getIssueCreateMetadata = useCallback(async () => {
    return call('get_issue_create_metadata', {});
  }, [call]);

  // --- Version Related Issue Counts ---
  const getVersionRelatedIssueCounts = useCallback(async (verId: string) => {
    return call('get_version_related_issue_counts_by_id', { ver_id: verId });
  }, [call]);

  return {
    callTool: call,
    // Projects
    getProjects, createProject, deleteProject,
    // Issues
    searchIssues, createIssue, getIssue, updateIssue, deleteIssue, assignIssue,
    // Bulk Operations
    bulkDeleteIssues, performBulkIssueOperations, searchIssuesForPicker,
    // Issue Metadata
    getIssueCreateMetadata,
    // Dashboards
    getDashboards, getDashboard,
    // Filters
    getFilters, updateFilter,
    // Components
    getProjectComponents, createComponent, updateComponent, deleteComponent,
    // Versions
    getVersion, createVersion, deleteVersion, getVersionRelatedIssueCounts,
    // Workflows & Metadata
    getWorkflows, getPriorities, getIssueTypes,
    // Users
    getUsers, getUser, createUser, deleteUser,
    // Groups
    getGroup, createGroup, updateGroup, deleteGroup, findGroups
  };
};

// --- Components ---

interface LayoutProps {
  sidebar: React.ReactNode;
  content: React.ReactNode;
  children?: React.ReactNode;
}

const Layout = ({ sidebar, content, children }: LayoutProps) => {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif', boxSizing: 'border-box', color: '#1e293b' }}>
      <div style={{ width: '256px', flexShrink: 0, backgroundColor: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' }}>
        {sidebar}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {content}
      </div>
      {children}
    </div>
  );
};

// --- Types ---
type ViewType = 'projects' | 'dashboards' | 'issues' | 'backlog' | 'board' | 'users-groups' | 'filters' | 'components' | 'versions' | 'project-settings' | 'admin';

interface SidebarProps {
  projects: Project[];
  selectedProjectId?: string;
  onSelectProject: (projectId: string) => void;
  onNavigate: (view: ViewType) => void;
  currentView: ViewType;
}

const Sidebar = ({
  projects,
  selectedProjectId,
  onSelectProject,
  onNavigate,
  currentView
}: SidebarProps) => {
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: '8px',
    backgroundColor: active ? 'rgba(202,138,4,0.18)' : 'transparent',
    color: active ? '#fde68a' : '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13.5px',
    fontWeight: active ? 500 : 400,
    marginBottom: '2px',
    transition: 'background-color 0.15s, color 0.15s'
  });
  const sectionHeading: React.CSSProperties = { textTransform: 'uppercase', fontSize: '10.5px', fontWeight: 600, marginBottom: '10px', color: '#64748b', letterSpacing: '0.06em', padding: '0 12px' };

  return (
    <div style={{ padding: '22px 14px', height: '100%', overflowY: 'auto' }}>
      <div
        style={{ marginBottom: '28px', fontWeight: 600, fontSize: '17px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 12px', letterSpacing: '-0.01em' }}
        onClick={() => onNavigate('projects')}
      >
        <span style={{ fontSize: '18px' }}>🔷</span> {APP_NAME}
      </div>

      {selectedProject ? (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
            <div style={{ width: '28px', height: '28px', backgroundColor: '#CA8A04', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, color: 'white', flexShrink: 0 }}>
              {selectedProject.key.substring(0, 1)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedProject.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'rgba(241,245,249,0.5)', fontWeight: 400 }}>[{selectedProject.id}]</span></div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Software project</div>
            </div>
          </div>

          <h3 style={sectionHeading}>
            Planning
          </h3>
          <div onClick={() => onNavigate('backlog')} style={navItemStyle(currentView === 'backlog')}>
            <span>📑</span> Backlog
          </div>
          <div onClick={() => onNavigate('board')} style={navItemStyle(currentView === 'board')}>
            <span>📋</span> Board
          </div>

          <h3 style={{ ...sectionHeading, marginTop: '20px' }}>
            Project Settings
          </h3>
          <div onClick={() => onNavigate('components')} style={navItemStyle(currentView === 'components')}>
            <span>🧩</span> Components
          </div>
          <div onClick={() => onNavigate('versions')} style={navItemStyle(currentView === 'versions')}>
            <span>📦</span> Versions
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={sectionHeading}>
            Menu
          </h3>
          <div onClick={() => onNavigate('projects')} style={navItemStyle(currentView === 'projects')}>
            <span>📂</span> Projects
          </div>
          <div onClick={() => onNavigate('dashboards')} style={navItemStyle(currentView === 'dashboards')}>
            <span>📊</span> Dashboards
          </div>
          <div onClick={() => onNavigate('filters')} style={navItemStyle(currentView === 'filters')}>
            <span>🔍</span> Filters
          </div>
          <div onClick={() => onNavigate('users-groups')} style={navItemStyle(currentView === 'users-groups')}>
            <span>👥</span> Users & Groups
          </div>
          <div onClick={() => onNavigate('admin')} style={navItemStyle(currentView === 'admin')}>
            <span>⚙️</span> Administration
          </div>
        </div>
      )}

      <div>
        <h3 style={sectionHeading}>
          Recent Projects
        </h3>
        {projects.slice(0, 5).map(project => {
          const active = selectedProjectId === project.id;
          return (
            <div
              key={`sidebar_${project.id}`}
              onClick={() => onSelectProject(project.id)}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                borderRadius: '8px',
                backgroundColor: active ? 'rgba(202,138,4,0.22)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13.5px',
                color: active ? '#fde68a' : '#e2e8f0',
                marginBottom: '2px',
                transition: 'background-color 0.15s'
              }}
            >
              <div style={{ width: '22px', height: '22px', backgroundColor: '#CA8A04', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
                {project.key.substring(0, 1)}
              </div>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'rgba(241,245,249,0.45)' }}>[{project.id}]</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


interface ProjectListProps {
  projects: Project[];
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectKey: string) => void;
}

const ProjectList = ({ projects, onCreateProject, onSelectProject, onDeleteProject }: ProjectListProps) => {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px 32px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Projects</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: '#CA8A04',
              color: 'white',
              border: 'none',
              padding: '9px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
              transition: 'background-color 0.15s, transform 0.05s'
            }}
          >
            Create project
          </button>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Key</th>
                <th style={{ padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Lead</th>
                <th style={{ padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.4 }}>📂</div>
                    <div style={{ fontWeight: 500, color: '#475569', marginBottom: '4px' }}>No projects yet</div>
                    <div>Create one to get started.</div>
                  </td>
                </tr>
              ) : (
                projects.map(project => (
                  <tr
                    key={`list_${project.id}`}
                    style={{ borderTop: '1px solid #f1f5f9', transition: 'background-color 0.12s' }}
                    onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.backgroundColor = '#fafbfc'}
                    onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td
                      style={{ padding: '14px 20px', color: '#1e293b', fontSize: '14px', cursor: 'pointer' }}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', backgroundColor: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${project.name}`} alt="" style={{ width: '32px', height: '32px' }} />
                        </div>
                        <span style={{ fontWeight: 500, color: '#0f172a' }}>{project.name}</span>
                        <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#94a3b8' }}>[{project.id}]</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', color: '#475569', fontSize: '13px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{project.key}</td>
                    <td style={{ padding: '14px 20px', color: '#475569', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#f1f5f9', overflow: 'hidden', flexShrink: 0 }}>
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${project.lead}`} alt="" />
                        </div>
                        {project.lead || <span style={{ color: '#94a3b8' }}>Unassigned</span>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to delete project "${project.name}"? This will also delete all issues, components, and versions in this project.`)) {
                            onDeleteProject(project.key);
                          }
                        }}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: 'transparent',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 500,
                          transition: 'background-color 0.12s, border-color 0.12s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#fecaca'; }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={() => {
            setShowCreateModal(false);
            onCreateProject();
          }}
        />
      )}
    </div>
  );
};

// Create Project Modal Component
interface CreateProjectModalProps {
  onClose: () => void;
  onCreate: () => void;
}

const CreateProjectModal = ({ onClose, onCreate }: CreateProjectModalProps) => {
  const { createProject, getUsers } = useZiraAPI();
  const [projectKey, setProjectKey] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectLead, setProjectLead] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const result = await getUsers('@');
        setUsers(result || []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [getUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectKey || !projectName) {
      alert('Project Key and Name are required');
      return;
    }
    setLoading(true);
    try {
      await createProject(projectKey.toUpperCase(), projectName, projectLead || undefined);
      onCreate();
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const modalLabel: React.CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' };
  const modalInput: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '14px', backgroundColor: '#fafbfc', outline: 'none' };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(2px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white', width: '480px', maxWidth: '90%',
        borderRadius: '14px', boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>Create project</h2>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          <div style={{ marginBottom: '18px' }}>
            <label style={modalLabel}>
              Project Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My Project"
              style={modalInput}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={modalLabel}>
              Project Key <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
              placeholder="PROJ"
              style={{ ...modalInput, textTransform: 'uppercase', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
              A unique identifier for this project (e.g., PROJ, TEST)
            </p>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={modalLabel}>
              Project Lead
            </label>
            <select
              value={projectLead}
              onChange={(e) => setProjectLead(e.target.value)}
              style={modalInput}
              disabled={loadingUsers}
            >
              <option value="">— No lead (optional) —</option>
              {users.map(user => (
                <option key={user.accountId} value={user.name || user.accountId}>
                  {user.displayName} {user.emailAddress ? `(${user.emailAddress})` : ''}
                </option>
              ))}
            </select>
            {loadingUsers && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>Loading users...</p>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 18px', border: 'none', borderRadius: '8px',
                backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
              }}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface IssueListProps {
  issues: Issue[];
  loading: boolean;
  onSearch: (jql: string) => void;
  projectName?: string;
  projectKey?: string;
  onCreateIssue: () => void;
  onIssueClick: (issue: Issue) => void;
  users: User[];
  onDeleteIssue?: (issueId: string) => void;
  onBulkDelete?: (issueIds: string[]) => Promise<void>;
  onBulkUpdate?: (issueUpdates: any[]) => Promise<void>;
}

const IssueList = ({ issues, loading, onSearch, projectName, projectKey, onCreateIssue, onIssueClick, users, onDeleteIssue, onBulkDelete, onBulkUpdate }: IssueListProps) => {
  const [jql, setJql] = useState('');
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>('');
  const [bulkStatusValue, setBulkStatusValue] = useState('');
  const [bulkPriorityValue, setBulkPriorityValue] = useState('');

  const toggleIssueSelection = (issueId: string) => {
    setSelectedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIssueIds.size === issues.length) {
      setSelectedIssueIds(new Set());
    } else {
      setSelectedIssueIds(new Set(issues.map(i => i.id)));
    }
  };

  const handleBulkAction = async () => {
    const ids = Array.from(selectedIssueIds);
    if (ids.length === 0) { alert('No issues selected'); return; }

    if (bulkAction === 'delete' && onBulkDelete) {
      if (!confirm(`Delete ${ids.length} issue(s)? This cannot be undone.`)) return;
      await onBulkDelete(ids);
      setSelectedIssueIds(new Set());
    } else if (bulkAction === 'update-status' && onBulkUpdate && bulkStatusValue) {
      const updates = ids.map(id => ({ issueIdOrKey: id, fields: { status: bulkStatusValue } }));
      await onBulkUpdate(updates);
      setSelectedIssueIds(new Set());
    } else if (bulkAction === 'update-priority' && onBulkUpdate && bulkPriorityValue) {
      const updates = ids.map(id => ({ issueIdOrKey: id, fields: { priority: bulkPriorityValue } }));
      await onBulkUpdate(updates);
      setSelectedIssueIds(new Set());
    }
  };

  useEffect(() => {
    if (projectKey) {
      setJql(`project = "${projectKey}" ORDER BY created DESC`);
    } else {
      setJql(`ORDER BY created DESC`);
    }
  }, [projectKey]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(jql);
  };

  const getAssigneeName = (assignee: any) => {
    if (!assignee) return 'Unassigned';
    // If assignee is a string (accountId or username), look up the user
    if (typeof assignee === 'string') {
      if (assignee === 'Unassigned') return 'Unassigned';
      const user = users.find(u => u.accountId === assignee || u.name === assignee);
      return user?.displayName || assignee;
    }
    // If assignee is an object with name field, look up display name
    const name = assignee.name;
    if (!name || name === 'Unassigned') return 'Unassigned';
    const user = users.find((u: any) => u.name === name);
    return user?.displayName || assignee.displayName || name;
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px 32px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
              {projectName ? `${projectName} issues` : 'Issues'}
            </h1>
            <button
              onClick={onCreateIssue}
              style={{
                backgroundColor: '#CA8A04',
                color: 'white',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
              }}
            >
              Create issue
            </button>
          </div>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '640px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', opacity: 0.6 }}>🔍</span>
              <input
                type="text"
                value={jql}
                onChange={(e) => setJql(e.target.value)}
                placeholder="Search issues (JQL)"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: '#1e293b',
                  backgroundColor: 'white',
                  outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#CA8A04'; e.target.style.boxShadow = '0 0 0 3px rgba(202, 138, 4, 0.12)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <button type="submit" style={{ padding: '10px 18px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', color: '#475569', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>Search</button>
          </form>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedIssueIds.size > 0 && (
          <div style={{ marginBottom: '14px', padding: '12px 16px', backgroundColor: '#fefce8', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', border: '1px solid #fde68a' }}>
            <span style={{ fontWeight: 600, color: '#713f12', fontSize: '13px' }}>{selectedIssueIds.size} selected</span>
            <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', backgroundColor: 'white' }}>
              <option value="">— Bulk action —</option>
              <option value="delete">Delete selected</option>
              <option value="update-status">Update status</option>
              <option value="update-priority">Update priority</option>
            </select>
            {bulkAction === 'update-status' && (
              <input value={bulkStatusValue} onChange={e => setBulkStatusValue(e.target.value)} placeholder="New status..." style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', backgroundColor: 'white' }} />
            )}
            {bulkAction === 'update-priority' && (
              <input value={bulkPriorityValue} onChange={e => setBulkPriorityValue(e.target.value)} placeholder="New priority..." style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', backgroundColor: 'white' }} />
            )}
            <button onClick={handleBulkAction} disabled={!bulkAction} style={{ padding: '6px 14px', border: 'none', borderRadius: '7px', backgroundColor: bulkAction === 'delete' ? '#dc2626' : '#CA8A04', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600, opacity: !bulkAction ? 0.5 : 1 }}>
              Apply
            </button>
            <button onClick={() => setSelectedIssueIds(new Set())} style={{ padding: '6px 10px', border: 'none', background: 'transparent', color: '#713f12', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>Clear</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading issues...</div>
        ) : (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '12px 8px 12px 20px', width: '36px' }}>
                    <input type="checkbox" style={{ accentColor: '#CA8A04', width: '15px', height: '15px' }} checked={issues.length > 0 && selectedIssueIds.size === issues.length} onChange={toggleSelectAll} />
                  </th>
                  <th style={{ padding: '12px 12px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', width: '40px' }}>Type</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Key</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', width: '35%' }}>Summary</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Assignee</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Priority</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', width: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>🔍</div>
                      <div style={{ fontWeight: 500, color: '#475569', marginBottom: '4px' }}>No issues found</div>
                      <div>Try adjusting your search query.</div>
                    </td>
                  </tr>
                ) : (
                  issues.map(issue => {
                    const statusName = typeof issue.fields.status === 'string' ? issue.fields.status : (issue.fields.status as any)?.name || 'Open';
                    const sLow = (statusName || '').toLowerCase();
                    let statusBg = '#f1f5f9', statusFg = '#475569', statusDot = '#94a3b8';
                    if (sLow.includes('done') || sLow.includes('closed') || sLow.includes('resolved')) { statusBg = '#dcfce7'; statusFg = '#166534'; statusDot = '#16a34a'; }
                    else if (sLow.includes('progress') || sLow.includes('review')) { statusBg = '#fef9c3'; statusFg = '#854d0e'; statusDot = '#CA8A04'; }
                    else if (sLow.includes('block')) { statusBg = '#fee2e2'; statusFg = '#991b1b'; statusDot = '#dc2626'; }
                    const priorityName = typeof issue.fields.priority === 'string' ? issue.fields.priority : (issue.fields.priority as any)?.name || '';
                    const pLow = priorityName.toLowerCase();
                    let priColor = '#94a3b8';
                    if (pLow.includes('highest') || pLow.includes('critical')) priColor = '#dc2626';
                    else if (pLow.includes('high')) priColor = '#ea580c';
                    else if (pLow.includes('medium')) priColor = '#CA8A04';
                    else if (pLow.includes('low')) priColor = '#0891b2';
                    return (
                    <tr
                      key={issue.id}
                      style={{ borderTop: '1px solid #f1f5f9', transition: 'background-color 0.12s', backgroundColor: selectedIssueIds.has(issue.id) ? '#fefce8' : 'transparent' }}
                      onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => { if (!selectedIssueIds.has(issue.id)) e.currentTarget.style.backgroundColor = '#fafbfc'; }}
                      onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => { if (!selectedIssueIds.has(issue.id)) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 8px 12px 20px' }}>
                        <input type="checkbox" style={{ accentColor: '#CA8A04', width: '15px', height: '15px' }} checked={selectedIssueIds.has(issue.id)} onChange={() => toggleIssueSelection(issue.id)} />
                      </td>
                      <td style={{ padding: '12px 12px', cursor: 'pointer' }} onClick={() => onIssueClick(issue)}>
                        <div style={{ width: '20px', height: '20px', backgroundColor: '#ede9fe', color: '#6d28d9', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }} title={typeof issue.fields.issuetype === 'string' ? issue.fields.issuetype : issue.fields.issuetype?.name}>
                          {((typeof issue.fields.issuetype === 'string' ? issue.fields.issuetype : issue.fields.issuetype?.name) || 'T').charAt(0).toUpperCase()}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#475569', fontSize: '13px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} onClick={() => onIssueClick(issue)}>
                        <span style={{ color: '#475569' }}>{issue.key || issue.id}</span>
                        <span style={{ marginLeft: '6px', fontSize: '10.5px', color: '#cbd5e1' }}>[{issue.id}]</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#0f172a', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }} onClick={() => onIssueClick(issue)}>{issue.fields.summary}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', cursor: 'pointer' }} onClick={() => onIssueClick(issue)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#f1f5f9', overflow: 'hidden', flexShrink: 0 }}>
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${getAssigneeName(issue.fields.assignee)}`} alt="" />
                          </div>
                          <span style={{ color: getAssigneeName(issue.fields.assignee) === 'Unassigned' ? '#94a3b8' : '#1e293b', fontSize: '13px' }}>{getAssigneeName(issue.fields.assignee)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => onIssueClick(issue)}>
                        {priorityName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: priColor }} />
                            {priorityName}
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => onIssueClick(issue)}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          backgroundColor: statusBg,
                          color: statusFg,
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          letterSpacing: '0.01em'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusDot }} />
                          {statusName}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {onDeleteIssue && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Are you sure you want to delete issue "${issue.key || issue.id}"?`)) {
                                onDeleteIssue(issue.id);
                              }
                            }}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: 'transparent',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main App ---

interface BoardProps {
  issues: Issue[];
  loading: boolean;
  projectName?: string;
  workflows: Workflow[];
  onCreateIssue: () => void;
  onIssueClick: (issue: Issue) => void;
  onIssueDrop: (issueId: string, fields: any) => Promise<void>;
}

const Board = ({ issues, loading, projectName, workflows, onCreateIssue, onIssueClick, onIssueDrop }: BoardProps) => {
  const activeWorkflow = workflows[0];
  const columns = activeWorkflow ? activeWorkflow.steps.map(step => ({
    id: step.toLowerCase().replace(/\s+/g, ''),
    title: step,
    statusName: step
  })) : [];

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData('issueId', issueId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, statusName: string) => {
    e.preventDefault();
    const issueId = e.dataTransfer.getData('issueId');
    if (issueId) {
      await onIssueDrop(issueId, { status: statusName });
    }
  };

  return (
    <div style={{ padding: '32px 32px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
          {projectName} Board <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 400, marginLeft: '8px' }}>{activeWorkflow?.name ? `· ${activeWorkflow.name}` : ''}</span>
        </h1>
        <button
          onClick={onCreateIssue}
          style={{
            backgroundColor: '#CA8A04',
            color: 'white',
            border: 'none',
            padding: '9px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
          }}
        >
          Create issue
        </button>
      </div>
      <div style={{ display: 'flex', gap: '16px', height: '100%', overflowX: 'auto', paddingBottom: '16px' }}>
        {columns.map(col => {
          const colIssues = issues.filter(i => {
            return i.fields.status === col.statusName;
          });

          return (
            <div
              key={col.id}
              style={{ minWidth: '288px', width: '288px', backgroundColor: '#f1f5f9', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '100%' }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.statusName)}
            >
              <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: '11.5px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{col.title}</span>
                <span style={{ backgroundColor: 'rgba(15, 23, 42, 0.08)', color: '#475569', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>{colIssues.length}</span>
              </div>
              <div style={{ padding: '0 10px 12px', overflowY: 'auto', flex: 1 }}>
                {colIssues.map(issue => {
                  const typeName = (typeof issue.fields.issuetype === 'string' ? issue.fields.issuetype : issue.fields.issuetype?.name) || 'Task';
                  const tLow = typeName.toLowerCase();
                  let typeBg = '#dbeafe', typeFg = '#1e40af';
                  if (tLow === 'bug') { typeBg = '#fee2e2'; typeFg = '#991b1b'; }
                  else if (tLow.includes('story')) { typeBg = '#dcfce7'; typeFg = '#166534'; }
                  else if (tLow.includes('epic')) { typeBg = '#ede9fe'; typeFg = '#6d28d9'; }
                  return (
                  <div
                    key={issue.id}
                    style={{ backgroundColor: 'white', padding: '12px 14px', borderRadius: '10px', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)', marginBottom: '8px', cursor: 'grab', fontSize: '14px', color: '#0f172a', transition: 'box-shadow 0.15s, transform 0.05s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)'; }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, issue.id)}
                    onClick={() => onIssueClick(issue)}
                  >
                    <div style={{ marginBottom: '10px', lineHeight: 1.4, fontWeight: 500 }}>{issue.fields.summary}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: typeBg, color: typeFg, padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.02em' }}>
                          {typeName}
                        </span>
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#94a3b8' }}>{issue.key || issue.id}</span>
                      </div>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${issue.fields.assignee?.name || 'Unassigned'}`} alt="" />
                      </div>
                    </div>
                  </div>
                  );
                })}
                {colIssues.length === 0 && <div style={{ padding: '24px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>No issues</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// --- Dashboard View ---
interface DashboardsViewProps {
  dashboards: Dashboard[];
  onRefresh: () => void;
}

const DashboardsView = ({ dashboards, onRefresh }: DashboardsViewProps) => {
  useEffect(() => {
    onRefresh();
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Dashboards</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {dashboards.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '64px 24px', textAlign: 'center', color: '#94a3b8', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', fontSize: '14px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.4 }}>📊</div>
            <div style={{ fontWeight: 500, color: '#475569' }}>No dashboards yet</div>
          </div>
        ) : (
          dashboards.map(dashboard => (
            <div
              key={dashboard.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '18px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)',
                transition: 'box-shadow 0.18s, transform 0.05s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.05)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '36px', backgroundColor: '#fef3c7', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                  📊
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dashboard.name}<span style={{ marginLeft: '6px', fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#cbd5e1', fontWeight: 400 }}>[{dashboard.id}]</span></div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Owner: {dashboard.owner || 'Unknown'}</div>
                </div>
              </div>
              {dashboard.description && (
                <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>{dashboard.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- Filters View ---
interface FiltersViewProps {
  filters: Filter[];
  onRefresh: () => void;
  onUpdateFilter: (filterId: string, updates: any) => Promise<any>;
}

const FiltersView = ({ filters, onRefresh, onUpdateFilter }: FiltersViewProps) => {
  const [editingFilter, setEditingFilter] = useState<Filter | null>(null);
  const [editName, setEditName] = useState('');
  const [editJql, setEditJql] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    onRefresh();
  }, []);

  const handleEdit = (filter: Filter) => {
    setEditingFilter(filter);
    setEditName(filter.name);
    setEditJql(filter.jql);
    setEditDescription(filter.description || '');
  };

  const handleSave = async () => {
    if (!editingFilter) return;
    try {
      await onUpdateFilter(editingFilter.id, {
        name: editName,
        jql: editJql,
        description: editDescription
      });
      setEditingFilter(null);
      onRefresh();
    } catch (e) {
      console.error('Failed to update filter:', e);
      alert('Failed to update filter: ' + e);
    }
  };

  const thStyle: React.CSSProperties = { padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' };
  const modalLabel: React.CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' };
  const modalInput: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '14px', backgroundColor: '#fafbfc', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Filters</h1>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Owner</th>
              <th style={thStyle}>JQL</th>
              <th style={{ ...thStyle, width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>🔍</div>
                  <div style={{ fontWeight: 500, color: '#475569' }}>No filters yet</div>
                </td>
              </tr>
            ) : (
              filters.map(filter => (
                <tr key={filter.id} style={{ borderTop: '1px solid #f1f5f9', transition: 'background-color 0.12s' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafbfc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#0f172a', fontWeight: 500 }}>{filter.name}</span>
                      <span style={{ fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#cbd5e1' }}>[{filter.id}]</span>
                      {filter.favorite && <span title="Favorite" style={{ color: '#CA8A04', fontSize: '14px' }}>★</span>}
                    </div>
                    {filter.description && (
                      <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>{filter.description}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#1e293b', fontSize: '13.5px' }}>{filter.owner?.name || <span style={{ color: '#94a3b8' }}>Unknown</span>}</td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontSize: '12.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', backgroundColor: 'transparent' }}>
                    {filter.jql}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <button
                      onClick={() => handleEdit(filter)}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: 'white',
                        color: '#475569',
                        border: '1px solid #e2e8f0',
                        borderRadius: '7px',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: 500
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Filter Modal */}
      {editingFilter && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', width: '520px', maxWidth: '90%',
            borderRadius: '14px', boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>Edit Filter<span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#94a3b8', fontWeight: 400 }}>[{editingFilter.id}]</span></h2>
            </div>

            <div style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: '18px' }}>
                <label style={modalLabel}>Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={modalInput}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={modalLabel}>JQL Query</label>
                <textarea
                  value={editJql}
                  onChange={(e) => setEditJql(e.target.value)}
                  style={{ ...modalInput, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: '88px', fontSize: '13px', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ marginBottom: '4px' }}>
                <label style={modalLabel}>Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{ ...modalInput, minHeight: '64px', lineHeight: 1.5 }}
                />
              </div>
            </div>

            <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafbfc' }}>
              <button
                onClick={() => setEditingFilter(null)}
                style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '9px 18px', border: 'none', borderRadius: '8px',
                  backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Components View ---
interface ComponentsViewProps {
  components: Component[];
  projectKey: string;
  onRefresh: () => void;
  onCreateComponent: (project: string, name: string, description?: string, owner?: string) => Promise<any>;
  onUpdateComponent: (compId: string, updates: any) => Promise<any>;
  onDeleteComponent: (compId: string) => Promise<any>;
  getUsers: (searchString: string) => Promise<any[]>;
}

const ComponentsView = ({ components, projectKey, onRefresh, onCreateComponent, onUpdateComponent, onDeleteComponent, getUsers }: ComponentsViewProps) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Fetch users when modal opens
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const result = await getUsers('@');
      setAvailableUsers(result || []);
    } catch (e) {
      console.error('Failed to fetch users:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    fetchUsers();
  };

  const handleCreate = async () => {
    if (!name) {
      alert('Component name is required');
      return;
    }
    setLoading(true);
    try {
      await onCreateComponent(projectKey, name, description || undefined, owner || undefined);
      setShowCreateModal(false);
      setName('');
      setDescription('');
      setOwner('');
      setAvailableUsers([]);
      onRefresh();
    } catch (e) {
      console.error('Failed to create component:', e);
      alert('Failed to create component: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (component: Component) => {
    setEditingComponent(component);
    setName(component.name);
    setDescription(component.description || '');
    setOwner(component.owner || '');
    fetchUsers();
  };

  const handleUpdate = async () => {
    if (!editingComponent) return;
    setLoading(true);
    try {
      await onUpdateComponent(editingComponent.id, { name, description, owner });
      setEditingComponent(null);
      setName('');
      setDescription('');
      setOwner('');
      setAvailableUsers([]);
      onRefresh();
    } catch (e) {
      console.error('Failed to update component:', e);
      alert('Failed to update component: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (compId: string, compName: string) => {
    if (!confirm(`Are you sure you want to delete component "${compName}"?`)) return;
    try {
      await onDeleteComponent(compId);
      onRefresh();
    } catch (e) {
      console.error('Failed to delete component:', e);
      alert('Failed to delete component: ' + e);
    }
  };

  const thStyle: React.CSSProperties = { padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' };
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Components</h1>
        <button
          onClick={handleOpenCreateModal}
          style={{
            backgroundColor: '#CA8A04',
            color: 'white',
            border: 'none',
            padding: '9px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
          }}
        >
          Create component
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Lead</th>
              <th style={{ ...thStyle, width: '160px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {components.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>🧩</div>
                  <div style={{ fontWeight: 500, color: '#475569', marginBottom: '4px' }}>No components yet</div>
                  <div>Create one to organize your issues.</div>
                </td>
              </tr>
            ) : (
              components.map(comp => (
                <tr key={comp.id} style={{ borderTop: '1px solid #f1f5f9', transition: 'background-color 0.12s' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafbfc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '14px 20px', color: '#0f172a', fontWeight: 500 }}>{comp.name}<span style={{ marginLeft: '6px', fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#cbd5e1', fontWeight: 400 }}>[{comp.id}]</span></td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontSize: '13.5px' }}>{comp.description || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={{ padding: '14px 20px', color: '#1e293b', fontSize: '13.5px' }}>{comp.owner || <span style={{ color: '#94a3b8' }}>Unassigned</span>}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleEdit(comp)}
                        style={{
                          padding: '5px 12px',
                          backgroundColor: 'white',
                          color: '#475569',
                          border: '1px solid #e2e8f0',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          fontWeight: 500
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(comp.id, comp.name)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: 'transparent',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          fontWeight: 500
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Component Modal */}
      {(showCreateModal || editingComponent) && (() => {
        const mLabel: React.CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' };
        const mInput: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '14px', backgroundColor: '#fafbfc', outline: 'none', boxSizing: 'border-box' };
        return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', width: '500px', maxWidth: '90%',
            borderRadius: '14px', boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>
                {editingComponent ? 'Edit Component' : 'Create Component'}
                {editingComponent && <span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#94a3b8', fontWeight: 400 }}>[{editingComponent.id}]</span>}
              </h2>
            </div>

            <div style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: '18px' }}>
                <label style={mLabel}>
                  Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Component name"
                  style={mInput}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={mLabel}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this component..."
                  style={{ ...mInput, minHeight: '88px', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ marginBottom: '4px' }}>
                <label style={mLabel}>Lead</label>
                <select
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  style={mInput}
                  disabled={loadingUsers}
                >
                  <option value="">— No lead (optional) —</option>
                  {availableUsers.map(user => (
                    <option key={user.accountId} value={user.name || user.accountId}>
                      {user.displayName} {user.emailAddress ? `(${user.emailAddress})` : `(@${user.name || user.accountId})`}
                    </option>
                  ))}
                </select>
                {loadingUsers && (
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>Loading users...</p>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafbfc' }}>
              <button
                onClick={() => { setShowCreateModal(false); setEditingComponent(null); setName(''); setDescription(''); setOwner(''); setAvailableUsers([]); }}
                style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                onClick={editingComponent ? handleUpdate : handleCreate}
                disabled={loading}
                style={{
                  padding: '9px 18px', border: 'none', borderRadius: '8px',
                  backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                }}
              >
                {loading ? 'Saving...' : (editingComponent ? 'Save' : 'Create')}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

// --- Versions View ---
interface VersionsViewProps {
  versions: Version[];
  projectKey: string;
  onRefresh: () => void;
  onCreateVersion: (name: string, project: string, description?: string, releaseDate?: string, released?: boolean, archived?: boolean) => Promise<any>;
  onDeleteVersion: (verId: string) => Promise<any>;
  onVersionCreated?: (version: Version) => void;
  onVersionDeleted?: (verId: string) => void;
}

const VersionsView = ({ versions, projectKey, onRefresh, onCreateVersion, onDeleteVersion, onVersionCreated, onVersionDeleted }: VersionsViewProps) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [released, setReleased] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name) {
      alert('Version name is required');
      return;
    }
    setLoading(true);
    try {
      const result = await onCreateVersion(name, projectKey, description || undefined, releaseDate || undefined, released, false);
      // Add created version to state
      if (result && result.version && onVersionCreated) {
        onVersionCreated({
          id: result.version.id,
          name: result.version.name,
          description: result.version.description,
          archived: result.version.archived || false,
          released: result.version.released || false,
          releaseDate: result.version.releaseDate,
          project: projectKey
        });
      }
      setShowCreateModal(false);
      setName('');
      setDescription('');
      setReleaseDate('');
      setReleased(false);
    } catch (e) {
      console.error('Failed to create version:', e);
      alert('Failed to create version: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (verId: string, verName: string) => {
    if (!confirm(`Are you sure you want to delete version "${verName}"?`)) return;
    try {
      await onDeleteVersion(verId);
      if (onVersionDeleted) {
        onVersionDeleted(verId);
      }
    } catch (e) {
      console.error('Failed to delete version:', e);
      alert('Failed to delete version: ' + e);
    }
  };

  const thStyle: React.CSSProperties = { padding: '12px 20px', color: '#64748b', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' };
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>Versions</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            backgroundColor: '#CA8A04',
            color: 'white',
            border: 'none',
            padding: '9px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
          }}
        >
          Create version
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Release Date</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>📦</div>
                  <div style={{ fontWeight: 500, color: '#475569', marginBottom: '4px' }}>No versions yet</div>
                  <div>Create one to track releases.</div>
                </td>
              </tr>
            ) : (
              versions.map(ver => {
                const statusBg = ver.released ? '#dcfce7' : (ver.archived ? '#f1f5f9' : '#fef3c7');
                const statusFg = ver.released ? '#166534' : (ver.archived ? '#475569' : '#854d0e');
                const statusDot = ver.released ? '#16a34a' : (ver.archived ? '#94a3b8' : '#CA8A04');
                const statusText = ver.released ? 'Released' : (ver.archived ? 'Archived' : 'Unreleased');
                return (
                <tr key={ver.id} style={{ borderTop: '1px solid #f1f5f9', transition: 'background-color 0.12s' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafbfc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '14px 20px', color: '#0f172a', fontWeight: 500 }}>{ver.name}<span style={{ marginLeft: '6px', fontSize: '10.5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#cbd5e1', fontWeight: 400 }}>[{ver.id}]</span></td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      backgroundColor: statusBg,
                      color: statusFg
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusDot }} />
                      {statusText}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontSize: '13.5px' }}>{ver.releaseDate || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontSize: '13.5px' }}>{ver.description || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <button
                      onClick={() => handleDelete(ver.id, ver.name)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: 'transparent',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '7px',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: 500
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Version Modal */}
      {showCreateModal && (() => {
        const mLabel: React.CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.02em', textTransform: 'uppercase' };
        const mInput: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '14px', backgroundColor: '#fafbfc', outline: 'none', boxSizing: 'border-box' };
        return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', width: '500px', maxWidth: '90%',
            borderRadius: '14px', boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.05)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>Create Version</h2>
            </div>

            <div style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: '18px' }}>
                <label style={mLabel}>
                  Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., v1.0.0"
                  style={mInput}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={mLabel}>Release Date</label>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  style={mInput}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={mLabel}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this version..."
                  style={{ ...mInput, minHeight: '88px', lineHeight: 1.5 }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    style={{ accentColor: '#CA8A04', width: '15px', height: '15px' }}
                    checked={released}
                    onChange={(e) => setReleased(e.target.checked)}
                  />
                  <span style={{ fontSize: '14px', color: '#1e293b' }}>Mark as released</span>
                </label>
              </div>
            </div>

            <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafbfc' }}>
              <button
                onClick={() => { setShowCreateModal(false); setName(''); setDescription(''); setReleaseDate(''); setReleased(false); }}
                style={{ padding: '9px 16px', border: 'none', background: 'transparent', color: '#475569', fontWeight: 500, fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                style={{
                  padding: '9px 18px', border: 'none', borderRadius: '8px',
                  backgroundColor: '#CA8A04', color: 'white', fontWeight: 600, fontSize: '14px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                }}
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

// --- Main App ---

interface AppProps {
  onClose: () => void;
  setRefreshHandler?: (handler: (() => void) | null) => void;
  openWindow?: (config: { id: string; title: string; content: React.ReactNode; width?: number; height?: number }) => void;
}

const App = ({ onClose, setRefreshHandler, openWindow }: AppProps) => {
  const {
    callTool,
    getProjects, createProject, deleteProject,
    searchIssues, createIssue, updateIssue, deleteIssue, assignIssue,
    bulkDeleteIssues, performBulkIssueOperations, searchIssuesForPicker,
    getIssueCreateMetadata,
    getWorkflows, getPriorities, getIssueTypes,
    getUsers, getUser, createUser, deleteUser,
    getGroup, createGroup, updateGroup, deleteGroup, findGroups,
    getDashboards, getDashboard,
    getFilters, updateFilter,
    getProjectComponents, createComponent, updateComponent, deleteComponent,
    getVersion, createVersion, deleteVersion, getVersionRelatedIssueCounts
  } = useZiraAPI();

  const [projects, setProjects] = useState<Project[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewType>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // New state for dashboards, filters, components, versions
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);

  const loadDataRef = useRef<() => void>(() => {});
  const setRefreshHandlerRef = useRef(setRefreshHandler);
  setRefreshHandlerRef.current = setRefreshHandler;

  // Register refresh handler for admin panel
  useEffect(() => {
    const handler = () => loadDataRef.current();
    setRefreshHandlerRef.current?.(handler);
    return () => {
      setRefreshHandlerRef.current?.(null);
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        await fetchProjects();
        const workflowsData = await getWorkflows();
        if (workflowsData && workflowsData.workflows) {
          setWorkflows(workflowsData.workflows);
        }
        const prioritiesData = await getPriorities();
        if (prioritiesData && prioritiesData.priorities) {
          setPriorities(prioritiesData.priorities);
        }
        const issueTypesData = await getIssueTypes();
        if (issueTypesData && issueTypesData.issueTypes) {
          setIssueTypes(issueTypesData.issueTypes);
        }
        const usersData = await getUsers('@'); // Fetch all users (using '@' to bypass min_length validation since all emails have @)
        if (usersData) {
          setUsers(usersData);
        }

      } catch (e) {
        console.error("Failed to load initial data", e);
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    loadDataRef.current = init;
    init();
  }, [getProjects, getWorkflows, getPriorities, getIssueTypes, getUsers]);

  const fetchProjects = async () => {
    try {
      // setLoading(true); // Handled in init
      const data = await getProjects();
      if (data && data.projects) {
        // Backend doesn't return ID, use Key as ID
        const projectsWithIds = Object.values(data.projects).map((p: any) => ({
          ...p,
          id: p.key
        }));
        setProjects(projectsWithIds);
      }
    } catch (e) {
      console.error("Failed to fetch projects", e);
      setError("Failed to fetch projects");
    } finally {
      // setLoading(false);
    }
  };

  // Issue fetching logic...
  const fetchIssues = useCallback(async (jql: string) => {
    setIssuesLoading(true);
    try {
      const data = await searchIssues(jql);
      if (data && data.issues) {
        setIssues(data.issues);
      }
    } catch (e) {
      console.error("Failed to fetch issues", e);
    } finally {
      setIssuesLoading(false);
    }
  }, [searchIssues]);



  // Effect to load issues when project is selected or view changes
  useEffect(() => {
    if (selectedProjectId && (view === 'issues' || view === 'backlog' || view === 'board')) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (!project) return;

      let jql = `project = "${project.key}"`;
      // Simply refresh for any of these views, add ordering
      jql += ' ORDER BY created DESC';

      console.log('Fetching issues for project:', jql);
      fetchIssues(jql);
    }
  }, [selectedProjectId, view, projects, fetchIssues]);


  const handleCreateProject = () => {
    fetchProjects();
  };

  const handleDeleteProject = async (projectKey: string) => {
    try {
      await deleteProject(projectKey);
      fetchProjects();
      if (selectedProjectId === projectKey) {
        setSelectedProjectId(undefined);
        setView('projects');
      }
    } catch (e) {
      console.error("Failed to delete project", e);
      alert("Failed to delete project: " + e);
    }
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setView('board');
  };

  // Fetch dashboards
  const fetchDashboards = useCallback(async () => {
    try {
      const data = await getDashboards();
      if (data && data.dashboards) {
        setDashboards(data.dashboards);
      }
    } catch (e) {
      console.error("Failed to fetch dashboards", e);
    }
  }, [getDashboards]);

  // Fetch filters
  const fetchFilters = useCallback(async () => {
    try {
      const data = await getFilters();
      if (data && data.filters) {
        setFilters(data.filters);
      }
    } catch (e) {
      console.error("Failed to fetch filters", e);
    }
  }, [getFilters]);

  // Fetch components for a project
  const fetchComponents = useCallback(async (projectKey: string) => {
    try {
      const data = await getProjectComponents(projectKey);
      if (data && data.components) {
        setComponents(data.components);
      }
    } catch (e) {
      console.error("Failed to fetch components", e);
    }
  }, [getProjectComponents]);

  // Fetch versions for a project - merge versions from issues with localStorage persisted versions
  const fetchVersions = useCallback(async (projectKey: string) => {
    try {
      // Get versions from issues
      const data = await searchIssues(`project = "${projectKey}"`, 0, 1000);
      const versionIds = new Set<string>();

      if (data && data.issues) {
        data.issues.forEach((issue: Issue) => {
          (issue.fields.fixVersion || []).forEach((v: any) => {
            if (v.id) {
              versionIds.add(v.id);
            }
          });
        });
      }

      // Fetch full version data for each version ID
      const versionMap = new Map<string, Version>();
      await Promise.all(
        Array.from(versionIds).map(async (verId) => {
          try {
            const fullVersion = await getVersion(verId);
            if (fullVersion) {
              versionMap.set(verId, {
                id: fullVersion.id || verId,
                name: fullVersion.name || verId,
                description: fullVersion.description,
                archived: fullVersion.archived || false,
                released: fullVersion.released || false,
                releaseDate: fullVersion.releaseDate,
                project: projectKey
              });
            }
          } catch (e) {
            // Fallback if version fetch fails
            versionMap.set(verId, {
              id: verId,
              name: verId,
              description: '',
              archived: false,
              released: false,
              project: projectKey
            });
          }
        })
      );

      // Merge with localStorage persisted versions
      const storageKey = `zira_versions_${projectKey}`;
      const storedVersions = localStorage.getItem(storageKey);
      if (storedVersions) {
        try {
          const parsed: Version[] = JSON.parse(storedVersions);
          parsed.forEach((v: Version) => {
            if (!versionMap.has(v.id)) {
              versionMap.set(v.id, v);
            }
          });
        } catch (e) {
          console.error('Failed to parse stored versions', e);
        }
      }

      setVersions(Array.from(versionMap.values()));
    } catch (e) {
      console.error("Failed to fetch versions", e);
    }
  }, [searchIssues, getVersion]);

  // Effect to load data when view changes
  useEffect(() => {
    if (view === 'dashboards') {
      fetchDashboards();
    } else if (view === 'filters') {
      fetchFilters();
    } else if ((view === 'components' || view === 'issues' || view === 'backlog' || view === 'board') && selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        fetchComponents(project.key);
      }
    }
    if (view === 'versions' && selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        fetchVersions(project.key);
      }
    }
  }, [view, selectedProjectId, projects, fetchDashboards, fetchFilters, fetchComponents, fetchVersions]);

  // Handle delete issue
  const handleDeleteIssue = async (issueId: string) => {
    try {
      await deleteIssue(issueId);
      // Refresh issues
      if (selectedProjectId) {
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) {
          fetchIssues(`project = "${project.key}" ORDER BY created DESC`);
        }
      }
      setSelectedIssue(null);
    } catch (e) {
      console.error("Failed to delete issue", e);
      alert("Failed to delete issue: " + e);
    }
  };

  // Handle assign issue
  const handleAssignIssue = async (issueId: string, assigneeName: string | null) => {
    try {
      await assignIssue(issueId, assigneeName);
      // Refresh issues
      if (selectedProjectId) {
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) {
          fetchIssues(`project = "${project.key}" ORDER BY created DESC`);
        }
      }
    } catch (e) {
      console.error("Failed to assign issue", e);
      alert("Failed to assign issue: " + e);
    }
  };

  const handleSearchIssues = (jql: string) => {
    fetchIssues(jql);
  };

  const handleNavigate = (newView: ViewType) => {
    setView(newView);
    if (newView === 'projects') {
      setSelectedProjectId(undefined);
    }
  };

  const handleCreateIssue = async (issueData: any) => {
    if (issueData.startDate && issueData.due_date && issueData.startDate > issueData.due_date) {
      throw new Error('Start Date cannot be after Due Date');
    }
    try {
      await createIssue(issueData);
      setIsCreateModalOpen(false);
      // Refresh issues if we are in a view that shows them
      if (selectedProjectId) {
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) {
          fetchIssues(`project = "${project.key}" ORDER BY created DESC`);
        }
      } else {
        fetchIssues('ORDER BY created DESC');
      }
    } catch (e) {
      console.error("Failed to create issue", e);
      alert("Failed to create issue");
    }
  };

  const handleIssueClick = (issue: Issue) => {
    setSelectedIssue(issue);
  };

  const handleIssueUpdate = async (issueId: string, fields: any) => {
    if (fields.startDate && fields.due_date && fields.startDate > fields.due_date) {
      throw new Error('Start Date cannot be after Due Date');
    }
    try {
      // Optimistic update for status changes (drag and drop)
      if (fields.status) {
        setIssues(prevIssues => prevIssues.map(i =>
          i.id === issueId ? { ...i, fields: { ...i.fields, status: fields.status } } : i
        ));
      }

      await updateIssue(issueId, fields);

      // Full refresh to ensure consistency (especially for other fields)
      if (selectedProjectId) {
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) {
          fetchIssues(`project = "${project.key}" ORDER BY created DESC`);
        }
      } else {
        fetchIssues('ORDER BY created DESC');
      }
    } catch (e) {
      console.error("Failed to update issue", e);
      alert("Failed to update issue");
      // Revert optimistic update if needed? For now simple refresh on error or not.
    }
  };

  const renderContent = () => {
    if (loading) return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8', fontSize: '14px' }}>
        Loading...
      </div>
    );

    if (error) return (
      <div style={{ padding: '32px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#fef2f2', margin: '24px', borderRadius: '12px', fontSize: '14px', fontWeight: 500 }}>
        <span>⚠️</span> Error: {error}
      </div>
    );

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    switch (view) {
      case 'projects':
        return (
          <ProjectList
            projects={projects}
            onCreateProject={handleCreateProject}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
          />
        );
      case 'issues':
      case 'backlog':
        return (
          <IssueList
            issues={issues}
            loading={issuesLoading}
            onSearch={handleSearchIssues}
            projectName={selectedProject?.name}
            projectKey={selectedProject?.key}
            onCreateIssue={() => setIsCreateModalOpen(true)}
            onIssueClick={handleIssueClick}
            users={users}
            onDeleteIssue={handleDeleteIssue}
            onBulkDelete={async (ids) => {
              try {
                await bulkDeleteIssues(ids);
                if (selectedProject) fetchIssues(`project = "${selectedProject.key}" ORDER BY created DESC`);
                else fetchIssues('ORDER BY created DESC');
              } catch (e) { alert('Bulk delete failed: ' + e); }
            }}
            onBulkUpdate={async (updates) => {
              try {
                await performBulkIssueOperations(updates);
                if (selectedProject) fetchIssues(`project = "${selectedProject.key}" ORDER BY created DESC`);
                else fetchIssues('ORDER BY created DESC');
              } catch (e) { alert('Bulk update failed: ' + e); }
            }}
          />
        );
      case 'board':
        return (
          <Board
            issues={issues}
            loading={issuesLoading}
            projectName={selectedProject?.name}
            workflows={workflows}
            onCreateIssue={() => setIsCreateModalOpen(true)}
            onIssueClick={handleIssueClick}
            onIssueDrop={handleIssueUpdate}
          />
        );
      case 'dashboards':
        return (
          <DashboardsView
            dashboards={dashboards}
            onRefresh={fetchDashboards}
          />
        );
      case 'filters':
        return (
          <FiltersView
            filters={filters}
            onRefresh={fetchFilters}
            onUpdateFilter={updateFilter}
          />
        );
      case 'components':
        return (
          <ComponentsView
            components={components}
            projectKey={selectedProject?.key || ''}
            onRefresh={() => selectedProject && fetchComponents(selectedProject.key)}
            onCreateComponent={createComponent}
            onUpdateComponent={updateComponent}
            onDeleteComponent={deleteComponent}
            getUsers={getUsers}
          />
        );
      case 'versions':
        return (
          <VersionsView
            versions={versions}
            projectKey={selectedProject?.key || ''}
            onRefresh={() => selectedProject && fetchVersions(selectedProject.key)}
            onCreateVersion={createVersion}
            onDeleteVersion={deleteVersion}
            onVersionCreated={(version: Version) => {
              setVersions((prev: Version[]) => [...prev, version]);
              // Persist to localStorage
              const storageKey = `zira_versions_${selectedProject?.key || ''}`;
              const stored = localStorage.getItem(storageKey);
              const storedVersions: Version[] = stored ? JSON.parse(stored) : [];
              storedVersions.push(version);
              localStorage.setItem(storageKey, JSON.stringify(storedVersions));
            }}
            onVersionDeleted={(verId: string) => {
              setVersions((prev: Version[]) => prev.filter((v: Version) => v.id !== verId));
              // Remove from localStorage
              const storageKey = `zira_versions_${selectedProject?.key || ''}`;
              const stored = localStorage.getItem(storageKey);
              if (stored) {
                const storedVersions: Version[] = JSON.parse(stored);
                const filtered = storedVersions.filter((v: Version) => v.id !== verId);
                localStorage.setItem(storageKey, JSON.stringify(filtered));
              }
            }}
          />
        );
      case 'users-groups':
        return (
          <UsersGroupsManagement
            getUsers={getUsers}
            getUser={getUser}
            createUser={createUser}
            deleteUser={deleteUser}
            getGroup={getGroup}
            createGroup={createGroup}
            updateGroup={updateGroup}
            deleteGroup={deleteGroup}
            findGroups={findGroups}
          />
        );
      case 'admin':
        return (
          <AdminPanel callTool={callTool} />
        );
      default:
        return <div>Unknown View</div>;
    }
  };

  return (
    <Layout
      sidebar={
        <Sidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={handleSelectProject}
          onNavigate={handleNavigate}
          currentView={view}
        />
      }
      content={renderContent()}
    >
      <CreateIssueModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateIssue}
        projects={projects}
        priorities={priorities}
        issueTypes={issueTypes}
        users={users}
        initialProjectKey={projects.find((p: Project) => p.id === selectedProjectId)?.key}
        statuses={workflows[0]?.steps || ['To Do', 'In Progress', 'Done']}
        components={components}
      />
      <IssueDetailModal
        isOpen={!!selectedIssue}
        onClose={() => setSelectedIssue(null)}
        issue={selectedIssue!}
        onUpdate={handleIssueUpdate}
        onDelete={handleDeleteIssue}
        priorities={priorities}
        issueTypes={issueTypes}
        users={users}
        statuses={workflows[0]?.steps || ['To Do', 'In Progress', 'Done']}
        callTool={callTool}
        components={components}
        versions={versions}
      />
    </Layout>
  );
};

export default App;